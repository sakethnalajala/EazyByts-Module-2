import type { Candle, CandleInterval, Exchange, Fundamentals, HistoryRange } from '@smd/shared';
import {
  RANGE_DAYS,
  type MarketDataProvider,
  type ProviderContext,
  type ProviderQuote,
} from './types.js';

/**
 * Deterministic market simulator.
 *
 * The final tier of the provider chain, and the reason the app never shows a
 * blank screen. Two properties matter:
 *
 * 1. **Deterministic.** The same symbol on the same day always produces the
 *    same price. Tests are reproducible and a page refresh does not reshuffle
 *    the portfolio.
 * 2. **Bounded.** Prices oscillate around the seeded reference rather than
 *    random-walking, so a symbol cannot drift to zero or to absurd values over
 *    a five-year history window.
 *
 * Everything it produces is flagged `isSimulated`, and the UI renders that as
 * a visible badge. It is never presented as real data.
 */

const MS_PER_DAY = 86_400_000;

/** FNV-1a: small, fast, and stable across runs and platforms. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic [0,1) from a seed pair. */
function noise(seed: number, day: number): number {
  let x = (seed ^ Math.imul(day + 1, 2654435761)) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 4294967296;
}

function dayIndex(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY);
}

/**
 * Closing price for a given day, in minor units.
 *
 * Two sine waves of different periods plus bounded noise. The composition
 * looks like a plausible price series without the unbounded drift of a true
 * random walk.
 */
function closeForDay(reference: number, seed: number, day: number): number {
  const phaseA = ((seed % 1000) / 1000) * Math.PI * 2;
  const phaseB = (((seed >> 10) % 1000) / 1000) * Math.PI * 2;

  const slow = Math.sin(day / 37 + phaseA) * 0.14;
  const fast = Math.sin(day / 11 + phaseB) * 0.06;
  const jitter = (noise(seed, day) - 0.5) * 0.03;

  const factor = 1 + slow + fast + jitter;
  // Clamped so a pathological combination can never produce a silly price.
  const bounded = Math.min(Math.max(factor, 0.55), 1.65);

  return Math.max(1, Math.round(reference * bounded));
}

/**
 * Intraday price, so a quote moves during the session instead of sitting
 * frozen on the day's close.
 */
function intradayPrice(dayClose: number, previousClose: number, seed: number, now: Date): number {
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  const progress = minuteOfDay / 1440;

  // Walks from the previous close toward the day's close, with a wobble.
  const base = previousClose + (dayClose - previousClose) * progress;
  const wobble = (noise(seed, dayIndex(now) * 1440 + minuteOfDay) - 0.5) * 0.004;

  return Math.max(1, Math.round(base * (1 + wobble)));
}

function buildQuote(context: ProviderContext, now: Date): ProviderQuote {
  const seed = hashString(`${context.exchange}:${context.symbol}`);
  const today = dayIndex(now);

  const todayClose = closeForDay(context.referencePrice, seed, today);
  const previousClose = closeForDay(context.referencePrice, seed, today - 1);
  const ltp = intradayPrice(todayClose, previousClose, seed, now);

  const open = Math.round(previousClose * (1 + (noise(seed, today + 500) - 0.5) * 0.01));
  const swing = Math.abs(ltp - open) + Math.round(ltp * 0.004);

  return {
    symbol: context.symbol,
    exchange: context.exchange,
    ltp,
    previousClose,
    open,
    dayHigh: Math.max(ltp, open) + Math.round(swing * noise(seed, today + 900)),
    dayLow: Math.max(1, Math.min(ltp, open) - Math.round(swing * noise(seed, today + 901))),
    volume: Math.round(100_000 + noise(seed, today + 77) * 4_900_000),
    asOf: now,
  };
}

export class MockProvider implements MarketDataProvider {
  readonly name = 'mock' as const;
  readonly isConfigured = true;
  readonly isRealtime = false;
  readonly isSimulated = true;

  supports(_exchange: Exchange): boolean {
    // The whole point of this tier: it can always answer.
    return true;
  }

  getQuote(context: ProviderContext): Promise<ProviderQuote | null> {
    return Promise.resolve(buildQuote(context, new Date()));
  }

  getQuotes(contexts: ProviderContext[]): Promise<Map<string, ProviderQuote>> {
    const now = new Date();
    const results = new Map<string, ProviderQuote>();
    for (const context of contexts) {
      results.set(`${context.exchange}:${context.symbol}`, buildQuote(context, now));
    }
    return Promise.resolve(results);
  }

  getHistory(
    context: ProviderContext,
    range: HistoryRange,
    interval: CandleInterval,
  ): Promise<Candle[] | null> {
    const seed = hashString(`${context.exchange}:${context.symbol}`);
    const today = dayIndex(new Date());
    const days = RANGE_DAYS[range];
    const step = interval === '1mo' ? 30 : interval === '1wk' ? 7 : 1;

    const candles: Candle[] = [];

    for (let offset = days; offset >= 0; offset -= step) {
      const day = today - offset;
      const date = new Date(day * MS_PER_DAY);

      // Skip weekends: a chart with Saturday bars looks obviously fake.
      if (step === 1) {
        const weekday = date.getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
      }

      const close = closeForDay(context.referencePrice, seed, day);
      const previous = closeForDay(context.referencePrice, seed, day - step);
      const open = previous;
      const spread = Math.max(1, Math.round(Math.abs(close - open) + close * 0.006));

      candles.push({
        t: new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        ).toISOString(),
        o: open,
        h: Math.max(open, close) + Math.round(spread * noise(seed, day + 11)),
        l: Math.max(1, Math.min(open, close) - Math.round(spread * noise(seed, day + 12))),
        c: close,
        v: Math.round(100_000 + noise(seed, day + 13) * 4_900_000),
      });
    }

    return Promise.resolve(candles);
  }

  getFundamentals(context: ProviderContext): Promise<Omit<Fundamentals, 'sourceMeta'> | null> {
    const seed = hashString(`${context.exchange}:${context.symbol}:fundamentals`);
    const today = dayIndex(new Date());
    const price = closeForDay(
      context.referencePrice,
      hashString(`${context.exchange}:${context.symbol}`),
      today,
    );

    return Promise.resolve({
      // Deliberately plausible rather than precise; clearly simulated data.
      marketCap: Math.round(price * (5_000_000 + noise(seed, 1) * 500_000_000)),
      peRatio: Number((8 + noise(seed, 2) * 45).toFixed(2)),
      eps: Number(((price / 100) * (0.02 + noise(seed, 3) * 0.1)).toFixed(2)),
      dividendYield: Number((noise(seed, 4) * 4).toFixed(2)),
      fiftyTwoWeekHigh: Math.round(price * (1.05 + noise(seed, 5) * 0.4)),
      fiftyTwoWeekLow: Math.round(price * (0.55 + noise(seed, 6) * 0.3)),
      beta: Number((0.4 + noise(seed, 7) * 1.5).toFixed(2)),
    });
  }

  /** Exposed so the index simulator can reuse the same curve. */
  static valueForDay(reference: number, key: string, day: number): number {
    return closeForDay(reference, hashString(key), day);
  }

  static dayIndexOf(date: Date): number {
    return dayIndex(date);
  }
}

export const mockProvider = new MockProvider();
