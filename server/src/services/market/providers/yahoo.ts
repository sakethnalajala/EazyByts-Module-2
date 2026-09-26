import YahooFinance from 'yahoo-finance2';
import {
  toMinor,
  type Candle,
  type CandleInterval,
  type Exchange,
  type Fundamentals,
  type HistoryRange,
} from '@smd/shared';
import { logger } from '../../../config/logger.js';
import {
  RANGE_DAYS,
  type MarketDataProvider,
  type ProviderContext,
  type ProviderQuote,
} from './types.js';

/**
 * Yahoo Finance - the primary provider.
 *
 * Chosen because it is the only freely available source with usable NSE and
 * BSE coverage (via the .NS and .BO suffixes) alongside US symbols.
 *
 * IMPORTANT CAVEAT, stated plainly because it affects reliability: this is an
 * UNOFFICIAL endpoint. It has no SLA, no API key, and can change or break
 * without notice. That is precisely why the chain always ends in the
 * deterministic simulator - if Yahoo disappears, the app degrades to labelled
 * simulated data rather than failing.
 *
 * Data is delayed (typically ~15 minutes) and is never presented as real-time.
 */

const yahoo = new YahooFinance({
  // These notices print to stdout on every call and add nothing operationally.
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

/** Upstream is unofficial; never let it hang a request. */
const REQUEST_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Yahoo ${label} timed out`)), REQUEST_TIMEOUT_MS),
    ),
  ]);
}

interface YahooQuoteShape {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: Date | string | number;
  currency?: string;
}

function parseAsOf(value: Date | string | number | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value * 1000);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toProviderQuote(
  context: ProviderContext,
  raw: YahooQuoteShape | undefined,
): ProviderQuote | null {
  const price = raw?.regularMarketPrice;
  // A quote with no price is useless; fall through to the next provider.
  if (raw === undefined || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const previousClose = raw.regularMarketPreviousClose ?? price;
  const open = raw.regularMarketOpen ?? previousClose;

  return {
    symbol: context.symbol,
    exchange: context.exchange,
    ltp: toMinor(price),
    previousClose: toMinor(previousClose),
    open: toMinor(open),
    dayHigh: toMinor(raw.regularMarketDayHigh ?? Math.max(price, open)),
    dayLow: toMinor(raw.regularMarketDayLow ?? Math.min(price, open)),
    volume: Math.round(raw.regularMarketVolume ?? 0),
    asOf: parseAsOf(raw.regularMarketTime),
  };
}

function rangeToPeriod(range: HistoryRange): { period1: Date; period2: Date } {
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - RANGE_DAYS[range] * 86_400_000);
  return { period1, period2 };
}

export class YahooProvider implements MarketDataProvider {
  readonly name = 'yahoo' as const;
  /** No API key required, so it is always available to try. */
  readonly isConfigured = true;
  readonly isRealtime = false;
  readonly isSimulated = false;

  supports(_exchange: Exchange): boolean {
    // NSE (.NS), BSE (.BO), NASDAQ and NYSE all resolve through Yahoo.
    return true;
  }

  async getQuote(context: ProviderContext): Promise<ProviderQuote | null> {
    const raw = (await withTimeout(
      yahoo.quote(context.providerSymbol),
      `quote ${context.providerSymbol}`,
    )) as YahooQuoteShape | undefined;

    return toProviderQuote(context, raw);
  }

  /**
   * Batch quotes. One upstream call for a whole watchlist rather than N, which
   * is the difference between staying inside Yahoo's tolerance and being
   * throttled.
   */
  async getQuotes(contexts: ProviderContext[]): Promise<Map<string, ProviderQuote>> {
    const results = new Map<string, ProviderQuote>();
    if (contexts.length === 0) return results;

    const symbols = contexts.map((context) => context.providerSymbol);
    const raw = (await withTimeout(yahoo.quote(symbols), 'batch quote')) as
      YahooQuoteShape[] | YahooQuoteShape | undefined;

    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const bySymbol = new Map<string, YahooQuoteShape>();
    for (const entry of list) {
      if (entry.symbol) bySymbol.set(entry.symbol, entry);
    }

    for (const context of contexts) {
      const quote = toProviderQuote(context, bySymbol.get(context.providerSymbol));
      if (quote) results.set(`${context.exchange}:${context.symbol}`, quote);
    }

    return results;
  }

  async getHistory(
    context: ProviderContext,
    range: HistoryRange,
    interval: CandleInterval,
  ): Promise<Candle[] | null> {
    const { period1, period2 } = rangeToPeriod(range);

    const result = (await withTimeout(
      yahoo.chart(context.providerSymbol, { period1, period2, interval }),
      `chart ${context.providerSymbol}`,
    )) as { quotes?: RawChartQuote[] } | undefined;

    const quotes = result?.quotes ?? [];
    if (quotes.length === 0) return null;

    const candles: Candle[] = [];
    for (const quote of quotes) {
      // Yahoo emits null OHLC rows for halted or non-trading sessions.
      if (
        typeof quote.close !== 'number' ||
        typeof quote.open !== 'number' ||
        typeof quote.high !== 'number' ||
        typeof quote.low !== 'number'
      ) {
        continue;
      }

      candles.push({
        t: new Date(quote.date).toISOString(),
        o: toMinor(quote.open),
        h: toMinor(quote.high),
        l: toMinor(quote.low),
        c: toMinor(quote.close),
        v: Math.round(quote.volume ?? 0),
      });
    }

    return candles.length > 0 ? candles : null;
  }

  async getFundamentals(
    context: ProviderContext,
  ): Promise<Omit<Fundamentals, 'sourceMeta'> | null> {
    try {
      const summary = (await withTimeout(
        yahoo.quoteSummary(context.providerSymbol, {
          modules: ['summaryDetail', 'defaultKeyStatistics'],
        }),
        `quoteSummary ${context.providerSymbol}`,
      )) as RawSummary | undefined;

      const detail = summary?.summaryDetail;
      const stats = summary?.defaultKeyStatistics;
      if (!detail && !stats) return null;

      return {
        marketCap: numberOrNull(detail?.marketCap),
        peRatio: numberOrNull(detail?.trailingPE),
        eps: numberOrNull(stats?.trailingEps),
        dividendYield: numberOrNull(detail?.dividendYield),
        fiftyTwoWeekHigh: optionalMinor(detail?.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: optionalMinor(detail?.fiftyTwoWeekLow),
        beta: numberOrNull(detail?.beta ?? stats?.beta),
      };
    } catch (error) {
      // Fundamentals are decorative; never fail a page over them.
      logger.debug(
        { err: error, symbol: context.providerSymbol },
        'Yahoo fundamentals unavailable',
      );
      return null;
    }
  }

  /** Symbol search, used by the stock explorer. */
  async search(query: string): Promise<YahooSearchHit[]> {
    const result = (await withTimeout(yahoo.search(query), `search ${query}`)) as
      { quotes?: YahooSearchHit[] } | undefined;
    return (result?.quotes ?? []).filter((hit) => typeof hit.symbol === 'string');
  }
}

interface RawChartQuote {
  date: Date | string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

interface RawSummary {
  summaryDetail?: {
    marketCap?: number;
    trailingPE?: number;
    dividendYield?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    beta?: number;
  };
  defaultKeyStatistics?: {
    trailingEps?: number;
    beta?: number;
  };
}

export interface YahooSearchHit {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalMinor(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? toMinor(value) : null;
}

export const yahooProvider = new YahooProvider();
