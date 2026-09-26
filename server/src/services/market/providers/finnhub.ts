import { toMinor, type Candle, type Exchange } from '@smd/shared';
import { env } from '../../../config/env.js';
import type { MarketDataProvider, ProviderContext, ProviderQuote } from './types.js';

/**
 * Finnhub - the secondary provider, US symbols only.
 *
 * An official, keyed API with a documented free tier (60 requests/minute),
 * which makes it a more dependable fallback than Yahoo for NASDAQ and NYSE.
 * It has no usable free coverage of NSE or BSE, so it declines Indian
 * exchanges and the chain moves on.
 *
 * Free-tier candles are paywalled, so this provider serves quotes only and
 * returns null for history, letting the next tier answer.
 */

const BASE_URL = 'https://finnhub.io/api/v1';
const REQUEST_TIMEOUT_MS = 6_000;

interface FinnhubQuote {
  /** Current price. */
  c?: number;
  /** Day high. */
  h?: number;
  /** Day low. */
  l?: number;
  /** Open. */
  o?: number;
  /** Previous close. */
  pc?: number;
  /** Unix seconds. */
  t?: number;
}

export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub' as const;
  readonly isRealtime = false;
  readonly isSimulated = false;

  get isConfigured(): boolean {
    return Boolean(env.FINNHUB_API_KEY);
  }

  supports(exchange: Exchange): boolean {
    return exchange === 'NASDAQ' || exchange === 'NYSE';
  }

  async getQuote(context: ProviderContext): Promise<ProviderQuote | null> {
    if (!this.isConfigured || !this.supports(context.exchange)) return null;

    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(context.providerSymbol)}&token=${env.FINNHUB_API_KEY ?? ''}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      // 429 is the common one on the free tier; the chain handles it by moving
      // to the next provider and the circuit breaker backs off.
      throw new Error(`Finnhub responded ${response.status}`);
    }

    const raw = (await response.json()) as FinnhubQuote;

    // Finnhub returns zeroes rather than an error for an unknown symbol.
    if (typeof raw.c !== 'number' || raw.c <= 0) return null;

    const previousClose = raw.pc && raw.pc > 0 ? raw.pc : raw.c;

    return {
      symbol: context.symbol,
      exchange: context.exchange,
      ltp: toMinor(raw.c),
      previousClose: toMinor(previousClose),
      open: toMinor(raw.o && raw.o > 0 ? raw.o : previousClose),
      dayHigh: toMinor(raw.h && raw.h > 0 ? raw.h : raw.c),
      dayLow: toMinor(raw.l && raw.l > 0 ? raw.l : raw.c),
      // Not provided by the free quote endpoint.
      volume: 0,
      asOf: raw.t ? new Date(raw.t * 1000) : new Date(),
    };
  }

  /** Free-tier candles are paywalled; defer to the next provider. */
  getHistory(): Promise<Candle[] | null> {
    return Promise.resolve(null);
  }
}

export const finnhubProvider = new FinnhubProvider();
