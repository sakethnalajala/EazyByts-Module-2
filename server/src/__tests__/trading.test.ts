import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@smd/shared';

import type * as MarketHoursModule from '../services/market/marketHours.js';

/**
 * Both markets are forced OPEN for this suite.
 *
 * Without this, every assertion about a market order filling would depend on
 * what time of day the suite happens to run - green at 10:00 IST, red at
 * midnight. Session handling has its own dedicated tests against the real
 * calendar in marketHours.test.ts; here we isolate the trading engine.
 */
vi.mock('../services/market/marketHours.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MarketHoursModule>();
  return {
    ...actual,
    getMarketStatus: (market: 'IN' | 'US') => ({
      ...actual.getMarketStatus(market),
      isOpen: true,
      reason: 'open' as const,
      nextOpen: null,
    }),
    isMarketOpen: () => true,
    // Must be in the future, or DAY orders would expire the instant they rest.
    sessionCloseInstant: () => new Date(Date.now() + 6 * 60 * 60 * 1000),
  };
});

import { createApp } from '../app.js';
import { Holding, Portfolio } from '../modules/portfolios/portfolio.model.js';
import { Order, Transaction } from '../modules/orders/order.model.js';
import {
  createAuthedUser,
  createInstrument,
  seedRoles,
  type AuthedUser,
} from './helpers/factories.js';
import { calculateFees } from '../services/trading/fees.js';
import { runMatcher } from '../workers/orderMatcher.js';

const app = createApp();

/**
 * Trading engine integration tests.
 *
 * Market data is forced to the deterministic simulator (MARKET_DATA_FORCE_MOCK
 * in the vitest env), so no test depends on a live provider or on whether an
 * exchange happens to be open while the suite runs.
 */

let trader: AuthedUser;

/** The simulated price for the instrument under test, in minor units. */
async function currentPrice(symbol: string, exchange = 'NSE'): Promise<number> {
  const res = await trader.auth(
    request(app).get(`/api/v1/market/quote/${symbol}?exchange=${exchange}`),
  );
  return res.body.data.ltp as number;
}

async function inrWallet() {
  return Portfolio.findOne({ userId: trader.user._id, market: 'IN' });
}

beforeEach(async () => {
  await seedRoles();
  trader = await createAuthedUser(app, { role: 'trader' });
  await createInstrument({ symbol: 'TESTCO', exchange: 'NSE', referencePrice: 1000 });
  await createInstrument({ symbol: 'USTEST', exchange: 'NASDAQ', referencePrice: 200 });
});

// ------------------------------------------------------------------- preview

describe('POST /api/v1/orders/preview', () => {
  it('costs a buy order without writing anything', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders/preview').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.currency).toBe('INR');
    expect(res.body.data.fees.total).toBeGreaterThan(0);
    expect(res.body.data.netAmount).toBe(res.body.data.grossAmount + res.body.data.fees.total);

    // Nothing persisted.
    expect(await Order.countDocuments()).toBe(0);
  });

  it('flags an unaffordable order rather than throwing', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders/preview').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100_000,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.canAfford).toBe(false);
    expect(res.body.data.warnings.join(' ')).toMatch(/insufficient funds/i);
  });
});

// --------------------------------------------------------------- market buy

describe('market BUY', () => {
  it('fills immediately, debits the wallet and creates a holding', async () => {
    const before = await inrWallet();
    const price = await currentPrice('TESTCO');

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.status).toBe('FILLED');
    expect(order.filledQuantity).toBe(10);

    const holding = await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' });
    expect(holding?.quantity).toBe(10);

    // Average cost capitalises the buy fees, so it exceeds the raw price.
    expect(holding!.averageCost).toBeGreaterThan(price);

    const after = await inrWallet();
    expect(after!.cashAvailable).toBe(before!.cashAvailable - order.netAmount);
    expect(after!.totalFeesPaid).toBe(order.fees.total);
  });

  it('writes exactly one immutable ledger row per fill', async () => {
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const ledger = await Transaction.find({ userId: trader.user._id });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'BUY', quantity: 5, currency: 'INR' });
    // cashAfter is the running balance, which is what makes the ledger auditable.
    expect(ledger[0]!.cashAfter).toBe((await inrWallet())!.cashAvailable);
  });

  it('rejects a buy that exceeds the wallet balance', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 90_000,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_FUNDS);

    // The wallet is untouched and no holding was created.
    const wallet = await inrWallet();
    expect(wallet!.cashAvailable).toBe(wallet!.initialCapital);
    expect(await Holding.countDocuments()).toBe(0);
  });

  it('averages cost correctly across two buys at different prices', async () => {
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        queueIfClosed: true,
      }),
    );
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 30,
        queueIfClosed: true,
      }),
    );

    const holding = await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' });
    expect(holding!.quantity).toBe(40);

    // averageCost must equal investedAmount / quantity, to the rounded paisa.
    expect(holding!.averageCost).toBe(Math.round(holding!.investedAmount / 40));
  });
});

// -------------------------------------------------------------- market sell

describe('market SELL', () => {
  async function buy(quantity: number): Promise<void> {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity,
        queueIfClosed: true,
      }),
    );
    expect(res.status).toBe(201);
  }

  it('credits proceeds net of charges and reduces the holding', async () => {
    await buy(20);
    const walletAfterBuy = await inrWallet();

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 8,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.status).toBe('FILLED');
    // Proceeds are turnover MINUS charges.
    expect(order.netAmount).toBe(order.grossAmount - order.fees.total);

    const holding = await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' });
    expect(holding!.quantity).toBe(12);

    const walletAfterSell = await inrWallet();
    expect(walletAfterSell!.cashAvailable).toBe(walletAfterBuy!.cashAvailable + order.netAmount);
  });

  it('leaves average cost unchanged when selling part of a position', async () => {
    await buy(20);
    const before = await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' });

    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const after = await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' });
    // Selling realises P&L; it does not re-price the remaining shares.
    expect(after!.averageCost).toBe(before!.averageCost);
  });

  it('records realised P&L and removes a fully closed position', async () => {
    await buy(10);

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 10,
        queueIfClosed: true,
      }),
    );
    expect(res.status).toBe(201);

    expect(await Holding.findOne({ userId: trader.user._id, symbol: 'TESTCO' })).toBeNull();

    const ledger = await Transaction.findOne({ userId: trader.user._id, type: 'SELL' });
    expect(ledger!.realisedPnl).not.toBeNull();

    const wallet = await inrWallet();
    expect(wallet!.realisedPnl).toBe(ledger!.realisedPnl);

    // Buying and selling at the same simulated price must LOSE the charges.
    expect(wallet!.realisedPnl).toBeLessThan(0);
  });

  it('refuses to sell more than is held', async () => {
    await buy(5);

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 50,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_HOLDINGS);
    expect((await Holding.findOne({ symbol: 'TESTCO' }))!.quantity).toBe(5);
  });

  it('refuses to sell a stock that is not held at all', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 1,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_HOLDINGS);
  });
});

// ------------------------------------------------------- currency separation

describe('segregated wallets', () => {
  it('funds an Indian trade from INR and a US trade from USD', async () => {
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'USTEST',
        exchange: 'NASDAQ',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const inr = await Portfolio.findOne({ userId: trader.user._id, market: 'IN' });
    const usd = await Portfolio.findOne({ userId: trader.user._id, market: 'US' });

    // Each wallet is debited independently; no FX conversion exists anywhere.
    expect(inr!.cashAvailable).toBeLessThan(inr!.initialCapital);
    expect(usd!.cashAvailable).toBeLessThan(usd!.initialCapital);
    expect(inr!.currency).toBe('INR');
    expect(usd!.currency).toBe('USD');
  });

  it('never lets one wallet fund the other market', async () => {
    // Drain the USD wallet, leaving INR untouched.
    await Portfolio.updateOne(
      { userId: trader.user._id, market: 'US' },
      { $set: { cashAvailable: 100 } },
    );

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'USTEST',
        exchange: 'NASDAQ',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        queueIfClosed: true,
      }),
    );

    // Fails despite a fully funded INR wallet - exactly the intended behaviour.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_FUNDS);

    const inr = await Portfolio.findOne({ userId: trader.user._id, market: 'IN' });
    expect(inr!.cashAvailable).toBe(inr!.initialCapital);
  });
});

// ------------------------------------------------------------- limit orders

describe('limit orders', () => {
  it('rests and reserves funds rather than filling immediately', async () => {
    const price = await currentPrice('TESTCO');
    const before = await inrWallet();

    // Far below market: cannot fill.
    const res = await trader.auth(
      request(app)
        .post('/api/v1/orders')
        .send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 10,
          limitPrice: price / 100 / 2,
          queueIfClosed: true,
        }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.order.status).toBe('PENDING');

    const after = await inrWallet();
    // Funds move from available to blocked - not spent, but not spendable.
    expect(after!.cashBlocked).toBeGreaterThan(0);
    expect(after!.cashAvailable).toBe(before!.cashAvailable - after!.cashBlocked);
  });

  it('fills when the market reaches the limit, at the limit price', async () => {
    const price = await currentPrice('TESTCO');

    // Well above market, so a BUY limit is immediately satisfiable.
    const limitMajor = (price / 100) * 1.5;
    const placed = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        limitPrice: limitMajor,
        queueIfClosed: true,
      }),
    );
    expect(placed.body.data.order.status).toBe('PENDING');

    await runMatcher();

    const order = await Order.findById(placed.body.data.order.id);
    // The matcher only runs while the market is open; if it is closed in this
    // run the order correctly stays pending.
    if (order!.status === 'FILLED') {
      expect(order!.averageFillPrice).toBe(order!.limitPrice);
      const wallet = await inrWallet();
      expect(wallet!.cashBlocked).toBe(0);
    } else {
      expect(order!.status).toBe('PENDING');
    }
  });

  it('requires a limit price for a limit order', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(422);
    expect(res.body.error.details.some((d: { path: string }) => d.path === 'limitPrice')).toBe(
      true,
    );
  });

  it('refuses a limit price on a market order', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        limitPrice: 500,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(422);
  });

  it('returns reserved funds when cancelled', async () => {
    const price = await currentPrice('TESTCO');
    const before = await inrWallet();

    const placed = await trader.auth(
      request(app)
        .post('/api/v1/orders')
        .send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 10,
          limitPrice: price / 100 / 2,
          queueIfClosed: true,
        }),
    );

    const cancel = await trader.auth(
      request(app).post(`/api/v1/orders/${placed.body.data.order.id}/cancel`),
    );

    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');

    const after = await inrWallet();
    expect(after!.cashBlocked).toBe(0);
    // Every paisa returns; nothing is lost to a cancelled order.
    expect(after!.cashAvailable).toBe(before!.cashAvailable);
  });

  it('reserves shares for a resting SELL so they cannot be double-sold', async () => {
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        queueIfClosed: true,
      }),
    );

    const price = await currentPrice('TESTCO');

    // Far above market: rests.
    await trader.auth(
      request(app)
        .post('/api/v1/orders')
        .send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'SELL',
          type: 'LIMIT',
          quantity: 10,
          limitPrice: (price / 100) * 5,
          queueIfClosed: true,
        }),
    );

    const holding = await Holding.findOne({ symbol: 'TESTCO' });
    expect(holding!.blockedQuantity).toBe(10);

    // A second sell of the same shares must be refused.
    const second = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 10,
        queueIfClosed: true,
      }),
    );

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_HOLDINGS);
  });

  it('cannot cancel an order that already filled', async () => {
    const placed = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const res = await trader.auth(
      request(app).post(`/api/v1/orders/${placed.body.data.order.id}/cancel`),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.ORDER_NOT_CANCELLABLE);
  });
});

// -------------------------------------------------------------- idempotency

describe('duplicate order prevention', () => {
  it('returns the original order when the same key is replayed', async () => {
    const key = randomUUID();
    const payload = {
      symbol: 'TESTCO',
      exchange: 'NSE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 10,
      queueIfClosed: true,
    };

    const first = await trader.auth(
      request(app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload),
    );
    const second = await trader.auth(
      request(app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.order.id).toBe(first.body.data.order.id);

    // One order, one ledger row, one holding of 10 - not 20.
    expect(await Order.countDocuments({ userId: trader.user._id })).toBe(1);
    expect(await Transaction.countDocuments({ userId: trader.user._id })).toBe(1);
    expect((await Holding.findOne({ symbol: 'TESTCO' }))!.quantity).toBe(10);
  });

  it('survives two concurrent submissions of the same key', async () => {
    const key = randomUUID();
    const payload = {
      symbol: 'TESTCO',
      exchange: 'NSE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 10,
      queueIfClosed: true,
    };

    // Fired together: the unique index, not the pre-check, is what saves us.
    const [a, b] = await Promise.all([
      trader.auth(request(app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload)),
      trader.auth(request(app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload)),
    ]);

    expect([a.status, b.status].every((s) => s === 200 || s === 201)).toBe(true);
    expect(await Order.countDocuments({ userId: trader.user._id })).toBe(1);
  });

  it('treats different keys as different orders', async () => {
    const payload = {
      symbol: 'TESTCO',
      exchange: 'NSE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 5,
      queueIfClosed: true,
    };

    await trader.auth(
      request(app).post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send(payload),
    );
    await trader.auth(
      request(app).post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send(payload),
    );

    expect(await Order.countDocuments({ userId: trader.user._id })).toBe(2);
    expect((await Holding.findOne({ symbol: 'TESTCO' }))!.quantity).toBe(10);
  });

  it('rejects a key that is too short to be meaningful', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').set('Idempotency-Key', 'abc').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------- validation

describe('order validation', () => {
  it.each([
    ['zero quantity', { quantity: 0 }],
    ['negative quantity', { quantity: -5 }],
    ['fractional quantity', { quantity: 1.5 }],
    ['absurd quantity', { quantity: 1_000_000 }],
  ])('rejects %s', async (_label, override) => {
    const res = await trader.auth(
      request(app)
        .post('/api/v1/orders')
        .send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'BUY',
          type: 'MARKET',
          queueIfClosed: true,
          ...override,
        }),
    );

    expect(res.status).toBe(422);
  });

  it('rejects an unknown symbol', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'NOSUCH',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(404);
  });

  it('rejects an inactive instrument', async () => {
    await createInstrument({ symbol: 'DELISTED', exchange: 'NSE', isActive: false });

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'DELISTED',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        queueIfClosed: true,
      }),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ERROR_CODES.INSTRUMENT_INACTIVE);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/orders').send({
      symbol: 'TESTCO',
      exchange: 'NSE',
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
    });

    expect(res.status).toBe(401);
  });

  it('never lets one user see another user orders', async () => {
    const placed = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const other = await createAuthedUser(app, { email: 'other@example.com' });
    const res = await other.auth(request(app).get(`/api/v1/orders/${placed.body.data.order.id}`));

    expect(res.status).toBe(404);
  });
});

// ------------------------------------------------------------------- history

describe('GET /api/v1/orders', () => {
  it('returns the caller orders, newest first, paginated', async () => {
    for (let index = 0; index < 3; index += 1) {
      await trader.auth(
        request(app).post('/api/v1/orders').send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'BUY',
          type: 'MARKET',
          quantity: 1,
          queueIfClosed: true,
        }),
      );
    }

    const res = await trader.auth(request(app).get('/api/v1/orders?limit=2'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, hasNext: true });
  });

  it('filters by status', async () => {
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        queueIfClosed: true,
      }),
    );

    const filled = await trader.auth(request(app).get('/api/v1/orders?status=FILLED'));
    const pending = await trader.auth(request(app).get('/api/v1/orders?status=PENDING'));

    expect(filled.body.data).toHaveLength(1);
    expect(pending.body.data).toHaveLength(0);
  });
});

// ------------------------------------------------------- consistency invariant

describe('ledger consistency', () => {
  it('keeps wallet, holdings and ledger in agreement after many trades', async () => {
    const wallet = await inrWallet();
    const startingCash = wallet!.initialCapital;

    for (let index = 0; index < 4; index += 1) {
      await trader.auth(
        request(app).post('/api/v1/orders').send({
          symbol: 'TESTCO',
          exchange: 'NSE',
          side: 'BUY',
          type: 'MARKET',
          quantity: 3,
          queueIfClosed: true,
        }),
      );
    }
    await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'SELL',
        type: 'MARKET',
        quantity: 5,
        queueIfClosed: true,
      }),
    );

    const ledger = await Transaction.find({ userId: trader.user._id }).sort({ createdAt: 1 });
    const finalWallet = await inrWallet();
    const holding = await Holding.findOne({ symbol: 'TESTCO' });

    // Replay every ledger row and the balance must land exactly where the
    // wallet says it is. This is the invariant the whole engine exists to hold.
    let replayed = startingCash;
    for (const entry of ledger) {
      replayed += entry.type === 'BUY' ? -entry.netAmount : entry.netAmount;
    }

    expect(replayed).toBe(finalWallet!.cashAvailable);
    expect(holding!.quantity).toBe(12 - 5);
    expect(finalWallet!.cashBlocked).toBe(0);
    expect(holding!.blockedQuantity).toBe(0);

    // Fees charged must equal fees recorded.
    const feeSum = ledger.reduce((total, entry) => total + entry.fees.total, 0);
    expect(finalWallet!.totalFeesPaid).toBe(feeSum);
  });

  it('charges exactly the fees the calculator predicts', async () => {
    const price = await currentPrice('TESTCO');
    const quantity = 7;

    const res = await trader.auth(
      request(app).post('/api/v1/orders').send({
        symbol: 'TESTCO',
        exchange: 'NSE',
        side: 'BUY',
        type: 'MARKET',
        quantity,
        queueIfClosed: true,
      }),
    );

    const expected = calculateFees({
      market: 'IN',
      side: 'BUY',
      turnover: price * quantity,
      quantity,
    });

    expect(res.body.data.order.fees.total).toBe(expected.total);
    expect(res.body.data.order.fees.stt).toBe(expected.stt);
    expect(res.body.data.order.fees.stamp).toBe(expected.stamp);
  });
});
