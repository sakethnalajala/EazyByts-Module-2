import {
  percentChange,
  toMinor,
  type ComparisonEntry,
  type Market,
  type MarketIndex,
  type MoverEntry,
  type MoversPayload,
  type HistoryRange,
  type SourceMeta,
} from '@smd/shared';
import { cached } from '../cache/cache.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { Instrument } from '../../modules/instruments/instrument.model.js';
import { MARKET_INDICES } from '../../db/instruments.data.js';
import { MockProvider } from './providers/mock.js';
import { getHistory, getQuotes } from './marketData.service.js';

const INDEX_TTL = 60;
const MOVERS_TTL = 300;

function meta(source: SourceMeta['source'], isSimulated: boolean): SourceMeta {
  return {
    source,
    asOf: new Date().toISOString(),
    isDelayed: true,
    isSimulated,
  };
}

interface RawIndexQuote {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
}

/**
 * Market indices.
 *
 * Index symbols (^NSEI, ^GSPC) are not tradable instruments, so they bypass
 * the Instrument collection and query Yahoo directly, falling back to the same
 * deterministic curve the simulator uses for stocks.
 */
export async function getIndices(market?: Market): Promise<MarketIndex[]> {
  const wanted = market ? MARKET_INDICES.filter((i) => i.market === market) : MARKET_INDICES;

  return cached(`indices:${market ?? 'all'}`, INDEX_TTL, async () => {
    const results: MarketIndex[] = [];

    for (const index of wanted) {
      let value: number | null = null;
      let previousClose: number | null = null;
      let source: SourceMeta['source'] = 'mock';
      let simulated = true;

      if (!env.MARKET_DATA_FORCE_MOCK) {
        try {
          const quote = await fetchIndexQuote(index.providerSymbol);
          if (quote && typeof quote.regularMarketPrice === 'number') {
            value = toMinor(quote.regularMarketPrice);
            previousClose = toMinor(quote.regularMarketPreviousClose ?? quote.regularMarketPrice);
            source = 'yahoo';
            simulated = false;
          }
        } catch (error) {
          logger.debug({ err: error, index: index.symbol }, 'Index quote unavailable');
        }
      }

      if (value === null || previousClose === null) {
        // Same deterministic curve as the stock simulator, so indices move
        // coherently with the rest of the simulated market.
        const day = MockProvider.dayIndexOf(new Date());
        const reference = toMinor(index.referenceValue);
        value = MockProvider.valueForDay(reference, `INDEX:${index.symbol}`, day);
        previousClose = MockProvider.valueForDay(reference, `INDEX:${index.symbol}`, day - 1);
      }

      results.push({
        symbol: index.symbol,
        name: index.name,
        market: index.market,
        value,
        change: value - previousClose,
        changePercent: Number(percentChange(value, previousClose).toFixed(2)),
        sourceMeta: meta(source, simulated),
      });
    }

    return results;
  });
}

/** Direct index quote. Kept separate because indices are not Instruments. */
async function fetchIndexQuote(providerSymbol: string): Promise<RawIndexQuote | null> {
  const { default: YahooFinance } = await import('yahoo-finance2');
  const client = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

  const result = (await Promise.race([
    client.quote(providerSymbol),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('index quote timeout')), 8000),
    ),
  ])) as RawIndexQuote | undefined;

  return result ?? null;
}

/**
 * Top gainers and losers.
 *
 * Computed from this platform's own curated universe rather than a provider's
 * "movers" endpoint. That keeps the list restricted to symbols the user can
 * actually trade here, and it works identically whether the underlying quotes
 * are live or simulated.
 */
export async function getMovers(market: Market, limit: number): Promise<MoversPayload> {
  return cached(`movers:${market}:${limit}`, MOVERS_TTL, async () => {
    const instruments = await Instrument.find({ market, isActive: true }).limit(60);
    const quotes = await getQuotes(instruments);

    const entries: MoverEntry[] = [];
    let anySimulated = false;
    let source: SourceMeta['source'] = 'mock';

    for (const instrument of instruments) {
      const quote = quotes.get(`${instrument.exchange}:${instrument.symbol}`);
      if (!quote) continue;

      if (quote.sourceMeta.isSimulated) anySimulated = true;
      else source = quote.sourceMeta.source;

      entries.push({
        symbol: quote.symbol,
        exchange: quote.exchange,
        name: quote.name,
        currency: quote.currency,
        ltp: quote.ltp,
        change: quote.change,
        changePercent: quote.changePercent,
      });
    }

    const sorted = [...entries].sort((a, b) => b.changePercent - a.changePercent);

    return {
      gainers: sorted.slice(0, limit),
      losers: sorted.slice(-limit).reverse(),
      sourceMeta: meta(anySimulated ? 'mock' : source, anySimulated),
    } satisfies MoversPayload;
  });
}

/**
 * Side-by-side comparison.
 *
 * Series are rebased to 100 at the range start so instruments with wildly
 * different absolute prices - a 23,000-rupee stock and a 22-dollar one - can
 * be read on one axis.
 */
export async function compareInstruments(
  symbols: string[],
  range: HistoryRange,
): Promise<ComparisonEntry[]> {
  const { findInstrument, getFundamentals, getQuote } = await import('./marketData.service.js');
  const { toInstrumentDto } = await import('../../modules/market/market.controller.js');
  const entries: ComparisonEntry[] = [];

  for (const symbol of symbols) {
    const instrument = await findInstrument(symbol);
    if (!instrument) continue;

    const [quote, fundamentals, history] = await Promise.all([
      getQuote(instrument),
      getFundamentals(instrument),
      getHistory(instrument, range, '1d'),
    ]);

    const first = history.candles[0]?.c;
    const normalisedSeries =
      first && first > 0
        ? history.candles.map((candle) => ({
            t: candle.t,
            v: Number(((candle.c / first) * 100).toFixed(2)),
          }))
        : [];

    entries.push({
      instrument: toInstrumentDto(instrument),
      quote,
      fundamentals,
      normalisedSeries,
    });
  }

  return entries;
}
