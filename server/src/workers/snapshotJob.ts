import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { captureAllSnapshots } from '../services/trading/snapshots.service.js';
import { syncNews } from '../services/market/news.service.js';
import { Order } from '../modules/orders/order.model.js';
import { recordWorkerRun } from './registry.js';

/**
 * Daily housekeeping: portfolio snapshots and a news refresh.
 *
 * Snapshots MUST be taken as time passes - historical portfolio valuation
 * cannot be reconstructed later, because that would require the closing price
 * of every holding on every past day, which no free provider serves in bulk.
 *
 * The interval is deliberately short (hourly) rather than a true nightly cron.
 * On a free-tier host that sleeps after 15 minutes of inactivity, a job
 * scheduled for 02:00 would essentially never run. Hourly, combined with the
 * per-day upsert key, means the snapshot lands whenever the process happens to
 * be awake - and re-running it the same day simply overwrites that day's row.
 */

const INTERVAL_MS = 60 * 60 * 1000;

let interval: NodeJS.Timeout | null = null;
let lastRunDate: string | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runSnapshotJob(force = false): Promise<void> {
  if (!force && lastRunDate === today()) return;

  try {
    const captured = await captureAllSnapshots();
    lastRunDate = today();

    // Expire any stale orders the matcher has not reached.
    const expired = await Order.updateMany(
      { status: 'PENDING', expiresAt: { $lte: new Date() } },
      { $set: { status: 'EXPIRED' } },
    );

    const synced = await syncNews('stock market NSE NASDAQ');

    logger.info(
      { snapshots: captured, expiredOrders: expired.modifiedCount, newsArticles: synced },
      'Daily job complete',
    );
    recordWorkerRun('snapshotJob', 'ok');
    recordWorkerRun('newsSync', 'ok');
  } catch (error) {
    logger.error({ err: error }, 'Daily job failed');
    recordWorkerRun('snapshotJob', 'error');
  }
}

export function startSnapshotJob(): void {
  if (!env.ENABLE_WORKERS || interval) return;

  interval = setInterval(() => {
    void runSnapshotJob();
  }, INTERVAL_MS);

  interval.unref();
  logger.info('Snapshot job started (hourly, one capture per day)');
}

export function stopSnapshotJob(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
