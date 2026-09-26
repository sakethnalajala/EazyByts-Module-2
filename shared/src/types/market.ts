import type { Currency, Exchange, Market } from '../constants/markets.js';
import type { SourceMeta } from './dataSource.js';

export interface Instrument {
  id: string;
  symbol: string;
  exchange: Exchange;
  market: Market;
  currency: Currency;
  name: string;
  sector: string | null;
  industry: string | null;
  isActive: boolean;
  /** Provider-specific ticker, e.g. RELIANCE.NS for Yahoo. */
  providerSymbol: string;
}

/**
 * An instrument with its latest price attached.
 *
 * Powers the browse/explore list, where showing a row without a price would be
 * worse than useless. Price fields are null when no quote could be fetched, and
 * `isStale` says so explicitly rather than rendering a misleading zero.
 */
export interface InstrumentWithQuote extends Instrument {
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  isStale: boolean;
}

/** A price snapshot. Prices are in MINOR units of the instrument's currency. */
export interface Quote {
  symbol: string;
  exchange: Exchange;
  name: string;
  currency: Currency;
  /** Last traded price. */
  ltp: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  /** Absolute change against previous close, in minor units. */
  change: number;
  /** Percentage change against previous close, e.g. -1.24. */
  changePercent: number;
  volume: number;
  sourceMeta: SourceMeta;
}

export interface Candle {
  /** ISO-8601 timestamp of the bar's open. */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const CANDLE_INTERVALS = ['1d', '1wk', '1mo'] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export const HISTORY_RANGES = ['1W', '1M', '3M', '6M', '1Y', '5Y'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export interface HistorySeries {
  symbol: string;
  exchange: Exchange;
  currency: Currency;
  interval: CandleInterval;
  range: HistoryRange;
  candles: Candle[];
  sourceMeta: SourceMeta;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  market: Market;
  value: number;
  change: number;
  changePercent: number;
  sourceMeta: SourceMeta;
}

export interface MoverEntry {
  symbol: string;
  exchange: Exchange;
  name: string;
  currency: Currency;
  ltp: number;
  change: number;
  changePercent: number;
}

export interface MoversPayload {
  gainers: MoverEntry[];
  losers: MoverEntry[];
  sourceMeta: SourceMeta;
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  imageUrl: string | null;
  symbols: string[];
  publishedAt: string;
  sourceMeta: SourceMeta;
}

/** Whether a given market is accepting orders right now. */
export interface MarketStatus {
  market: Market;
  isOpen: boolean;
  /** Local exchange session times, for display. */
  session: { open: string; close: string; timezone: string };
  /** ISO-8601 instant of the next open, or null when currently open. */
  nextOpen: string | null;
  nextClose: string | null;
  reason: 'open' | 'weekend' | 'holiday' | 'before-open' | 'after-close';
  holidayName?: string;
}

export interface StockDetail {
  instrument: Instrument;
  quote: Quote;
  /** Null when the provider offers no fundamentals for this symbol. */
  fundamentals: Fundamentals | null;
}

export interface Fundamentals {
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
  sourceMeta: SourceMeta;
}

export interface ComparisonEntry {
  instrument: Instrument;
  quote: Quote;
  fundamentals: Fundamentals | null;
  /** Normalised performance series, rebased to 100 at the range start. */
  normalisedSeries: { t: string; v: number }[];
}
