'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Address, formatUnits, parseEventLogs, parseUnits } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import {
  CFX_NATIVE_ADDRESS,
  getPairedTokens,
  resolveTokenInAddress,
  type TokenWithBalance,
  usePoolTokens,
  wcfxAddress,
} from '@/hooks/usePoolTokens';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { useAuthContext } from '@/lib/auth-context';
import {
  AUTOMATION_MANAGER_ABI,
  AUTOMATION_MANAGER_ADDRESS,
  ERC20_ABI,
  MAX_UINT256,
  WCFX_ABI,
} from '@/lib/contracts';

type StrategyKind = 'limit_order' | 'dca';

// ── Tx stepper types ──────────────────────────────────────────────────────────
type TxStepId = 'wrap' | 'approve' | 'onchain' | 'save';
type TxStepStatus = 'idle' | 'active' | 'waiting' | 'done' | 'skipped' | 'error';
interface TxStepDef {
  id: TxStepId;
  label: string;
  detail: string;
  status: TxStepStatus;
  txHash?: `0x${string}`;
}

function _toWeiString(humanValue: string, decimals = 18): string {
  const trimmed = humanValue.trim();
  if (!trimmed || trimmed === '0') return '0';
  return parseUnits(trimmed, decimals).toString();
}

/** Format a balance string for display, capped to 6 significant digits */
function fmtBalance(b: string): string {
  const n = parseFloat(b);
  if (!n) return '';
  if (n < 0.000001) return '<0.000001';
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function StrategyBuilder({
  onSuccess,
  onSubmittingChange,
}: {
  onSuccess?: () => void;
  onSubmittingChange?: (v: boolean) => void;
} = {}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { token } = useAuthContext();

  // Prevent SSR/client hydration mismatch: wagmi reads localStorage on client
  // but returns undefined on server — defer wallet-dependent rendering.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const {
    tokens,
    pairs,
    loading: poolsLoading,
    balancesLoading,
    error: poolsError,
    rpcWarning,
    refresh,
  } = usePoolTokens(mounted ? address : undefined);

  const [kind, setKind] = useState<StrategyKind>('limit_order');
  const [submitting, setSubmitting] = useState(false);
  const [txSteps, setTxSteps] = useState<TxStepDef[] | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlimitedApproval, setUnlimitedApproval] = useState(false);

  // WCFX wrap/unwrap panel state
  const [showWcfxPanel, setShowWcfxPanel] = useState(false);
  const [wcfxPanelTab, setWcfxPanelTab] = useState<'wrap' | 'unwrap'>('wrap');
  const [wrapInput, setWrapInput] = useState('');
  const [unwrapInput, setUnwrapInput] = useState('');
  const [wrapping, setWrapping] = useState(false);
  const [wrapError, setWrapError] = useState<string | null>(null);
  const [wrapSuccess, setWrapSuccess] = useState<string | null>(null);

  // Notify parent (e.g. StrategyModal) when the stepper overlay becomes visible
  // so it can block the close button until all transactions complete.
  useEffect(() => { onSubmittingChange?.(txSteps !== null); }, [onSubmittingChange, txSteps]);

  // Update a single step's status and detail atomically
  const setStep = useCallback(
    (id: TxStepId, status: TxStepStatus, detail: string, txHash?: `0x${string}`) => {
      setTxSteps(prev =>
        prev?.map(s => s.id === id ? { ...s, status, detail, ...(txHash ? { txHash } : {}) } : s) ?? prev
      );
    },
    [],
  );

  // Shared fields
  const [tokenIn, setTokenIn] = useState('');
  const [tokenOut, setTokenOut] = useState('');
  const [slippage, setSlippage] = useState('50'); // bps

  // Derived token info from pool list
  const tokenInInfo = useMemo(
    () => tokens.find((t) => t.address === tokenIn),
    [tokens, tokenIn]
  );
  const tokenOutInfo = useMemo(
    () => tokens.find((t) => t.address === tokenOut),
    [tokens, tokenOut]
  );
  const tokenOutOptions = useMemo(
    () => getPairedTokens(pairs, tokens, tokenIn),
    [pairs, tokens, tokenIn]
  );

  // ── Verified decimals ──────────────────────────────────────────────────────
  // GeckoTerminal may omit decimals for some tokens (returns null).  We keep a
  // per-address cache and do a single on-chain `decimals()` read the first time
  // a token with null decimals is selected.  Native CFX is always 18.
  const verifiedDecimalsRef = useRef<Map<string, number>>(new Map());
  const [tokenInDecimals, setTokenInDecimals] = useState<number>(18);
  const [tokenOutDecimals, setTokenOutDecimals] = useState<number>(18);

  const DECIMALS_ABI = [
    {
      name: 'decimals',
      type: 'function' as const,
      stateMutability: 'view' as const,
      inputs: [],
      outputs: [{ name: '', type: 'uint8' }],
    },
  ] as const;

  useEffect(() => {
    if (
      !tokenIn ||
      tokenIn.toLowerCase() === CFX_NATIVE_ADDRESS.toLowerCase()
    ) {
      setTokenInDecimals(18);
      return;
    }
    const verified = verifiedDecimalsRef.current.get(tokenIn.toLowerCase());
    if (verified != null) {
      setTokenInDecimals(verified);
      return;
    }
    if (tokenInInfo?.decimals != null) {
      setTokenInDecimals(tokenInInfo.decimals);
      return;
    }
    // decimals are null — fetch from the ERC-20 contract
    if (!publicClient) {
      setTokenInDecimals(18);
      return;
    }
    publicClient
      .readContract({
        address: tokenIn as Address,
        abi: DECIMALS_ABI,
        functionName: 'decimals',
      })
      .then((d) => {
        const n = Number(d);
        verifiedDecimalsRef.current.set(tokenIn.toLowerCase(), n);
        setTokenInDecimals(n);
      })
      .catch(() => setTokenInDecimals(18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenIn, tokenInInfo?.decimals, publicClient, DECIMALS_ABI]);

  useEffect(() => {
    if (
      !tokenOut ||
      tokenOut.toLowerCase() === CFX_NATIVE_ADDRESS.toLowerCase()
    ) {
      setTokenOutDecimals(18);
      return;
    }
    const verified = verifiedDecimalsRef.current.get(tokenOut.toLowerCase());
    if (verified != null) {
      setTokenOutDecimals(verified);
      return;
    }
    if (tokenOutInfo?.decimals != null) {
      setTokenOutDecimals(tokenOutInfo.decimals);
      return;
    }
    if (!publicClient) {
      setTokenOutDecimals(18);
      return;
    }
    publicClient
      .readContract({
        address: tokenOut as Address,
        abi: DECIMALS_ABI,
        functionName: 'decimals',
      })
      .then((d) => {
        const n = Number(d);
        verifiedDecimalsRef.current.set(tokenOut.toLowerCase(), n);
        setTokenOutDecimals(n);
      })
      .catch(() => setTokenOutDecimals(18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOut, tokenOutInfo?.decimals, publicClient, DECIMALS_ABI]);

  // WCFX address and balance (for wrap/unwrap utility)
  const wcfxAddr = wcfxAddress() as `0x${string}`;
  const wcfxInfo = useMemo(
    () =>
      tokens.find((t) => t.address.toLowerCase() === wcfxAddr.toLowerCase()),
    [tokens, wcfxAddr]
  );
  const tokenInIsCfx =
    tokenIn.toLowerCase() === CFX_NATIVE_ADDRESS.toLowerCase();

  // Live price from Swappi + USD prices from DeFiLlama
  const {
    swappiPrice,
    tokenInUsd,
    tokenOutUsd,
    loading: priceLoading,
    error: priceError,
    lastUpdated: priceLastUpdated,
    refresh: refreshPrice,
  } = useTokenPrice(
    tokenIn || undefined,
    tokenOut || undefined,
    tokenInDecimals,
    tokenOutDecimals
  );

  // Token In list: prefer tokens the user holds, but always include the currently
  // selected token so switching back (or swapping in↔out) never clears the pill.
  const tokenInOptions = useMemo(() => {
    if (!address) return tokens;
    const held = tokens.filter((t) => BigInt(t.balanceWei) > 0n);
    const base = held.length > 0 ? held : tokens;
    if (tokenIn && !base.find((t) => t.address === tokenIn)) {
      const sel = tokens.find((t) => t.address === tokenIn);
      if (sel) return [sel, ...base];
    }
    return base;
  }, [tokens, address, tokenIn]);

  // Auto-select CFX as default tokenIn once token list is available
  useEffect(() => {
    if (tokenIn || tokens.length === 0) return;
    const cfx = tokens.find(
      (t) => t.address.toLowerCase() === CFX_NATIVE_ADDRESS.toLowerCase()
    );
    if (cfx) setTokenIn(cfx.address);
  }, [tokens, tokenIn]);

  // Auto-select tokenOut: prefer USDT when CFX is selected, otherwise first paired token
  useEffect(() => {
    if (tokenOut || !tokenIn || pairs.length === 0) return;
    const paired = getPairedTokens(pairs, tokens, tokenIn);
    if (paired.length === 0) return;
    const usdt = paired.find((t) => t.symbol.toUpperCase() === 'USDT');
    setTokenOut((usdt ?? paired[0]).address);
  }, [tokenIn, tokenOut, pairs, tokens]);

  // Reset amounts + target price whenever the selected pair changes
  const prevPairRef = useRef('');
  useEffect(() => {
    const pair = `${tokenIn}|${tokenOut}`;
    if (!prevPairRef.current) {
      prevPairRef.current = pair;
      return;
    }
    if (prevPairRef.current === pair) return;
    prevPairRef.current = pair;
    setAmountIn('');
    setAmountPerSwap('');
    setTargetPrice('');
  }, [tokenIn, tokenOut]);

  // Limit-order fields
  const [amountIn, setAmountIn] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState<'gte' | 'lte'>('gte');

  // DCA fields
  const [amountPerSwap, setAmountPerSwap] = useState('');
  const [intervalValue, setIntervalValue] = useState('5');
  const [intervalUnit, setIntervalUnit] = useState<
    'minutes' | 'hours' | 'days' | 'weeks'
  >('minutes');
  const [totalSwaps, setTotalSwaps] = useState('10');

  // Expiry quick-pick (days as string, '' = no expiry)
  const [expiryPreset, setExpiryPreset] = useState<
    '' | '1' | '7' | '30' | '365'
  >('7');

  // Interval in seconds (derived)
  const intervalUnitSecs: Record<string, number> = {
    minutes: 60,
    hours: 3600,
    days: 86400,
    weeks: 604800,
  };
  const intervalSeconds =
    parseInt(intervalValue || '0', 10) *
    (intervalUnitSecs[intervalUnit] ?? 3600);

  // Auto-wrap preview: how much native CFX would need wrapping for current form values
  const requiredPreview = useMemo(() => {
    if (!tokenInIsCfx) return 0n;
    try {
      if (kind === 'limit_order') {
        return amountIn.trim()
          ? parseUnits(amountIn.trim(), tokenInDecimals)
          : 0n;
      }
      const pw = amountPerSwap.trim()
        ? parseUnits(amountPerSwap.trim(), tokenInDecimals)
        : 0n;
      return pw * BigInt(parseInt(totalSwaps, 10) || 1);
    } catch {
      return 0n;
    }
  }, [
    tokenInIsCfx,
    kind,
    amountIn,
    amountPerSwap,
    totalSwaps,
    tokenInDecimals,
  ]);
  const wcfxBalWei = BigInt(wcfxInfo?.balanceWei ?? '0');
  const needsAutoWrap =
    tokenInIsCfx && requiredPreview > wcfxBalWei && requiredPreview > 0n;
  const autoWrapAmount = needsAutoWrap ? requiredPreview - wcfxBalWei : 0n;

  // ── WCFX wrap / unwrap helpers ─────────────────────────────────────────────
  async function handleWrap() {
    setWrapError(null);
    setWrapSuccess(null);
    if (!address || !publicClient) return;
    setWrapping(true);
    try {
      const amount = parseUnits(wrapInput.trim() || '0', 18);
      if (amount <= 0n) {
        setWrapError('Enter an amount.');
        return;
      }
      const feeData = await publicClient.estimateFeesPerGas();
      const mfpg = (feeData.maxFeePerGas * 120n) / 100n;
      const mpfpg = (feeData.maxPriorityFeePerGas * 120n) / 100n;
      const gas = await publicClient.estimateContractGas({
        address: wcfxAddr,
        abi: WCFX_ABI,
        functionName: 'deposit',
        value: amount,
        account: address,
      });
      const hash = await writeContractAsync({
        address: wcfxAddr,
        abi: WCFX_ABI,
        functionName: 'deposit',
        value: amount,
        gas: (gas * 130n) / 100n,
        maxFeePerGas: mfpg,
        maxPriorityFeePerGas: mpfpg,
      });
      await publicClient.waitForTransactionReceipt({
        hash,
        pollingInterval: 2_000,
        timeout: 120_000,
      });
      setWrapSuccess(`${wrapInput} CFX wrapped to wCFX.`);
      setWrapInput('');
      refresh();
    } catch (e: unknown) {
      setWrapError((e as Error).message ?? 'Wrap failed.');
    } finally {
      setWrapping(false);
    }
  }

  async function handleUnwrap() {
    setWrapError(null);
    setWrapSuccess(null);
    if (!address || !publicClient) return;
    setWrapping(true);
    try {
      const amount = parseUnits(unwrapInput.trim() || '0', 18);
      if (amount <= 0n) {
        setWrapError('Enter an amount.');
        return;
      }
      const feeData = await publicClient.estimateFeesPerGas();
      const mfpg = (feeData.maxFeePerGas * 120n) / 100n;
      const mpfpg = (feeData.maxPriorityFeePerGas * 120n) / 100n;
      const gas = await publicClient.estimateContractGas({
        address: wcfxAddr,
        abi: WCFX_ABI,
        functionName: 'withdraw',
        args: [amount],
        account: address,
      });
      const hash = await writeContractAsync({
        address: wcfxAddr,
        abi: WCFX_ABI,
        functionName: 'withdraw',
        args: [amount],
        gas: (gas * 130n) / 100n,
        maxFeePerGas: mfpg,
        maxPriorityFeePerGas: mpfpg,
      });
      await publicClient.waitForTransactionReceipt({
        hash,
        pollingInterval: 2_000,
        timeout: 120_000,
      });
      setWrapSuccess(`${unwrapInput} wCFX unwrapped to CFX.`);
      setUnwrapInput('');
      refresh();
    } catch (e: unknown) {
      setWrapError((e as Error).message ?? 'Unwrap failed.');
    } finally {
      setWrapping(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!token) {
      setError('Sign in first — click "Sign In" in the navbar.');
      setSubmitting(false);
      return;
    }

    if (!address) {
      setError('Connect your wallet first.');
      setSubmitting(false);
      return;
    }

    if (!publicClient) {
      setError('Wallet client not ready — please reload.');
      setSubmitting(false);
      return;
    }

    let activeStepId: TxStepId = 'wrap'; // tracks current step for error attribution

    try {
      let body: object;
      // Resolve CFX (native) → WCFX address before sending to the backend
      const resolvedTokenIn = resolveTokenInAddress(tokenIn);
      const resolvedTokenOut = resolveTokenInAddress(tokenOut);

      // Use EIP-1559 fee estimation (supported since Conflux eSpace v2.4.0).
      // Apply a 20% buffer so txs confirm on the first attempt.
      const feeData = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 120n) / 100n;

      // Helper: estimate gas via our own RPC (not the wallet) with a 30% buffer.
      // Passing explicit `gas` means Rabby/MetaMask receive a fully-specified tx
      // and never need to run their own eth_estimateGas, which avoids the
      // "gas price too low" / "estimation failed" prompts.
      const withGasBuffer = (n: bigint) => (n * 130n) / 100n;

      // ── 1. ERC-20 approval (if allowance insufficient) ───────────────────
      const slippageBps = parseInt(slippage, 10);
      const expiresAtSec = expiryPreset
        ? BigInt(
            Math.floor(Date.now() / 1000) + parseInt(expiryPreset, 10) * 86_400
          )
        : 0n;

      const amountInWei = parseUnits(amountIn.trim() || '0', tokenInDecimals);
      const amountPerSwapWei = parseUnits(
        amountPerSwap.trim() || '0',
        tokenInDecimals
      );

      // How much allowance this strategy needs
      const requiredAllowance =
        kind === 'limit_order'
          ? amountInWei
          : amountPerSwapWei * BigInt(parseInt(totalSwaps, 10) || 1);

      // When CFX native is selected, auto-wrap the shortfall to WCFX, then approve it.
      const tokenInIsNative =
        tokenIn.toLowerCase() === CFX_NATIVE_ADDRESS.toLowerCase();

      // ── Initialise step tracker ────────────────────────────────────────────────────────────
      const tokenSym = tokenInIsNative ? 'wCFX' : (tokenInInfo?.symbol ?? 'token');
      setTxSteps([
        { id: 'wrap',    label: 'Wrap CFX → wCFX',      detail: 'Pending…', status: tokenInIsNative ? 'idle' : 'skipped' },
        { id: 'approve', label: `Approve ${tokenSym}`,  detail: 'Pending…', status: 'idle' },
        { id: 'onchain', label: kind === 'dca' ? 'Register DCA job' : 'Register limit order', detail: 'Pending…', status: 'idle' },
        { id: 'save',    label: 'Save strategy',         detail: 'Pending…', status: 'idle' },
      ]);
      activeStepId = tokenInIsNative ? 'wrap' : 'approve';

      // ── 0. Auto-wrap CFX → wCFX if WCFX balance is insufficient ──────────
      if (tokenInIsNative && requiredAllowance > 0n) {
        activeStepId = 'wrap';
        setStep('wrap', 'active', 'Checking wCFX balance…');
        const wcfxBal = (await publicClient.readContract({
          address: wcfxAddr,
          abi: WCFX_ABI,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (wcfxBal < requiredAllowance) {
          const shortfall = requiredAllowance - wcfxBal;
          const shortfallFmt = parseFloat(formatUnits(shortfall, 18)).toFixed(6);
          setStep('wrap', 'active', `Wrapping ${shortfallFmt} CFX → wCFX…`);
          const wrapGas = await publicClient.estimateContractGas({
            address: wcfxAddr,
            abi: WCFX_ABI,
            functionName: 'deposit',
            value: shortfall,
            account: address,
          });
          const wrapHash = await writeContractAsync({
            address: wcfxAddr,
            abi: WCFX_ABI,
            functionName: 'deposit',
            value: shortfall,
            gas: withGasBuffer(wrapGas),
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
          setStep('wrap', 'waiting', 'Waiting for wrap confirmation…', wrapHash);
          await publicClient.waitForTransactionReceipt({
            hash: wrapHash,
            pollingInterval: 2_000,
            timeout: 120_000,
          });
          setStep('wrap', 'done', `Wrapped ${shortfallFmt} CFX ✓`, wrapHash);
        } else {
          setStep('wrap', 'skipped', 'Sufficient wCFX balance');
        }
      }

      // ── 1. ERC-20 approval (resolvedTokenIn is always ERC-20 — WCFX for native CFX) ──
      activeStepId = 'approve';
      if (requiredAllowance > 0n) {
        setStep('approve', 'active', 'Checking token allowance…');
        const currentAllowance = (await publicClient.readContract({
          address: resolvedTokenIn as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, AUTOMATION_MANAGER_ADDRESS],
        })) as bigint;

        if (currentAllowance < requiredAllowance) {
          const approveAmount = unlimitedApproval
            ? MAX_UINT256
            : requiredAllowance;
          const decimals = tokenInDecimals;
          const sym = tokenInIsNative ? 'wCFX' : (tokenInInfo?.symbol ?? '');
          const totalFormatted = formatUnits(requiredAllowance, decimals);
          const approveLabel = unlimitedApproval
            ? 'unlimited'
            : kind === 'dca'
              ? `${totalFormatted} ${sym} (${amountPerSwap} × ${totalSwaps} orders)`
              : `${totalFormatted} ${sym}`;
          setStep('approve', 'active', `Approve ${approveLabel}…`);
          const approveGas = await publicClient.estimateContractGas({
            address: resolvedTokenIn as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [AUTOMATION_MANAGER_ADDRESS, approveAmount],
            account: address,
          });
          const approveTxHash = await writeContractAsync({
            address: resolvedTokenIn as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [AUTOMATION_MANAGER_ADDRESS, approveAmount],
            gas: withGasBuffer(approveGas),
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
          setStep('approve', 'waiting', 'Waiting for approval confirmation…', approveTxHash);
          await publicClient.waitForTransactionReceipt({
            hash: approveTxHash,
            pollingInterval: 2_000,
            timeout: 120_000,
          });
          setStep('approve', 'done', `Approved ${approveLabel} ✓`, approveTxHash);
        } else {
          setStep('approve', 'skipped', 'Allowance already sufficient');
        }
      } else {
        setStep('approve', 'skipped', 'No approval needed');
      }

      // ── 2. Register job on-chain ──────────────────────────────────────────
      // The AutomationManager generates a bytes32 jobId on-chain and emits
      // JobCreated.  We read that event and store it alongside the DB record
      // so the keeper knows which on-chain job to execute.

      let onChainJobId: string | null = null;

      try {
        let txHash: `0x${string}`;

        activeStepId = 'onchain';
        if (kind === 'limit_order') {
          const targetPriceWei = parseUnits(targetPrice.trim() || '0', 18);
          const expectedOut =
            targetPriceWei > 0n
              ? (amountInWei * targetPriceWei) / BigInt(10 ** 18)
              : 0n;
          const minAmountOut =
            (expectedOut * BigInt(10000 - slippageBps)) / 10000n;

          setStep('onchain', 'active', 'Register limit order (confirm in wallet)…');
          const loArgs = [
            {
              tokenIn: resolvedTokenIn as `0x${string}`,
              tokenOut: resolvedTokenOut as `0x${string}`,
              amountIn: amountInWei,
              minAmountOut,
              targetPrice: targetPriceWei,
              triggerAbove: direction === 'gte',
            },
            BigInt(slippageBps),
            expiresAtSec,
          ] as const;
          const loGas = await publicClient.estimateContractGas({
            address: AUTOMATION_MANAGER_ADDRESS,
            abi: AUTOMATION_MANAGER_ABI,
            functionName: 'createLimitOrder',
            args: loArgs,
            account: address,
          });
          txHash = await writeContractAsync({
            address: AUTOMATION_MANAGER_ADDRESS,
            abi: AUTOMATION_MANAGER_ABI,
            functionName: 'createLimitOrder',
            args: loArgs,
            gas: withGasBuffer(loGas),
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
        } else {
          setStep('onchain', 'active', 'Register DCA job (confirm in wallet)…');
          const dcaArgs = [
            {
              tokenIn: resolvedTokenIn as `0x${string}`,
              tokenOut: resolvedTokenOut as `0x${string}`,
              amountPerSwap: amountPerSwapWei,
              intervalSeconds: BigInt(intervalSeconds),
              totalSwaps: BigInt(parseInt(totalSwaps, 10)),
              swapsCompleted: 0n,
              nextExecution: 0n,
            },
            BigInt(slippageBps),
            expiresAtSec,
          ] as const;
          const dcaGas = await publicClient.estimateContractGas({
            address: AUTOMATION_MANAGER_ADDRESS,
            abi: AUTOMATION_MANAGER_ABI,
            functionName: 'createDCAJob',
            args: dcaArgs,
            account: address,
          });
          txHash = await writeContractAsync({
            address: AUTOMATION_MANAGER_ADDRESS,
            abi: AUTOMATION_MANAGER_ABI,
            functionName: 'createDCAJob',
            args: dcaArgs,
            gas: withGasBuffer(dcaGas),
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
        }

        // ── 3. Parse JobCreated event to get bytes32 jobId ──────────────────
        setStep('onchain', 'waiting', `Waiting for confirmation… (tx ${txHash.slice(0, 10)}…)`, txHash);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: 2_000, // poll every 2 s (Conflux block time ~2-3 s)
          timeout: 120_000, // give up after 2 min
        });
        const logs = parseEventLogs({
          abi: AUTOMATION_MANAGER_ABI,
          eventName: 'JobCreated',
          logs: receipt.logs,
        });

        if (logs.length > 0) {
          onChainJobId = logs[0].args.jobId as string;
        } else {
          // Transaction confirmed but log not found — proceed without it
          // (worker will skip execution until onChainJobId is set)
          console.warn(
            '[StrategyBuilder] JobCreated log not found in receipt',
            receipt.transactionHash
          );
        }
        setStep(
          'onchain', 'done',
          onChainJobId ? `Registered ✓ (job ${onChainJobId.slice(0, 10)}…)` : 'Registered ✓',
          txHash,
        );
      } catch (contractErr: unknown) {
        const msg = (contractErr as Error).message ?? String(contractErr);
        // Viem throws "could not be found" when waitForTransactionReceipt times out.
        // The tx may still confirm — give user a clear message with the tx hash.
        if (msg.includes('could not be found') || msg.includes('timed out')) {
          throw new Error(
            `On-chain registration timed out waiting for confirmation. ` +
              `The transaction may still confirm — check your wallet activity or ConfluxScan. ` +
              `If it confirms, re-open the Create page; the strategy will not be double-registered.`
          );
        }
        throw new Error(`On-chain registration failed: ${msg}`);
      }

      // ── 4. Build backend body ─────────────────────────────────────────────
      activeStepId = 'save';
      setStep('save', 'active', 'Saving strategy…');
      if (kind === 'limit_order') {
        const targetPriceWei = parseUnits(targetPrice.trim() || '0', 18);
        // minAmountOut = amountIn * targetPrice/1e18 * (1 - slippage)
        const expectedOut =
          targetPriceWei > 0n
            ? (amountInWei * targetPriceWei) / BigInt(10 ** 18)
            : 0n;
        const minAmountOut =
          (expectedOut * BigInt(10000 - slippageBps)) / 10000n;

        body = {
          type: 'limit_order',
          params: {
            tokenIn: resolvedTokenIn,
            tokenOut: resolvedTokenOut,
            amountIn: amountInWei.toString(),
            minAmountOut: minAmountOut.toString(),
            targetPrice: targetPriceWei.toString(),
            direction,
          },
          ...(onChainJobId ? { onChainJobId } : {}),
          ...(expiryPreset
            ? {
                expiresAt: Date.now() + parseInt(expiryPreset, 10) * 86_400_000,
              }
            : {}),
        };
      } else {
        body = {
          type: 'dca',
          params: {
            tokenIn: resolvedTokenIn,
            tokenOut: resolvedTokenOut,
            amountPerSwap: amountPerSwapWei.toString(),
            intervalSeconds,
            totalSwaps: parseInt(totalSwaps, 10),
            swapsCompleted: 0,
            nextExecution: 0,
          },
          ...(onChainJobId ? { onChainJobId } : {}),
        };
      }

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      setStep('save', 'done', 'Strategy saved ✓');
      // Refresh balances + reset form (hidden under stepper, ready for next use)
      refresh();
      setAmountIn('');
      setAmountPerSwap('');
      setTargetPrice('');
      setExpiryPreset('');
      setError(null);
      // Stepper shows success state; user clicks “View Strategies” to close
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      setError(msg);
      setStep(activeStepId, 'error', msg.slice(0, 120));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived display values ──────────────────────────────────────────────────
  const amountInNum = parseFloat(amountIn || '0');
  const targetPriceNum = parseFloat(targetPrice || '0');
  const estimatedOut =
    amountInNum > 0 && targetPriceNum > 0
      ? (amountInNum * targetPriceNum).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })
      : '0.0';
  const amountInUsd =
    tokenInUsd != null && amountInNum > 0
      ? (amountInNum * tokenInUsd).toFixed(2)
      : null;
  const estimatedOutUsd =
    tokenOutUsd != null && amountInNum > 0 && targetPriceNum > 0
      ? (amountInNum * targetPriceNum * tokenOutUsd).toFixed(2)
      : null;

  const amountPerSwapNum = parseFloat(amountPerSwap || '0');
  const perTradeUsd =
    tokenInUsd != null && amountPerSwapNum > 0
      ? (amountPerSwapNum * tokenInUsd).toFixed(2)
      : null;
  const totalSwapsNum = parseInt(totalSwaps || '1', 10) || 1;

  // When CFX native is selected, the effective sellable balance is native CFX + WCFX
  // because auto-wrap bridges the gap at submission time.
  const CFX_GAS_RESERVE = 100_000_000_000_000_000n; // 0.1 CFX reserved for wrap + approve + create gas
  const cfxNativeWei = tokenInIsCfx
    ? BigInt(tokenInInfo?.balanceWei ?? '0')
    : 0n;
  const cfxEffectiveWei = tokenInIsCfx
    ? cfxNativeWei + wcfxBalWei > CFX_GAS_RESERVE
      ? cfxNativeWei + wcfxBalWei - CFX_GAS_RESERVE
      : 0n
    : 0n;
  const cfxEffectiveFormatted = tokenInIsCfx
    ? formatUnits(cfxNativeWei + wcfxBalWei, 18)
    : '';
  const cfxMaxFormatted = tokenInIsCfx ? formatUnits(cfxEffectiveWei, 18) : '';

  const inBalanceLabel =
    tokenInIsCfx && wcfxBalWei > 0n
      ? `${fmtBalance(formatUnits(cfxNativeWei, 18))} CFX + ${fmtBalance(formatUnits(wcfxBalWei, 18))} wCFX`
      : tokenInInfo
        ? fmtBalance(tokenInInfo.balanceFormatted) || '0.00'
        : '0.00';
  const inBalance = tokenInIsCfx
    ? fmtBalance(cfxEffectiveFormatted) || '0.00'
    : tokenInInfo
      ? fmtBalance(tokenInInfo.balanceFormatted) || '0.00'
      : '0.00';
  const outBalance = tokenOutInfo
    ? fmtBalance(tokenOutInfo.balanceFormatted) || '0.00'
    : '0.00';

  // Swap token in ↔ out; invert the target price so the displayed rate stays correct
  const swapTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    if (targetPrice) {
      const p = parseFloat(targetPrice);
      if (p > 0) setTargetPrice((1 / p).toFixed(6));
    }
  };

  // Set target price as market +/– pct
  const applyPct = (pct: number) => {
    const base = parseFloat(swappiPrice ?? '0');
    if (!base) return;
    setTargetPrice((base * (1 + pct / 100)).toFixed(6));
  };

  const EXPIRY_LABELS: Record<string, string> = {
    '1': '1 Day',
    '7': '1 Week',
    '30': '1 Month',
    '365': '1 Year',
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[480px] space-y-1">
      {/* ── Tx stepper overlay (replaces form content during submission) ─────── */}
      {txSteps !== null && (
        <TxStepperPanel
          steps={txSteps}
          error={error}
          onRetry={() => { setTxSteps(null); setError(null); }}
          onDone={() => { setTxSteps(null); onSuccess?.(); }}
          chainId={chainId}
        />
      )}
      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      {txSteps === null && (<>
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-3">
        {(['limit_order', 'dca'] as StrategyKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              kind === k
                ? 'bg-slate-700 text-white ring-1 ring-conflux-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {k === 'limit_order' ? 'Limit' : 'DCA'}
          </button>
        ))}
      </div>

      {/* ── Banners ──────────────────────────────────────────────────────── */}
      {mounted && poolsError && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded-lg px-3 py-2 mb-2">
          <span>⚠ Could not load token list: {poolsError}</span>
          <button type="button" onClick={refresh} className="underline ml-auto">
            Retry
          </button>
        </div>
      )}
      {mounted && rpcWarning && !poolsError && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2 mb-2">
          <span>⚠ Balance fetch degraded. Shown balances may be stale.</span>
          <button type="button" onClick={refresh} className="underline ml-auto">
            Retry
          </button>
        </div>
      )}
      {mounted && priceError && tokenIn && tokenOut && (
        <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-950 border border-orange-800 rounded-lg px-3 py-2 mb-2">
          <span>⚠ {priceError}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 text-xs text-green-300 bg-green-950 border border-green-700 rounded-lg px-3 py-2 mb-2">
          <span>✓ {successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="ml-auto text-green-500 hover:text-green-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ══════════════════ LIMIT ORDER ═══════════════════════════════════ */}
      {kind === 'limit_order' && (
        <>
          {/* Sell panel */}
          <AmountPanel
            label="Sell"
            amount={amountIn}
            onAmountChange={setAmountIn}
            onMax={
              tokenInInfo
                ? () =>
                    setAmountIn(
                      tokenInIsCfx
                        ? cfxMaxFormatted
                        : tokenInInfo.balanceFormatted
                    )
                : undefined
            }
            tokens={mounted ? tokenInOptions : []}
            selectedToken={tokenIn}
            onTokenChange={(v) => {
              setTokenIn(v);
              setTokenOut('');
            }}
            usdValue={amountInUsd}
            priceLoading={priceLoading}
            balance={
              tokenInIsCfx && wcfxBalWei > 0n ? inBalanceLabel : inBalance
            }
            balancesLoading={balancesLoading}
            loading={!mounted || poolsLoading}
            placeholder={
              address && tokenInOptions.length < tokens.length
                ? `${tokenInOptions.length} tokens in wallet…`
                : 'Select token…'
            }
          />

          {/* WCFX wrap/unwrap utility — shown when CFX native is selected as tokenIn */}
          {tokenInIsCfx && mounted && address && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowWcfxPanel((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>
                  wCFX in wallet:&nbsp;
                  <span
                    className={
                      parseFloat(wcfxInfo?.balanceFormatted ?? '0') > 0
                        ? 'text-green-400 font-medium'
                        : 'text-slate-500'
                    }
                  >
                    {fmtBalance(wcfxInfo?.balanceFormatted ?? '0') ||
                      '0.000000'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {needsAutoWrap && (
                    <span className="text-amber-400">
                      ⟳ {parseFloat(formatUnits(autoWrapAmount, 18)).toFixed(6)}{' '}
                      CFX will auto-wrap
                    </span>
                  )}
                  <span className="text-slate-500">
                    {showWcfxPanel ? '▲' : '▼'} manage
                  </span>
                </span>
              </button>
              {showWcfxPanel && (
                <div className="px-3 pb-3 border-t border-slate-700 space-y-2 pt-2">
                  <div className="flex gap-2 items-center">
                    {(['wrap', 'unwrap'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setWcfxPanelTab(tab)}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                          wcfxPanelTab === tab
                            ? 'bg-conflux-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {tab === 'wrap' ? 'CFX → wCFX' : 'wCFX → CFX'}
                      </button>
                    ))}
                    <span className="ml-auto text-slate-500">
                      {wcfxPanelTab === 'wrap'
                        ? `Available: ${fmtBalance(tokenInInfo?.balanceFormatted ?? '0') || '0'} CFX`
                        : `Available: ${fmtBalance(wcfxInfo?.balanceFormatted ?? '0') || '0'} wCFX`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wcfxPanelTab === 'wrap' ? wrapInput : unwrapInput}
                      onChange={(e) =>
                        wcfxPanelTab === 'wrap'
                          ? setWrapInput(e.target.value)
                          : setUnwrapInput(e.target.value)
                      }
                      placeholder="0.0"
                      className="flex-1 bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-conflux-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        wcfxPanelTab === 'wrap'
                          ? setWrapInput(tokenInInfo?.balanceFormatted ?? '0')
                          : setUnwrapInput(wcfxInfo?.balanceFormatted ?? '0')
                      }
                      className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                    >
                      Max
                    </button>
                  </div>
                  {wrapError && <p className="text-red-400">{wrapError}</p>}
                  {wrapSuccess && (
                    <p className="text-green-400">✓ {wrapSuccess}</p>
                  )}
                  <button
                    type="button"
                    disabled={wrapping || !address}
                    onClick={
                      wcfxPanelTab === 'wrap' ? handleWrap : handleUnwrap
                    }
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
                  >
                    {wrapping
                      ? 'Waiting for confirmation…'
                      : wcfxPanelTab === 'wrap'
                        ? `Wrap ${wrapInput || '…'} CFX → wCFX`
                        : `Unwrap ${unwrapInput || '…'} wCFX → CFX`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* "When N tokenIn is worth" ─ target price panel */}
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span className="inline-flex items-center gap-1">
                When 1
                <TokenPill token={tokenInInfo} fallback="?" />
                {tokenInInfo?.symbol ?? '—'} is worth
              </span>
              <button
                type="button"
                onClick={swapTokens}
                title="Swap tokens"
                className="w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 transition-colors"
              >
                ⇅
              </button>
            </div>
            {/* Current market price strip */}
            {mounted && tokenInInfo && tokenOutInfo && (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <span>Market:</span>
                {priceLoading ? (
                  <span className="animate-pulse text-slate-600">
                    fetching…
                  </span>
                ) : swappiPrice ? (
                  <span className="text-conflux-400 font-medium">
                    {swappiPrice} {tokenOutInfo.symbol}
                  </span>
                ) : (
                  <span className="text-orange-500">unavailable</span>
                )}
                {tokenInUsd != null && (
                  <span className="ml-1 text-slate-600">
                    (${tokenInUsd.toFixed(3)})
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    refreshPrice();
                    refresh();
                  }}
                  title="Refresh price &amp; balances"
                  className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"
                >
                  {priceLoading ? (
                    <span className="animate-spin inline-block">↻</span>
                  ) : (
                    '↻'
                  )}
                </button>
                {priceLastUpdated && !priceLoading && (
                  <ElapsedLabel since={priceLastUpdated} />
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              {priceLoading && !targetPrice ? (
                <div className="flex-1 h-10 bg-slate-700 rounded-lg animate-pulse" />
              ) : (
                <input
                  type="text"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder={swappiPrice ?? '0.00'}
                  className="flex-1 bg-transparent text-3xl font-semibold text-white placeholder-slate-600 focus:outline-none min-w-0"
                />
              )}
              <TokenSelectButton
                tokens={mounted ? (tokenIn ? tokenOutOptions : tokens) : []}
                value={tokenOut}
                onChange={setTokenOut}
                loading={!mounted || poolsLoading}
              />
            </div>
            {/* Trigger price in USD */}
            {mounted && tokenOutUsd != null && targetPriceNum > 0 && (
              <div className="text-xs text-slate-500">
                ≈{' '}
                <span className="text-slate-400">
                  $
                  {(targetPriceNum * tokenOutUsd).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}
                </span>{' '}
                per {tokenInInfo?.symbol ?? 'token'} at trigger
              </div>
            )}

            {/* Presets + direction toggle */}
            <div className="flex gap-2 items-center">
              <button
                type="button"
                disabled={priceLoading || !swappiPrice}
                onClick={() => swappiPrice && setTargetPrice(swappiPrice)}
                className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {priceLoading ? (
                  <span className="animate-pulse">…</span>
                ) : (
                  'Market'
                )}
              </button>
              {[1, 5, 10].map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={priceLoading || !swappiPrice}
                  onClick={() => applyPct(direction === 'gte' ? p : -p)}
                  className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {direction === 'gte' ? '+' : '-'}
                  {p}%
                </button>
              ))}
              {/* Direction toggle — clearly describes the trigger condition */}
              <button
                type="button"
                onClick={() =>
                  setDirection((d) => (d === 'gte' ? 'lte' : 'gte'))
                }
                title={
                  direction === 'gte'
                    ? 'Currently: execute when price rises to target. Click to flip.'
                    : 'Currently: execute when price drops to target. Click to flip.'
                }
                className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  direction === 'gte'
                    ? 'border-green-700 text-green-400 bg-green-950 hover:bg-green-900'
                    : 'border-red-700 text-red-400 bg-red-950 hover:bg-red-900'
                }`}
              >
                {direction === 'gte' ? '▲ price ≥ target' : '▼ price ≤ target'}
              </button>
            </div>
            {/* Contextual hint */}
            <p className="text-xs text-slate-500">
              {direction === 'gte'
                ? `Swap when price rises to target (take profit / sell high).`
                : `Swap when price falls to target (stop-loss). To buy ${tokenOutInfo?.symbol ?? 'the output token'} on a dip, flip the pair with ⇅.`}
            </p>
          </div>

          {/* Swap arrow */}
          <SwapArrow onClick={swapTokens} />

          {/* Buy panel (read-only estimated output) */}
          <AmountPanel
            label="Buy"
            amount={estimatedOut !== '0.0' ? estimatedOut : ''}
            onAmountChange={() => undefined}
            tokens={mounted ? (tokenIn ? tokenOutOptions : tokens) : []}
            selectedToken={tokenOut}
            onTokenChange={setTokenOut}
            usdValue={estimatedOutUsd}
            priceLoading={priceLoading}
            balance={outBalance}
            balancesLoading={balancesLoading}
            loading={!mounted || poolsLoading}
            placeholder="Select token…"
            readOnly
          />

          {/* Expiry */}
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-sm text-slate-400 mr-1">Expiry</span>
            <span
              title="Order will be cancelled after this period"
              className="text-slate-500 text-xs cursor-default"
            >
              ⓘ
            </span>
            <div className="flex gap-2 ml-auto">
              {(['1', '7', '30', '365'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setExpiryPreset(expiryPreset === d ? '' : d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    expiryPreset === d
                      ? 'bg-conflux-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {EXPIRY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ DCA ═══════════════════════════════════════════ */}
      {kind === 'dca' && (
        <>
          {/* Price info strip */}
          {mounted && swappiPrice && tokenInInfo && tokenOutInfo && (
            <div className="text-sm text-conflux-400 pb-1 flex items-center gap-1">
              <span className="text-slate-400">↗</span>
              <span>1 {tokenInInfo.symbol}</span>
              {tokenInUsd != null && (
                <span className="text-slate-500">
                  (${tokenInUsd.toFixed(2)})
                </span>
              )}
              <span className="text-slate-400">
                = {swappiPrice} {tokenOutInfo.symbol}
              </span>
              {tokenOutUsd != null && (
                <span className="text-slate-500">
                  (${tokenOutUsd.toFixed(2)})
                </span>
              )}
            </div>
          )}

          {/* Allocate panel (tokenIn + total amount) */}
          <AmountPanel
            label="Allocate"
            amount={amountPerSwap}
            onAmountChange={setAmountPerSwap}
            onMax={
              tokenInInfo
                ? () => {
                    const totalWei = tokenInIsCfx
                      ? cfxEffectiveWei
                      : BigInt(tokenInInfo.balanceWei ?? '0');
                    const perSwapWei =
                      totalSwapsNum > 0
                        ? totalWei / BigInt(totalSwapsNum)
                        : totalWei;
                    setAmountPerSwap(formatUnits(perSwapWei, tokenInDecimals));
                  }
                : undefined
            }
            tokens={mounted ? tokenInOptions : []}
            selectedToken={tokenIn}
            onTokenChange={(v) => {
              setTokenIn(v);
              setTokenOut('');
            }}
            usdValue={perTradeUsd}
            priceLoading={priceLoading}
            balance={
              tokenInIsCfx && wcfxBalWei > 0n ? inBalanceLabel : inBalance
            }
            balancesLoading={balancesLoading}
            loading={!mounted || poolsLoading}
            placeholder="Select token…"
          />

          {/* WCFX wrap/unwrap utility — shown when CFX native is selected as tokenIn */}
          {tokenInIsCfx && mounted && address && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowWcfxPanel((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>
                  wCFX in wallet:&nbsp;
                  <span
                    className={
                      parseFloat(wcfxInfo?.balanceFormatted ?? '0') > 0
                        ? 'text-green-400 font-medium'
                        : 'text-slate-500'
                    }
                  >
                    {fmtBalance(wcfxInfo?.balanceFormatted ?? '0') ||
                      '0.000000'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {needsAutoWrap && (
                    <span className="text-amber-400">
                      ⟳ {parseFloat(formatUnits(autoWrapAmount, 18)).toFixed(6)}{' '}
                      CFX will auto-wrap
                    </span>
                  )}
                  <span className="text-slate-500">
                    {showWcfxPanel ? '▲' : '▼'} manage
                  </span>
                </span>
              </button>
              {showWcfxPanel && (
                <div className="px-3 pb-3 border-t border-slate-700 space-y-2 pt-2">
                  <div className="flex gap-2 items-center">
                    {(['wrap', 'unwrap'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setWcfxPanelTab(tab)}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                          wcfxPanelTab === tab
                            ? 'bg-conflux-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {tab === 'wrap' ? 'CFX → wCFX' : 'wCFX → CFX'}
                      </button>
                    ))}
                    <span className="ml-auto text-slate-500">
                      {wcfxPanelTab === 'wrap'
                        ? `Available: ${fmtBalance(tokenInInfo?.balanceFormatted ?? '0') || '0'} CFX`
                        : `Available: ${fmtBalance(wcfxInfo?.balanceFormatted ?? '0') || '0'} wCFX`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wcfxPanelTab === 'wrap' ? wrapInput : unwrapInput}
                      onChange={(e) =>
                        wcfxPanelTab === 'wrap'
                          ? setWrapInput(e.target.value)
                          : setUnwrapInput(e.target.value)
                      }
                      placeholder="0.0"
                      className="flex-1 bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-conflux-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        wcfxPanelTab === 'wrap'
                          ? setWrapInput(tokenInInfo?.balanceFormatted ?? '0')
                          : setUnwrapInput(wcfxInfo?.balanceFormatted ?? '0')
                      }
                      className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                    >
                      Max
                    </button>
                  </div>
                  {wrapError && <p className="text-red-400">{wrapError}</p>}
                  {wrapSuccess && (
                    <p className="text-green-400">✓ {wrapSuccess}</p>
                  )}
                  <button
                    type="button"
                    disabled={wrapping || !address}
                    onClick={
                      wcfxPanelTab === 'wrap' ? handleWrap : handleUnwrap
                    }
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-sm"
                  >
                    {wrapping
                      ? 'Waiting for confirmation…'
                      : wcfxPanelTab === 'wrap'
                        ? `Wrap ${wrapInput || '…'} CFX → wCFX`
                        : `Unwrap ${unwrapInput || '…'} wCFX → CFX`}
                  </button>
                </div>
              )}
            </div>
          )}

          <SwapArrow />

          {/* Buy panel (tokenOut, no amount field) */}
          <div className="bg-slate-800 rounded-2xl p-4 space-y-2">
            <span className="text-sm text-slate-400">Buy</span>
            <div className="flex items-center justify-end">
              <div className="ml-auto flex flex-col items-end gap-1">
                <TokenSelectButton
                  tokens={mounted ? (tokenIn ? tokenOutOptions : tokens) : []}
                  value={tokenOut}
                  onChange={setTokenOut}
                  loading={!mounted || poolsLoading}
                  placeholder="Select token"
                />
                {tokenOutInfo && (
                  <span className="text-xs text-slate-500">
                    🪙 {outBalance}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Every N <unit> */}
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm text-slate-300 font-medium w-14">
                Every
              </span>
              <span
                title="How often to execute a swap"
                className="text-slate-500 text-xs cursor-default"
              >
                ⓘ
              </span>
              <div className="flex gap-2 flex-1">
                <input
                  type="number"
                  min="1"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-conflux-500"
                />
                <select
                  value={intervalUnit}
                  onChange={(e) =>
                    setIntervalUnit(e.target.value as typeof intervalUnit)
                  }
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-conflux-500"
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
              </div>
            </div>

            {/* Over N orders */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm text-slate-300 font-medium w-14">
                Over
              </span>
              <span
                title="Total number of swaps to execute"
                className="text-slate-500 text-xs cursor-default"
              >
                ⓘ
              </span>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  value={totalSwaps}
                  onChange={(e) => setTotalSwaps(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-conflux-500 pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
                  Orders
                </span>
              </div>
            </div>

            {/* Per-trade summary */}
            <p className="text-sm text-slate-500 px-1">
              {amountPerSwapNum > 0 ? (
                <>
                  {amountPerSwapNum.toLocaleString()}{' '}
                  {tokenInInfo?.symbol ?? 'token'} per trade{' '}
                  {priceLoading ? (
                    <span className="animate-pulse text-slate-600">($…)</span>
                  ) : perTradeUsd != null ? (
                    `($${perTradeUsd})`
                  ) : null}{' '}
                  · {totalSwapsNum} orders
                  {totalSwapsNum > 1 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-slate-400">
                        total{' '}
                        {(amountPerSwapNum * totalSwapsNum).toLocaleString()}{' '}
                        {tokenInInfo?.symbol ?? 'token'}
                      </span>
                    </>
                  )}
                </>
              ) : (
                `0 ${tokenInInfo?.symbol ?? 'token'} per trade ($0)`
              )}
            </p>
          </div>
        </>
      )}

      {/* ── Slippage ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1 pt-2">
        <span className="text-xs text-slate-500">Slippage</span>
        {['25', '50', '100'].map((bps) => (
          <button
            key={bps}
            type="button"
            onClick={() => setSlippage(bps)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              slippage === bps
                ? 'bg-conflux-700 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {parseInt(bps, 10) / 100}%
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {parseInt(slippage, 10) / 100}%
        </span>
      </div>

      {/* ── Approval amount ──────────────────────────────────────────────── */}
      {tokenIn && (
        <div className="flex items-center gap-2 px-1 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unlimitedApproval}
              onChange={() => setUnlimitedApproval((v) => !v)}
              className="sr-only"
            />
            <div
              aria-hidden="true"
              className={`w-8 h-4 rounded-full transition-colors relative ${
                unlimitedApproval ? 'bg-conflux-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  unlimitedApproval ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-xs text-slate-400">Unlimited approval</span>
          </label>
          <span className="text-xs text-slate-600 ml-1">
            {unlimitedApproval
              ? 'Approve once, reuse for future strategies'
              : `Approve exact amount only`}
          </span>
        </div>
      )}

      {/* ── Error & submit ───────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !mounted}
        className="w-full bg-conflux-600 hover:bg-conflux-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-2xl transition-colors text-base mt-2"
      >
        {!mounted ? 'Loading…' : !address ? 'Connect wallet' : 'Create Strategy'}
      </button>

      {/* Disclaimer */}
      <div className="flex gap-2 items-start text-xs text-slate-500 px-1 pt-1">
        <span className="mt-0.5 shrink-0">▲</span>
        <p>
          {kind === 'limit_order'
            ? 'Limit orders may not execute when the price is exactly at the target, due to gas costs and swap fees.'
            : 'DCA orders execute at market price on each interval. Execution depends on the keeper being operational.'}
        </p>
      </div>
      </>)}
    </form>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Token logo — shows the GeckoTerminal image when available, falls back to a coloured initial circle */
function TokenPill({
  token,
  fallback,
}: {
  token?: TokenWithBalance;
  fallback?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const symbol = token?.symbol ?? fallback ?? '?';

  if (token?.logoURI && !imgError) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white overflow-hidden flex-shrink-0 ring-1 ring-slate-600/50">
        <img
          src={token.logoURI}
          alt={symbol}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain"
        />
      </span>
    );
  }

  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-teal-500',
  ];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold flex-shrink-0 ${color}`}
    >
      {symbol[0]}
    </span>
  );
}

/** Compact token selector shown inline in an amount row */
function TokenSelectButton({
  tokens,
  value,
  onChange,
  loading = false,
  placeholder = 'Select token',
}: {
  tokens: TokenWithBalance[];
  value: string;
  onChange: (addr: string) => void;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = tokens.find((t) => t.address === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    );
  }, [tokens, search]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 bg-slate-700 rounded-full px-3 py-1.5 text-sm text-slate-400 animate-pulse min-w-[100px]">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 rounded-full px-3 py-1.5 text-sm font-semibold text-white transition-colors min-w-[100px] justify-between"
      >
        {selected ? (
          <>
            <TokenPill token={selected} />
            <span>{selected.symbol}</span>
          </>
        ) : (
          <span className="text-slate-300">{placeholder}</span>
        )}
        <span className="text-slate-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-72">
          <div className="p-2 border-b border-slate-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search token…"
              className="w-full bg-slate-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-conflux-500"
            />
          </div>
          <ul className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500 italic">
                No tokens found
              </li>
            )}
            {filtered.map((t) => (
              <li key={t.address}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(t.address);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors ${
                    t.address === value
                      ? 'bg-conflux-800 text-white'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <TokenPill token={t} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="ml-1.5 text-slate-400 text-xs truncate">
                      {t.name}
                    </span>
                  </div>
                  {parseFloat(t.balanceFormatted) > 0 && (
                    <span className="text-green-400 text-xs shrink-0">
                      {fmtBalance(t.balanceFormatted)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Self-ticking "Xs ago" label — updates every second independently */
function ElapsedLabel({ since }: { since: Date }) {
  const [secs, setSecs] = useState(() =>
    Math.round((Date.now() - since.getTime()) / 1000)
  );
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.round((Date.now() - since.getTime()) / 1000)),
      1_000
    );
    return () => clearInterval(id);
  }, [since]);
  return (
    <span className="text-slate-700" title={since.toLocaleTimeString()}>
      {secs}s ago
    </span>
  );
}

/** Amount input panel (Sell / Buy / Allocate) */
function AmountPanel({
  label,
  amount,
  onAmountChange,
  tokens,
  selectedToken,
  onTokenChange,
  usdValue,
  priceLoading = false,
  balance,
  balancesLoading,
  loading,
  placeholder,
  readOnly = false,
  onMax,
}: {
  label: string;
  amount: string;
  onAmountChange: (v: string) => void;
  tokens: TokenWithBalance[];
  selectedToken: string;
  onTokenChange: (v: string) => void;
  usdValue: string | null;
  priceLoading?: boolean;
  balance: string;
  balancesLoading: boolean;
  loading: boolean;
  placeholder: string;
  readOnly?: boolean;
  onMax?: () => void;
}) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 space-y-2">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={amount}
          onChange={(e) => !readOnly && onAmountChange(e.target.value)}
          readOnly={readOnly}
          placeholder="0.0"
          className={`flex-1 bg-transparent text-3xl font-semibold placeholder-slate-600 focus:outline-none min-w-0 ${
            readOnly ? 'text-slate-400 cursor-default' : 'text-white'
          }`}
        />
        <TokenSelectButton
          tokens={tokens}
          value={selectedToken}
          onChange={onTokenChange}
          loading={loading}
          placeholder={placeholder}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {priceLoading ? (
            <span className="animate-pulse text-slate-600">…</span>
          ) : usdValue != null ? (
            `$${usdValue}`
          ) : null}
        </span>
        <span className="flex items-center gap-1">
          {balancesLoading && <span className="animate-pulse">…</span>}🪙{' '}
          {balance}
          {onMax && !readOnly && (
            <button
              type="button"
              onClick={onMax}
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-700 text-conflux-400 hover:bg-slate-600 hover:text-conflux-300 transition-colors"
            >
              Max
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** Circular down-arrow between panels */
function SwapArrow({ onClick }: { onClick?: () => void }) {
  return (
    <div className="flex justify-center -my-1 relative z-10">
      <button
        type="button"
        onClick={onClick}
        className={`w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-slate-300 transition-colors ${
          onClick ? 'hover:bg-slate-600 cursor-pointer' : 'cursor-default'
        }`}
      >
        ↓
      </button>
    </div>
  );
}

// ── TxStepperPanel ─────────────────────────────────────────────────────────────
/** Full-panel step tracker rendered inside the slide-over while transactions execute */
function TxStepperPanel({
  steps,
  error,
  onRetry,
  onDone,
  chainId,
}: {
  steps: TxStepDef[];
  error: string | null;
  onRetry: () => void;
  onDone: () => void;
  chainId: number;
}) {
  const allDone = steps.every(s => s.status === 'done' || s.status === 'skipped');
  const hasError = steps.some(s => s.status === 'error');
  const explorerBase = chainId === 71
    ? 'https://evmtestnet.confluxscan.org'
    : 'https://evm.confluxscan.org';

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 text-center">
        {allDone ? (
          <div className="w-14 h-14 rounded-full bg-green-900/60 border border-green-600 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : hasError ? (
          <div className="w-14 h-14 rounded-full bg-red-900/60 border border-red-600 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full border-4 border-conflux-500/30 border-t-conflux-500 animate-spin" />
        )}
        <div>
          <h3 className="text-lg font-semibold text-white">
            {allDone ? 'Strategy Created!' : hasError ? 'Something went wrong' : 'Creating Strategy…'}
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            {allDone
              ? 'Your strategy is live and will be monitored by the keeper.'
              : hasError
              ? 'One of the steps failed. You can try again from the form.'
              : 'Keep this tab open while transactions are processed.'}
          </p>
        </div>
      </div>

      {/* ── Step list ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
              step.status === 'active' || step.status === 'waiting'
                ? 'border-conflux-700 bg-conflux-950/40'
                : step.status === 'done'
                ? 'border-green-800/50 bg-green-950/20'
                : step.status === 'error'
                ? 'border-red-800/60 bg-red-950/20'
                : 'border-slate-800 bg-slate-900/20 opacity-60'
            }`}
          >
            {/* Status icon */}
            <div className="mt-0.5 shrink-0 w-6 h-6 flex items-center justify-center">
              {step.status === 'done' && (
                <div className="w-6 h-6 rounded-full bg-green-800 border border-green-600 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {step.status === 'skipped' && (
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <span className="text-slate-500 text-xs font-bold">—</span>
                </div>
              )}
              {(step.status === 'active' || step.status === 'waiting') && (
                <div className="w-6 h-6 rounded-full border-2 border-conflux-400 border-t-transparent animate-spin" />
              )}
              {step.status === 'error' && (
                <div className="w-6 h-6 rounded-full bg-red-900 border border-red-600 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              {step.status === 'idle' && (
                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <span className="text-slate-600 text-xs font-semibold">{i + 1}</span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium leading-tight ${
                step.status === 'idle' || step.status === 'skipped' ? 'text-slate-500'
                : step.status === 'done' ? 'text-green-300'
                : step.status === 'error' ? 'text-red-300'
                : 'text-white'
              }`}>
                {step.label}
              </p>
              <p className={`text-xs mt-0.5 ${step.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>
                {step.detail}
              </p>
              {step.txHash && (
                <a
                  href={`${explorerBase}/tx/${step.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-conflux-400 hover:text-conflux-300 transition-colors mt-0.5 inline-block font-mono"
                >
                  {step.txHash.slice(0, 10)}…{step.txHash.slice(-6)} ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      {allDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full bg-conflux-600 hover:bg-conflux-700 text-white font-semibold py-3.5 rounded-2xl transition-colors text-base"
        >
          View Strategies
        </button>
      )}
      {hasError && (
        <div className="space-y-2">
          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 break-words">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-2xl transition-colors"
          >
            ← Try Again
          </button>
        </div>
      )}
    </div>
  );
}
