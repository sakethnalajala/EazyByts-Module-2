import {
  MAX_QUOTE_AGE_MS,
  percentChange,
  type CandleInterval,
  type Exchange,
  type Fundamentals,
  type HistorySeries,
  type HistoryRange,
  type Quote,
  type SourceMeta,
} from '@smd/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { cacheGet, cacheSet, cached } from '../cache/cache.js';
import {
  Instrument,
  QuoteCache,
  type InstrumentDocument,
} from '../../modules/instruments/instrument.model.js';
import { runChain, getMockProvider } from './providerChain.js';
import type { ProviderContext, ProviderQuote } from './providers/types.js';

/**
 * Market data access.
 *
 * Every value leaving this module carries SourceMeta describing where it came
 * from, how old it is, and whether it is simulated. That is a hard requirement,
 * not a nicety: the UI renders a badge from it, and the app must never imply
 * that a delayed or simulated price is live.
 */

const QUOTE_TTL = env.QUOTE_CACHE_TTL_SECONDS;
const HISTORY_TTL = 60 * 60;
const FUNDAMENTALS_TTL = 60 * 30;

function quoteKey(exchange: Exchange, symbol: string): string {
  return `quote:${exchange}:${symbol}`;
}

function toContext(instrument: InstrumentDocument): ProviderContext {
  return {
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    providerSymbol: instrument.providerSymbol,
    referencePrice: instrument.referencePrice,
  };
}

function buildSourceMeta(
  source: SourceMeta['source'],
  asOf: Date,
  isSimulated: boolean,
): SourceMeta {
  return {
    source,
    asOf: asOf.toISOString(),
    // Every free tier available to this project is delayed or unofficial.
    // Nothing here is ever advertised as real-time.
    isDelayed: true,
    isSimulated,
  };
}

function assembleQuote(
  instrument: InstrumentDocument,
  raw: ProviderQuote,
  meta: SourceMeta,
): Quote {
  const change = raw.ltp - raw.previousClose;
  return {
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    name: instrument.name,
    currency: instrument.currency,
    ltp: raw.ltp,
    previousClose: raw.previousClose,
    open: raw.open,
    dayHigh: raw.dayHigh,
    dayLow: raw.dayLow,
    change,
    changePercent: Number(percentChange(raw.ltp, raw.previousClose).toFixed(2)),
    volume: raw.volume,
    sourceMeta: meta,
  };
}

/** Persists the last good quote so a holding can still be valued when every
 *  provider is down. Fire-and-forget: a cache write must not fail a request. */
function persistQuote(
  instrument: InstrumentDocument,
  raw: ProviderQuote,
  source: string,
  isSimulated: boolean,
): void {
  void QuoteCache.updateOne(
    { instrumentId: instrument._id },
    {
      $set: {
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        ltp: raw.ltp,
        previousClose: raw.previousClose,
        open: raw.open,
        dayHigh: raw.dayHigh,
        dayLow: raw.dayLow,
        volume: raw.volume,
        source,
        isSimulated,
        asOf: raw.asOf,
      },
    },
    { upsert: true },
  ).catch((error: unknown) => {
    logger.debug({ err: error, symbol: instrument.symbol }, 'Quote persistence failed');
  });
}

export async function findInstrument(
  symbol: string,
  exchange?: Exchange,
): Promise<InstrumentDocument | null> {
  const filter: Record<string, unknown> = { symbol: symbol.toUpperCase() };
  if (exchange) filter.exchange = exchange;

  // Without an exchange, prefer NSE then NASDAQ - the primary venue for each
  // market - so a bare "RELIANCE" or "AAPL" resolves predictably.
  const candidates = await Instrument.find(filter).lean(false);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const preference: Exchange[] = ['NSE', 'NASDAQ', 'NYSE', 'BSE'];
  for (const preferred of preference) {
    const match = candidates.find((candidate) => candidate.exchange === preferred);
    if (match) return match;
  }
  return candidates[0] ?? null;
}

export async function getQuote(instrument: InstrumentDocument): Promise<Quote> {
  const key = quoteKey(instrument.exchange, instrument.symbol);

  const hit = await cacheGet<{
    raw: ProviderQuote;
    source: SourceMeta['source'];
    simulated: boolean;
  }>(key);
  if (hit) {
    const meta = buildSourceMeta(hit.source, new Date(hit.raw.asOf), hit.simulated);
    return assembleQuote(instrument, { ...hit.raw, asOf: new Date(hit.raw.asOf) }, meta);
  }

  const result = await runChain(instrument.exchange, (provider) =>
    provider.getQuote(toContext(instrument)),
  );

  if (!result) {
    // Only reachable if the simulator was somehow excluded. Fall back to the
    // durable last-known quote rather than failing the request.
    const stored = await QuoteCache.findOne({ instrumentId: instrument._id }).lean();
    if (stored) {
      const meta = buildSourceMeta('cache', stored.asOf, stored.isSimulated);
      return assembleQuote(
        instrument,
        { ...stored, symbol: instrument.symbol, exchange: instrument.exchange },
        meta,
      );
    }
    // Last resort: the simulator directly.
    const fallback = await getMockProvider().getQuote(toContext(instrument));
    const meta = buildSourceMeta('mock', new Date(), true);
    return assembleQuote(instrument, fallback as ProviderQuote, meta);
  }

  await cacheSet(
    key,
    { raw: result.value, source: result.provider.name, simulated: result.provider.isSimulated },
    QUOTE_TTL,
  );
  persistQuote(instrument, result.value, result.provider.name, result.provider.isSimulated);

  return assembleQuote(
    instrument,
    result.value,
    buildSourceMeta(result.provider.name, result.value.asOf, result.provider.isSimulated),
  );
}

/**
 * Batch quotes.
 *
 * Collapses a watchlist or a portfolio into one upstream call per exchange
 * instead of one per symbol - the single most important thing keeping this
 * inside free provider limits.
 */
export async function getQuotes(instruments: InstrumentDocument[]): Promise<Map<string, Quote>> {
  const results = new Map<string, Quote>();
  if (instruments.length === 0) return results;

  const pending: InstrumentDocument[] = [];

  // Serve whatever the cache already has.
  for (const instrument of instruments) {
    const key = quoteKey(instrument.exchange, instrument.symbol);
    const hit = await cacheGet<{
      raw: ProviderQuote;
      source: SourceMeta['source'];
      simulated: boolean;
    }>(key);
    if (hit) {
      const meta = buildSourceMeta(hit.source, new Date(hit.raw.asOf), hit.simulated);
      results.set(
        `${instrument.exchange}:${instrument.symbol}`,
        assembleQuote(instrument, { ...hit.raw, asOf: new Date(hit.raw.asOf) }, meta),
      );
    } else {
      pending.push(instrument);
    }
  }

  if (pending.length === 0) return results;

  // Group by exchange: a provider batch call is per-market.
  const byExchange = new Map<Exchange, InstrumentDocument[]>();
  for (const instrument of pending) {
    const list = byExchange.get(instrument.exchange) ?? [];
    list.push(instrument);
    byExchange.set(instrument.exchange, list);
  }

  for (const [exchange, group] of byExchange) {
    const contexts = group.map(toContext);

    const batch = await runChain(exchange, async (provider) => {
      if (!provider.getQuotes) return null;
      const map = await provider.getQuotes(contexts);
      return map.size > 0 ? { map, provider } : null;
    });

    if (batch) {
      for (const instrument of group) {
        const key = `${instrument.exchange}:${instrument.symbol}`;
        const raw = batch.value.map.get(key);
        if (!raw) continue;

        await cacheSet(
          quoteKey(instrument.exchange, instrument.symbol),
          { raw, source: batch.provider.name, simulated: batch.provider.isSimulated },
          QUOTE_TTL,
        );
        persistQuote(instrument, raw, batch.provider.name, batch.provider.isSimulated);

        results.set(
          key,
          assembleQuote(
            instrument,
            raw,
            buildSourceMeta(batch.provider.name, raw.asOf, batch.provider.isSimulated),
          ),
        );
      }
    }

    // Anything the batch could not cover falls back to individual lookups.
    for (const instrument of group) {
      const key = `${instrument.exchange}:${instrument.symbol}`;
      if (!results.has(key)) {
        results.set(key, await getQuote(instrument));
      }
    }
  }

  return results;
}

/** Last price in minor units, or null when nothing is known. Used for valuation. */
export async function getLastPrice(instrument: InstrumentDocument): Promise<number | null> {
  try {
    return (await getQuote(instrument)).ltp;
  } catch (error) {
    logger.warn({ err: error, symbol: instrument.symbol }, 'Price lookup failed');
    const stored = await QuoteCache.findOne({ instrumentId: instrument._id }).lean();
    return stored?.ltp ?? null;
  }
}

/** True when a quote is fresh enough to execute a market order against. */
export function isQuoteFresh(quote: Quote, now: Date = new Date()): boolean {
  // Simulated quotes are generated on demand, so they are fresh by definition.
  if (quote.sourceMeta.isSimulated) return true;
  return now.getTime() - new Date(quote.sourceMeta.asOf).getTime() <= MAX_QUOTE_AGE_MS;
}

export async function getHistory(
  instrument: InstrumentDocument,
  range: HistoryRange,
  interval: CandleInterval,
): Promise<HistorySeries> {
  const key = `history:${instrument.exchange}:${instrument.symbol}:${range}:${interval}`;

  return cached(key, HISTORY_TTL, async () => {
    const result = await runChain(instrument.exchange, (provider) =>
      provider.getHistory(toContext(instrument), range, interval),
    );

    const candles = result?.value ?? [];
    const provider = result?.provider;

    return {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      currency: instrument.currency,
      interval,
      range,
      candles,
      sourceMeta: buildSourceMeta(
        provider?.name ?? 'mock',
        new Date(),
        provider?.isSimulated ?? true,
      ),
    } satisfies HistorySeries;
  });
}

export async function getFundamentals(
  instrument: InstrumentDocument,
): Promise<Fundamentals | null> {
  const key = `fundamentals:${instrument.exchange}:${instrument.symbol}`;

  return cached(key, FUNDAMENTALS_TTL, async () => {
    const result = await runChain(instrument.exchange, async (provider) =>
      provider.getFundamentals ? provider.getFundamentals(toContext(instrument)) : null,
    );

    if (!result) return null;

    return {
      ...result.value,
      sourceMeta: buildSourceMeta(result.provider.name, new Date(), result.provider.isSimulated),
    } satisfies Fundamentals;
  });
}
