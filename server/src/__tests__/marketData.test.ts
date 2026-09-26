import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInstrument, seedRoles } from './helpers/factories.js';
import { mockProvider, MockProvider } from '../services/market/providers/mock.js';
import { getMarketStatus, isMarketOpen, localParts } from '../services/market/marketHours.js';
import { cacheGet, cacheSet, clearMemoryCache, checkCache } from '../services/cache/cache.js';
import { getProviderHealth, resetBreakers } from '../services/market/providerChain.js';

const app = createApp();

/**
 * Market data engine.
 *
 * MARKET_DATA_FORCE_MOCK is set in the vitest env, so every assertion here runs
 * against the deterministic simulator. That is deliberate: a test suite that
 * depends on an unofficial third-party endpoint being reachable is not a test
 * suite, it is a coin flip.
 */

beforeEach(async () => {
  await seedRoles();
  clearMemoryCache();
  resetBreakers();
});

// ------------------------------------------------------------- mock provider

describe('deterministic simulator', () => {
  it('returns the same price for the same symbol twice', async () => {
    const context = {
      symbol: 'DETERM',
      exchange: 'NSE' as const,
      providerSymbol: 'DETERM.NS',
      referencePrice: 100_000,
    };

    const first = await mockProvider.getQuote(context);
    const second = await mockProvider.getQuote(context);

    // Same day, same seed - the close must be identical. (The intraday
    // component can differ by a wobble, so the day's close is the invariant.)
    expect(first?.previousClose).toBe(second?.previousClose);
  });

  it('gives different symbols different prices', async () => {
    const base = { exchange: 'NSE' as const, referencePrice: 100_000 };
    const a = await mockProvider.getQuote({ ...base, symbol: 'AAA', providerSymbol: 'AAA.NS' });
    const b = await mockProvider.getQuote({ ...base, symbol: 'BBB', providerSymbol: 'BBB.NS' });

    expect(a?.ltp).not.toBe(b?.ltp);
  });

  it('stays bounded around the reference price', () => {
    const reference = 100_000;
    const today = MockProvider.dayIndexOf(new Date());

    // Sampled across three years: a true random walk would drift far outside
    // these bounds, which is exactly what this design avoids.
    for (let offset = 0; offset < 1000; offset += 7) {
      const value = MockProvider.valueForDay(reference, 'NSE:BOUNDED', today - offset);
      expect(value).toBeGreaterThan(reference * 0.5);
      expect(value).toBeLessThan(reference * 1.7);
    }
  });

  it('never produces a zero or negative price', () => {
    const today = MockProvider.dayIndexOf(new Date());
    for (let offset = 0; offset < 200; offset += 1) {
      expect(MockProvider.valueForDay(100, 'NSE:TINY', today - offset)).toBeGreaterThan(0);
    }
  });

  it('produces history with no weekend bars', async () => {
    const candles = await mockProvider.getHistory(
      { symbol: 'HIST', exchange: 'NSE', providerSymbol: 'HIST.NS', referencePrice: 100_000 },
      '1M',
      '1d',
    );

    expect(candles?.length).toBeGreaterThan(10);
    for (const candle of candles ?? []) {
      const weekday = new Date(candle.t).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
    }
  });

  it('produces OHLC bars where high >= low and both bracket the close', async () => {
    const candles = await mockProvider.getHistory(
      { symbol: 'OHLC', exchange: 'NSE', providerSymbol: 'OHLC.NS', referencePrice: 250_000 },
      '3M',
      '1d',
    );

    for (const candle of candles ?? []) {
      expect(candle.h).toBeGreaterThanOrEqual(candle.l);
      expect(candle.h).toBeGreaterThanOrEqual(candle.c);
      expect(candle.l).toBeLessThanOrEqual(candle.c);
      expect(candle.v).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------ quote endpoint

describe('GET /api/v1/market/quote/:symbol', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'QUOTED', exchange: 'NSE', referencePrice: 1500 });
  });

  it('returns a quote with full provenance metadata', async () => {
    const res = await request(app).get('/api/v1/market/quote/QUOTED?exchange=NSE');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ symbol: 'QUOTED', exchange: 'NSE', currency: 'INR' });
    expect(res.body.data.ltp).toBeGreaterThan(0);

    // The provenance badge is a hard requirement, not a nicety.
    expect(res.body.data.sourceMeta).toMatchObject({
      source: 'mock',
      isSimulated: true,
      isDelayed: true,
    });
    expect(new Date(res.body.data.sourceMeta.asOf).toString()).not.toBe('Invalid Date');
  });

  it('never claims a quote is real-time', async () => {
    const res = await request(app).get('/api/v1/market/quote/QUOTED');
    expect(res.body.data.sourceMeta.isDelayed).toBe(true);
  });

  it('computes change and change percent against the previous close', async () => {
    const res = await request(app).get('/api/v1/market/quote/QUOTED');
    const { ltp, previousClose, change, changePercent } = res.body.data;

    expect(change).toBe(ltp - previousClose);
    expect(changePercent).toBeCloseTo(((ltp - previousClose) / previousClose) * 100, 1);
  });

  it('returns 404 for an unknown symbol', async () => {
    const res = await request(app).get('/api/v1/market/quote/NOSUCHSYMBOL');
    expect(res.status).toBe(404);
  });

  it('is publicly accessible without a token', async () => {
    // Deliberate: the landing page shows a market snapshot before sign-in.
    const res = await request(app).get('/api/v1/market/quote/QUOTED');
    expect(res.status).toBe(200);
  });
});

// ------------------------------------------------------------ batch quotes

describe('POST /api/v1/market/quotes', () => {
  it('resolves many symbols in a single call', async () => {
    await createInstrument({ symbol: 'BAT1', exchange: 'NSE' });
    await createInstrument({ symbol: 'BAT2', exchange: 'NSE' });
    await createInstrument({ symbol: 'BAT3', exchange: 'NASDAQ' });

    const res = await request(app)
      .post('/api/v1/market/quotes')
      .send({ symbols: ['BAT1', 'BAT2', 'BAT3'] });

    expect(res.status).toBe(200);
    expect(res.body.data.resolved).toBe(3);
    expect(Object.keys(res.body.data.quotes)).toEqual(
      expect.arrayContaining(['NSE:BAT1', 'NSE:BAT2', 'NASDAQ:BAT3']),
    );
  });

  it('caps the batch so one request cannot fan out without bound', async () => {
    const res = await request(app)
      .post('/api/v1/market/quotes')
      .send({ symbols: Array.from({ length: 51 }, (_, i) => `SYM${i}`) });

    expect(res.status).toBe(422);
  });

  it('rejects an empty symbol list', async () => {
    const res = await request(app).post('/api/v1/market/quotes').send({ symbols: [] });
    expect(res.status).toBe(422);
  });
});

// ------------------------------------------------------------------- search

describe('GET /api/v1/market/search', () => {
  beforeEach(async () => {
    await createInstrument({
      symbol: 'RELIANCE',
      exchange: 'NSE',
      name: 'Reliance Industries Ltd',
    });
    await createInstrument({
      symbol: 'RELIANCE',
      exchange: 'BSE',
      name: 'Reliance Industries Ltd',
    });
    await createInstrument({ symbol: 'INFY', exchange: 'NSE', name: 'Infosys Ltd' });
  });

  it('finds instruments by symbol', async () => {
    const res = await request(app).get('/api/v1/market/search?q=RELI');

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.results[0].symbol).toBe('RELIANCE');
  });

  it('finds instruments by company name', async () => {
    const res = await request(app).get('/api/v1/market/search?q=Infosys');
    expect(res.body.data.results[0].symbol).toBe('INFY');
  });

  it('ranks an exact symbol match first', async () => {
    const res = await request(app).get('/api/v1/market/search?q=INFY');
    expect(res.body.data.results[0].symbol).toBe('INFY');
  });

  it('filters by exchange', async () => {
    const res = await request(app).get('/api/v1/market/search?q=RELIANCE&exchange=BSE');
    expect(res.body.data.results.every((r: { exchange: string }) => r.exchange === 'BSE')).toBe(
      true,
    );
  });

  it('rejects an empty query', async () => {
    expect((await request(app).get('/api/v1/market/search?q=')).status).toBe(422);
  });

  it('treats a regex metacharacter as a literal, not a pattern', async () => {
    // A naive implementation would throw or match everything here.
    const res = await request(app).get('/api/v1/market/search?q=.*');
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ history

describe('GET /api/v1/market/history/:symbol', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'CHART', exchange: 'NSE', referencePrice: 800 });
  });

  it('returns candles for the requested range', async () => {
    const res = await request(app).get('/api/v1/market/history/CHART?range=1M&interval=1d');

    expect(res.status).toBe(200);
    expect(res.body.data.candles.length).toBeGreaterThan(5);
    expect(res.body.data.range).toBe('1M');
    expect(res.body.data.sourceMeta.isSimulated).toBe(true);
  });

  it('returns more candles for a longer range', async () => {
    const short = await request(app).get('/api/v1/market/history/CHART?range=1W');
    const long = await request(app).get('/api/v1/market/history/CHART?range=1Y');

    expect(long.body.data.candles.length).toBeGreaterThan(short.body.data.candles.length);
  });

  it('rejects an unknown range', async () => {
    expect((await request(app).get('/api/v1/market/history/CHART?range=99Y')).status).toBe(422);
  });
});

// ------------------------------------------------------------ stock detail

describe('GET /api/v1/market/:symbol (stock detail)', () => {
  it('returns instrument, quote and fundamentals together', async () => {
    await createInstrument({ symbol: 'DETAIL', exchange: 'NSE', name: 'Detail Corp' });

    const res = await request(app).get('/api/v1/market/DETAIL');

    expect(res.status).toBe(200);
    expect(res.body.data.instrument).toMatchObject({ symbol: 'DETAIL', name: 'Detail Corp' });
    expect(res.body.data.quote.ltp).toBeGreaterThan(0);
    expect(res.body.data.fundamentals).not.toBeNull();
    expect(res.body.data.fundamentals.sourceMeta.isSimulated).toBe(true);
  });

  it('does not let /search be shadowed by the :symbol route', async () => {
    // Route ordering bug guard: /search must resolve before /:symbol.
    const res = await request(app).get('/api/v1/market/search?q=ab');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('results');
  });

  it('does not let /status be shadowed by the :symbol route', async () => {
    const res = await request(app).get('/api/v1/market/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('markets');
  });
});

// ----------------------------------------------------------------- indices

describe('GET /api/v1/market/indices', () => {
  it('returns indices for both markets', async () => {
    const res = await request(app).get('/api/v1/market/indices');

    expect(res.status).toBe(200);
    expect(res.body.data.indices.length).toBeGreaterThanOrEqual(6);

    const markets = new Set(res.body.data.indices.map((i: { market: string }) => i.market));
    expect(markets).toEqual(new Set(['IN', 'US']));
  });

  it('filters by market', async () => {
    const res = await request(app).get('/api/v1/market/indices?market=IN');
    expect(res.body.data.indices.every((i: { market: string }) => i.market === 'IN')).toBe(true);
  });
});

// ------------------------------------------------------------------ movers

describe('GET /api/v1/market/movers', () => {
  beforeEach(async () => {
    for (let index = 0; index < 8; index += 1) {
      await createInstrument({
        symbol: `MOV${index}`,
        exchange: 'NSE',
        referencePrice: 100 + index * 50,
      });
    }
  });

  it('returns gainers sorted descending and losers ascending', async () => {
    const res = await request(app).get('/api/v1/market/movers?market=IN&limit=3');

    expect(res.status).toBe(200);
    const { gainers, losers } = res.body.data;

    expect(gainers.length).toBeGreaterThan(0);
    for (let i = 1; i < gainers.length; i += 1) {
      expect(gainers[i - 1].changePercent).toBeGreaterThanOrEqual(gainers[i].changePercent);
    }
    for (let i = 1; i < losers.length; i += 1) {
      expect(losers[i - 1].changePercent).toBeLessThanOrEqual(losers[i].changePercent);
    }
  });

  it('only returns instruments from the requested market', async () => {
    await createInstrument({ symbol: 'USONLY', exchange: 'NASDAQ' });
    const res = await request(app).get('/api/v1/market/movers?market=IN&limit=5');

    const symbols = [...res.body.data.gainers, ...res.body.data.losers].map(
      (e: { symbol: string }) => e.symbol,
    );
    expect(symbols).not.toContain('USONLY');
  });
});

// -------------------------------------------------------------- comparison

describe('GET /api/v1/market/compare', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'CMPA', exchange: 'NSE', referencePrice: 100 });
    await createInstrument({ symbol: 'CMPB', exchange: 'NSE', referencePrice: 20_000 });
  });

  it('rebases wildly different price levels to a comparable scale', async () => {
    const res = await request(app).get('/api/v1/market/compare?symbols=CMPA,CMPB&range=1M');

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toHaveLength(2);

    for (const entry of res.body.data.entries) {
      // Rebased to 100 at the range start, so a 100-rupee stock and a
      // 20,000-rupee stock can share one axis.
      expect(entry.normalisedSeries[0].v).toBe(100);
    }
  });

  it('requires at least two symbols', async () => {
    expect((await request(app).get('/api/v1/market/compare?symbols=CMPA')).status).toBe(422);
  });

  it('rejects more than four symbols', async () => {
    const res = await request(app).get('/api/v1/market/compare?symbols=A,B,C,D,E');
    expect(res.status).toBe(422);
  });

  it('errors clearly when fewer than two symbols actually exist', async () => {
    const res = await request(app).get('/api/v1/market/compare?symbols=CMPA,GHOSTSYM');
    expect(res.status).toBe(400);
  });
});

// -------------------------------------------------------------------- news

describe('GET /api/v1/market/news', () => {
  it('always returns articles, falling back to the simulated feed', async () => {
    const res = await request(app).get('/api/v1/market/news?limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    // With the mock forced on, every article must be flagged simulated and
    // must NOT carry a real-looking URL.
    for (const article of res.body.data) {
      expect(article.sourceMeta.isSimulated).toBe(true);
      expect(article.url.startsWith('#simulated')).toBe(true);
    }
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/v1/market/news?limit=3');
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.limit).toBe(3);
  });
});

// ------------------------------------------------------------ market hours

describe('market sessions', () => {
  it('reports NSE closed on a Sunday', () => {
    // 2026-09-20 is a Sunday. 06:00 UTC = 11:30 IST, inside session hours.
    const status = getMarketStatus('IN', new Date('2026-09-20T06:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('weekend');
  });

  it('reports NSE open mid-session on a weekday', () => {
    // 2026-09-23 is a Wednesday. 06:00 UTC = 11:30 IST.
    const status = getMarketStatus('IN', new Date('2026-09-23T06:00:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.reason).toBe('open');
    expect(status.nextClose).not.toBeNull();
  });

  it('reports NSE closed before the 09:15 IST open', () => {
    // 03:00 UTC = 08:30 IST, before the open.
    const status = getMarketStatus('IN', new Date('2026-09-23T03:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('before-open');
  });

  it('reports NSE closed after the 15:30 IST close', () => {
    // 12:00 UTC = 17:30 IST.
    const status = getMarketStatus('IN', new Date('2026-09-23T12:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('after-close');
  });

  it('honours the Indian holiday calendar', () => {
    // 2026-10-02, Gandhi Jayanti, a Friday.
    const status = getMarketStatus('IN', new Date('2026-10-02T06:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toBe('holiday');
    expect(status.holidayName).toBe('Gandhi Jayanti');
  });

  it('handles the US session in its own timezone', () => {
    // 2026-09-23 14:00 UTC = 10:00 ET, inside the 09:30-16:00 session.
    expect(isMarketOpen('US', new Date('2026-09-23T14:00:00Z'))).toBe(true);
    // 21:00 UTC = 17:00 ET, after the close.
    expect(isMarketOpen('US', new Date('2026-09-23T21:00:00Z'))).toBe(false);
  });

  it('resolves wall-clock time in the exchange timezone, not the host timezone', () => {
    // The decisive test: the host runs in UTC on Render. 06:00 UTC must read
    // as 11:30 in Kolkata, not 06:00.
    const parts = localParts(new Date('2026-09-23T06:00:00Z'), 'Asia/Kolkata');
    expect(parts.hour).toBe(11);
    expect(parts.minute).toBe(30);
  });

  it('computes a next-open instant that is in the future', () => {
    const status = getMarketStatus('IN', new Date('2026-09-20T06:00:00Z'));
    expect(new Date(status.nextOpen as string).getTime()).toBeGreaterThan(
      new Date('2026-09-20T06:00:00Z').getTime(),
    );
  });
});

describe('GET /api/v1/market/status', () => {
  it('returns both markets and states plainly that data is not live', async () => {
    const res = await request(app).get('/api/v1/market/status');

    expect(res.status).toBe(200);
    expect(res.body.data.markets).toHaveLength(2);
    expect(res.body.data.notice).toMatch(/delayed or simulated/i);
  });
});

// ------------------------------------------------------------------- cache

describe('cache with in-process fallback', () => {
  it('stores and retrieves a value without Redis configured', async () => {
    await cacheSet('test:key', { hello: 'world' }, 60);
    expect(await cacheGet<{ hello: string }>('test:key')).toEqual({ hello: 'world' });
  });

  it('returns null for a missing key', async () => {
    expect(await cacheGet('test:absent')).toBeNull();
  });

  it('expires entries once their TTL passes', async () => {
    await cacheSet('test:ttl', 'value', 1);
    expect(await cacheGet('test:ttl')).toBe('value');

    // Fast-forward past the TTL without actually waiting a second.
    const realNow = Date.now;
    Date.now = () => realNow() + 2000;
    try {
      expect(await cacheGet('test:ttl')).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('reports Redis as disabled rather than down when unconfigured', async () => {
    const status = await checkCache();
    // "Disabled" is the honest word: nothing is broken, it simply is not set up.
    expect(status.state).toBe('disabled');
    expect(status.message).toMatch(/not configured/i);
  });
});

// -------------------------------------------------------- provider health

describe('provider chain health', () => {
  it('reports the configured providers', () => {
    const health = getProviderHealth();
    expect(health.length).toBeGreaterThan(0);
    // MARKET_DATA_FORCE_MOCK restricts the chain to the simulator.
    expect(health.map((p) => p.name)).toContain('mock');
  });
});
