import type {
  Candle,
  CandleInterval,
  DataSource,
  Exchange,
  Fundamentals,
  HistoryRange,
} from '@smd/shared';

/**
 * Provider interface.
 *
 * Every provider returns prices in MINOR units so nothing downstream has to
 * remember which one it is talking to. A provider that cannot serve a request
 * returns null rather than throwing, so the chain moves on to the next tier.
 */

export interface ProviderQuote {
  symbol: string;
  exchange: Exchange;
  ltp: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  asOf: Date;
}

export interface ProviderContext {
  symbol: string;
  exchange: Exchange;
  providerSymbol: string;
  /** Baseline in minor units, used by the simulator. */
  referencePrice: number;
}

export interface MarketDataProvider {
  readonly name: DataSource;
  /** True when this provider can serve the given exchange. */
  supports(exchange: Exchange): boolean;
  /** Always available; never throws for a missing key. */
  readonly isConfigured: boolean;
  /** Data is a live feed rather than delayed or simulated. */
  readonly isRealtime: boolean;
  readonly isSimulated: boolean;

  getQuote(context: ProviderContext): Promise<ProviderQuote | null>;
  getQuotes?(contexts: ProviderContext[]): Promise<Map<string, ProviderQuote>>;
  getHistory(
    context: ProviderContext,
    range: HistoryRange,
    interval: CandleInterval,
  ): Promise<Candle[] | null>;
  getFundamentals?(context: ProviderContext): Promise<Omit<Fundamentals, 'sourceMeta'> | null>;
}

/** Days of history each range covers, used by every provider. */
export const RANGE_DAYS: Readonly<Record<HistoryRange, number>> = {
  '1W': 7,
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '1Y': 366,
  '5Y': 1830,
};

/** Composite key for caches and result maps. */
export function contextKey(symbol: string, exchange: Exchange): string {
  return `${exchange}:${symbol}`;
}
