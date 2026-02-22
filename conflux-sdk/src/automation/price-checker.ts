import type { AutomationLogger } from './logger.js';
import { noopLogger } from './logger.js';
import type { Job } from './types.js';

/**
 * Price source adapter interface.
 *
 * Returns the spot price of `tokenIn` denominated in `tokenOut`, scaled by
 * 1e18.  Implementations may call a DEX (Swappi, etc.), an oracle, or a mock.
 */
export interface PriceSource {
  /**
   * Returns 0n if the pair is unknown or price cannot be fetched.
   */
  getPrice(tokenIn: string, tokenOut: string): Promise<bigint>;
}

export interface PriceCheckResult {
  conditionMet: boolean;
  currentPrice: bigint;
  targetPrice: bigint;
  swapUsd: number;
}

/**
 * PriceChecker – queries a price source and evaluates whether a job's
 * trigger condition is currently met.
 */
export class PriceChecker {
  private source: PriceSource;
  private tokenPricesUsd: Map<string, number>;
  private readonly log: AutomationLogger;

  constructor(
    source: PriceSource,
    tokenPricesUsd: Map<string, number> = new Map(),
    logger: AutomationLogger = noopLogger
  ) {
    this.source = source;
    this.tokenPricesUsd = tokenPricesUsd;
    this.log = logger;
  }

  async checkLimitOrder(
    job: Job & { type: 'limit_order' }
  ): Promise<PriceCheckResult> {
    const params = job.params;
    const currentPrice = await this.source.getPrice(
      params.tokenIn,
      params.tokenOut
    );
    const targetPrice = BigInt(params.targetPrice);

    let conditionMet: boolean;
    if (params.direction === 'gte') {
      conditionMet = currentPrice >= targetPrice;
    } else {
      conditionMet = currentPrice <= targetPrice;
    }

    const swapUsd = this._estimateUsd(params.tokenIn, params.amountIn);

    this.log.debug(
      {
        jobId: job.id,
        currentPrice: currentPrice.toString(),
        targetPrice: targetPrice.toString(),
        conditionMet,
        swapUsd,
      },
      '[PriceChecker] limit-order check'
    );

    return { conditionMet, currentPrice, targetPrice, swapUsd };
  }

  async checkDCA(job: Job & { type: 'dca' }): Promise<PriceCheckResult> {
    const params = job.params;
    // DCA has no price condition — just verify the interval has been reached
    const conditionMet = Date.now() >= params.nextExecution;
    const currentPrice = await this.source.getPrice(
      params.tokenIn,
      params.tokenOut
    );
    const swapUsd = this._estimateUsd(params.tokenIn, params.amountPerSwap);

    this.log.debug(
      {
        jobId: job.id,
        nextExecution: params.nextExecution,
        conditionMet,
        swapUsd,
      },
      '[PriceChecker] DCA check'
    );

    return { conditionMet, currentPrice, targetPrice: 0n, swapUsd };
  }

  updateTokenPrice(token: string, usdPrice: number): void {
    this.tokenPricesUsd.set(token.toLowerCase(), usdPrice);
  }

  private _estimateUsd(token: string, amountWei: string): number {
    const usdPerToken = this.tokenPricesUsd.get(token.toLowerCase()) ?? 0;
    // Assumes 18 decimals — fine for a rough USD safety cap estimate
    const amount = Number(BigInt(amountWei)) / 1e18;
    return amount * usdPerToken;
  }
}
