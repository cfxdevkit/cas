/**
 * Worker main entrypoint.
 *
 * Reads config from environment variables, wires together SafetyGuard,
 * PriceChecker, KeeperClientImpl, DbJobStore, Executor, and JobPoller,
 * then runs until SIGTERM/SIGINT.
 *
 * Usage:
 *   DATABASE_PATH=./data/cas.db \
 *   EXECUTOR_PRIVATE_KEY=0x... \
 *   AUTOMATION_MANAGER_ADDRESS=0x... \
 *   NETWORK=testnet \
 *   node dist/main.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load the root-level .env (two directories up from worker/src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also allow a local worker/.env to override individual keys
dotenv.config();

import { createPublicClient, http } from 'viem';
import { AuditLogger } from './audit-logger.js';
import { DbJobStore } from './db-job-store.js';
import { Executor } from './executor.js';
import { JobPoller } from './job-poller.js';
import { KeeperClientImpl } from './keeper-client.js';
import { logger } from './logger.js';
import type { PriceSource } from './price-checker.js';
import { PriceChecker } from './price-checker.js';
import { RetryQueue } from './retry-queue.js';
import { SafetyGuard } from './safety-guard.js';

// --------------------------------------------------------------------------
// Conflux eSpace chain definitions (viem)
// --------------------------------------------------------------------------

const CONFLUX_ESPACE_TESTNET = {
  id: 71,
  name: 'Conflux eSpace Testnet',
  network: 'conflux-espace-testnet',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmtestnet.confluxrpc.com'] },
    public: { http: ['https://evmtestnet.confluxrpc.com'] },
  },
} as const;

const CONFLUX_ESPACE_MAINNET = {
  id: 1030,
  name: 'Conflux eSpace',
  network: 'conflux-espace',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evm.confluxrpc.com'] },
    public: { http: ['https://evm.confluxrpc.com'] },
  },
} as const;

const SWAPPI_ROUTER = {
  testnet: '0x873789aaf553fd0b4252d0d2b72c6331c47aff2e',
  mainnet: '0xE37B52296b0bAA91412cD0Cd97975B0805037B84', // Swappi v2 router — confirmed deployed on mainnet (router.factory()=0xe2a6f7c0...)
} as const;

// --------------------------------------------------------------------------
// Config from env
// --------------------------------------------------------------------------

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Required environment variable ${key} is not set`);
  return val;
}

function getConfig() {
  const network = (process.env.NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(`NETWORK must be 'testnet' or 'mainnet', got: ${network}`);
  }

  const rawDbPath = process.env.DATABASE_PATH ?? './data/cas.db';
  // Resolve relative paths from the project root (worker/src → ../../)
  const databasePath = path.isAbsolute(rawDbPath)
    ? rawDbPath
    : path.resolve(__dirname, '../..', rawDbPath);

  return {
    network,
    databasePath,
    executorPrivateKey: requireEnv('EXECUTOR_PRIVATE_KEY') as `0x${string}`,
    contractAddress: requireEnv('AUTOMATION_MANAGER_ADDRESS') as `0x${string}`,
    rpcUrl:
      network === 'testnet'
        ? (process.env.CONFLUX_ESPACE_TESTNET_RPC ??
          'https://evmtestnet.confluxrpc.com')
        : (process.env.CONFLUX_ESPACE_MAINNET_RPC ??
          'https://evm.confluxrpc.com'),
    maxGasPriceGwei: BigInt(process.env.MAX_GAS_PRICE_GWEI ?? '1000'),
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? '15000'),
    dryRun: process.env.DRY_RUN === 'true',
  };
}

// --------------------------------------------------------------------------
// ERC-20 decimals — fetched on-chain & cached
// --------------------------------------------------------------------------

const ERC20_DECIMALS_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Create a function that fetches (and caches) the `decimals()` value of any
 * ERC-20 token directly from the chain.  This is more robust than a static
 * lookup table because it automatically handles every token, including ones
 * we've never seen before.
 */
function createDecimalsResolver(
  publicClient: ReturnType<typeof createPublicClient>
): (token: string) => Promise<number> {
  const cache = new Map<string, number>();
  return async (token: string): Promise<number> => {
    const key = token.toLowerCase();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    try {
      const decimals = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: ERC20_DECIMALS_ABI,
        functionName: 'decimals',
      });
      const d = Number(decimals);
      cache.set(key, d);
      logger.info({ token, decimals: d }, '[DecimalsResolver] fetched on-chain');
      return d;
    } catch (err) {
      // If the call fails (e.g. non-standard token without decimals()),
      // fall back to 18 and cache it so we only log once.
      logger.warn(
        { token, reason: err instanceof Error ? err.message : String(err) },
        '[DecimalsResolver] decimals() call failed — defaulting to 18'
      );
      cache.set(key, 18);
      return 18;
    }
  };
}

// --------------------------------------------------------------------------
// Real on-chain price source via Swappi (UniswapV2-compatible) router
// --------------------------------------------------------------------------

const SWAPPI_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** Wrapped CFX (wCFX) — the standard intermediary for multi-hop swaps.
 *  Addresses confirmed via Swappi router's WETH() view function. */
const WCFX_ADDRESS = {
  testnet: '0x2ed3dddae5b2f321af0806181fbfa6d049be47d8' as `0x${string}`,
  mainnet: '0x14b2d3bc65e74dae1030eafd8ac30c533c976a9b' as `0x${string}`,
} as const;

function createSwappiPriceSource(
  publicClient: ReturnType<typeof createPublicClient>,
  routerAddress: `0x${string}`,
  getDecimals: (token: string) => Promise<number>,
  wCFX: `0x${string}`
): PriceSource {
  /**
   * Try getAmountsOut with the given path.  Returns the final amountOut on
   * success, or null if the call reverts (pair doesn't exist / no liquidity).
   */
  async function tryPath(
    probeAmount: bigint,
    path: `0x${string}`[]
  ): Promise<bigint | null> {
    try {
      const amounts = (await publicClient.readContract({
        address: routerAddress,
        abi: SWAPPI_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [probeAmount, path],
      })) as bigint[];
      return amounts[amounts.length - 1] ?? null;
    } catch {
      return null;
    }
  }

  return {
    async getPrice(tokenIn: string, tokenOut: string): Promise<bigint> {
      // Probe with exactly one whole unit of tokenIn (10^decimals).
      // Decimals are fetched from the on-chain ERC-20 contract and cached.
      const decimalsIn = await getDecimals(tokenIn);
      const decimalsOut = await getDecimals(tokenOut);
      const probeAmount = 10n ** BigInt(decimalsIn);

      const tIn = tokenIn as `0x${string}`;
      const tOut = tokenOut as `0x${string}`;

      // Try 1: direct path [tokenIn, tokenOut]
      let rawAmountOut = await tryPath(probeAmount, [tIn, tOut]);

      // Try 2: route through wCFX [tokenIn, wCFX, tokenOut]
      // Many tokens don't have a direct pool but are both paired with wCFX.
      if (rawAmountOut === null && tIn.toLowerCase() !== wCFX.toLowerCase() && tOut.toLowerCase() !== wCFX.toLowerCase()) {
        rawAmountOut = await tryPath(probeAmount, [tIn, wCFX, tOut]);
        if (rawAmountOut !== null) {
          logger.info(
            { tokenIn, tokenOut },
            '[SwappiPriceSource] direct pair unavailable, routed via wCFX'
          );
        }
      }

      if (rawAmountOut === null) {
        // Both paths failed — no liquidity available on Swappi for this pair.
        logger.warn(
          { tokenIn, tokenOut, decimalsIn, probeAmount: probeAmount.toString() },
          '[SwappiPriceSource] getPrice failed on all paths (direct + wCFX) — re-throwing'
        );
        throw new Error(
          `getAmountsOut reverted for pair ${tokenIn}→${tokenOut}: no liquidity (tried direct + wCFX route)`
        );
      }

      // Normalise the raw amountOut to a 1e18-scaled price so that the
      // PriceChecker comparison with targetPrice (always stored at 1e18
      // scale) is always apples-to-apples.
      //
      // rawAmountOut is in tokenOut's raw units (10^decimalsOut scale).
      // We probed with 1 whole tokenIn, so the human-readable price is:
      //   price = rawAmountOut / 10^decimalsOut   (tokenOut per tokenIn)
      // To express in 1e18 scale:
      //   normalised = rawAmountOut * 10^(18 - decimalsOut)
      if (rawAmountOut === 0n) return 0n;
      const scaleFactor = 10n ** BigInt(18 - decimalsOut);
      const normalised = rawAmountOut * scaleFactor;
      logger.debug(
        { tokenIn, tokenOut, decimalsIn, decimalsOut, rawAmountOut: rawAmountOut.toString(), normalised: normalised.toString() },
        '[SwappiPriceSource] price normalised'
      );
      return normalised;
    },
  };
}

// --------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

async function main() {
  const config = getConfig();

  logger.info(
    { config: { ...config, executorPrivateKey: '[REDACTED]' } },
    '[main] starting worker'
  );

  const chain =
    config.network === 'testnet'
      ? CONFLUX_ESPACE_TESTNET
      : CONFLUX_ESPACE_MAINNET;

  // Wire up all components
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });
  const routerAddress = SWAPPI_ROUTER[config.network];

  // Fetch and cache token decimals from on-chain ERC-20 contracts.
  // No static registry needed — works automatically for every token.
  const getDecimals = createDecimalsResolver(publicClient);
  const swappiPriceSource = createSwappiPriceSource(
    publicClient,
    routerAddress,
    getDecimals,
    WCFX_ADDRESS[config.network]
  );

  const safetyGuard = new SafetyGuard({}, logger);
  const priceChecker = new PriceChecker(swappiPriceSource, new Map(), logger, getDecimals);
  const retryQueue = new RetryQueue({}, logger);
  const _auditLogger = new AuditLogger();

  const keeperClient = new KeeperClientImpl({
    rpcUrl: config.rpcUrl,
    privateKey: config.executorPrivateKey,
    contractAddress: config.contractAddress,
    swappiRouter: SWAPPI_ROUTER[config.network],
    maxGasPriceGwei: config.maxGasPriceGwei,
    chain,
  });

  const jobStore = new DbJobStore(config.databasePath);

  const executor = new Executor(
    priceChecker,
    safetyGuard,
    retryQueue,
    keeperClient,
    jobStore,
    {
      dryRun: config.dryRun,
    }
  );

  const poller = new JobPoller(executor, {
    intervalMs: config.pollIntervalMs,
    onTick: () => {
      // Sync pause flag from DB so backend pause/resume propagates to worker
      safetyGuard.updateConfig({ globalPause: jobStore.getPaused() });
      return jobStore.updateHeartbeat();
    },
  });

  // Start polling
  poller.start();
  logger.info(
    {
      network: config.network,
      dryRun: config.dryRun,
      pollIntervalMs: config.pollIntervalMs,
    },
    '[main] worker running'
  );

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[main] shutting down');
    poller.stop();
    logger.info('[main] shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.error({ err }, '[main] fatal error');
  process.exit(1);
});
