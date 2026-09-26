import { MARKETS, type Market } from '@smd/shared';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { withTransaction } from '../lib/transaction.js';
import { Order, type OrderDocument } from '../modules/orders/order.model.js';
import { Instrument } from '../modules/instruments/instrument.model.js';
import { getQuote } from '../services/market/marketData.service.js';
import { getMarketStatus } from '../services/market/marketHours.js';
import { executeOrder, releaseReservation } from '../services/trading/orders.service.js';
import { notifyOrderEvent } from '../modules/notifications/notification.service.js';
import { recordWorkerRun } from './registry.js';

/**
 * Limit-order matcher.
 *
 * Runs on an interval and, separately, opportunistically on API requests.
 *
 * That second trigger is not belt-and-braces - it is the mitigation for a real
 * deployment constraint: Render's free tier sleeps a service after ~15 minutes
 * of inactivity, and nothing scheduled runs while it sleeps. A user returning
 * to the app would otherwise find limit orders that should have filled hours
 * ago still sitting open. Matching on request means the first page load after a
 * wake-up settles them.
 */

let running = false;

export interface MatchResult {
  examined: number;
  filled: number;
  expired: number;
}

/** BUY fills at or below the limit; SELL fills at or above it. */
export function limitIsSatisfied(order: OrderDocument, lastPrice: number): boolean {
  if (order.limitPrice === null) return false;
  return order.side === 'BUY' ? lastPrice <= order.limitPrice : lastPrice >= order.limitPrice;
}

async function expireOrder(order: OrderDocument): Promise<void> {
  await withTransaction(async (session) => {
    await releaseReservation(order, session);
    order.status = 'EXPIRED';
    order.reservedCash = 0;
    order.reservedQuantity = 0;
    await order.save(session ? { session } : {});
  });

  await notifyOrderEvent(order, 'ORDER_EXPIRED');
}

/**
 * One matching pass.
 *
 * Quotes are fetched once per distinct instrument, not once per order, so a
 * hundred orders on one symbol cost one upstream call.
 */
export async function runMatcher(): Promise<MatchResult> {
  if (running) return { examined: 0, filled: 0, expired: 0 };
  running = true;

  const result: MatchResult = { examined: 0, filled: 0, expired: 0 };

  try {
    const openMarkets = new Set<Market>();
    for (const market of MARKETS) {
      if (getMarketStatus(market).isOpen) openMarkets.add(market);
    }

    const pending = await Order.find({ status: 'PENDING' }).sort({ placedAt: 1 }).limit(500);
    result.examined = pending.length;
    if (pending.length === 0) return result;

    const now = new Date();
    const priceCache = new Map<string, number | null>();

    for (const order of pending) {
      // Expiry is checked regardless of session state, so a DAY order placed
      // before a holiday does not linger indefinitely.
      if (order.expiresAt && order.expiresAt.getTime() <= now.getTime()) {
        await expireOrder(order);
        result.expired += 1;
        continue;
      }

      if (!openMarkets.has(order.market)) continue;

      const key = `${order.exchange}:${order.symbol}`;
      let lastPrice = priceCache.get(key);

      if (lastPrice === undefined) {
        const instrument = await Instrument.findById(order.instrumentId);
        lastPrice = instrument ? (await getQuote(instrument)).ltp : null;
        priceCache.set(key, lastPrice);
      }

      if (lastPrice === null) continue;

      // A queued market order fills at the opening price it now sees.
      const shouldFill = order.type === 'MARKET' ? true : limitIsSatisfied(order, lastPrice);

      if (!shouldFill) continue;

      // Limit orders fill AT the limit price, which is the conservative
      // convention: a real exchange would often fill better.
      const fillPrice =
        order.type === 'LIMIT' && order.limitPrice !== null ? order.limitPrice : lastPrice;

      try {
        await withTransaction(async (session) => {
          // Re-read inside the transaction: the user may have cancelled it
          // between the scan and now.
          const fresh = await Order.findById(order._id, null, session ? { session } : {});
          if (!fresh || fresh.status !== 'PENDING') return;
          await executeOrder(fresh, fillPrice, session);
        });

        const filled = await Order.findById(order._id);
        if (filled?.status === 'FILLED') {
          result.filled += 1;
          await notifyOrderEvent(filled, 'ORDER_FILLED');
        }
      } catch (error) {
        logger.warn(
          { err: error, orderId: order._id.toString() },
          'Order could not be filled during matching',
        );
      }
    }

    if (result.filled > 0 || result.expired > 0) {
      logger.info(result, 'Order matcher pass complete');
    }

    return result;
  } finally {
    running = false;
    recordWorkerRun('orderMatcher', 'ok');
  }
}

let interval: NodeJS.Timeout | null = null;
let lastOpportunisticRun = 0;

/** Cheap throttle so bursty traffic does not trigger a pass per request. */
const OPPORTUNISTIC_MIN_GAP_MS = 20_000;

/**
 * Triggered from the API request path. Fire-and-forget: a user's request must
 * never wait on someone else's order matching.
 */
export function triggerOpportunisticMatch(): void {
  if (!env.ENABLE_WORKERS) return;
  if (Date.now() - lastOpportunisticRun < OPPORTUNISTIC_MIN_GAP_MS) return;

  lastOpportunisticRun = Date.now();
  void runMatcher().catch((error: unknown) => {
    logger.error({ err: error }, 'Opportunistic match failed');
  });
}

export function startOrderMatcher(): void {
  if (!env.ENABLE_WORKERS || interval) return;

  interval = setInterval(() => {
    void runMatcher().catch((error: unknown) => {
      logger.error({ err: error }, 'Scheduled match failed');
    });
  }, env.ORDER_MATCHER_INTERVAL_SECONDS * 1000);

  interval.unref();
  logger.info({ intervalSeconds: env.ORDER_MATCHER_INTERVAL_SECONDS }, 'Order matcher started');
}

export function stopOrderMatcher(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
