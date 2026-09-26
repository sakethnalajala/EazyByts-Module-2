import type { AlertCondition } from '@smd/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Alert } from '../modules/alerts/alert.model.js';
import { Instrument } from '../modules/instruments/instrument.model.js';
import { getQuotes } from '../services/market/marketData.service.js';
import { notifyAlertTriggered } from '../modules/notifications/notification.service.js';
import { recordWorkerRun } from './registry.js';

/**
 * Price-alert evaluator.
 *
 * Alerts are grouped by instrument so one quote fetch serves every alert on
 * that symbol, regardless of how many users set one.
 *
 * Like the order matcher, this also runs opportunistically from the request
 * path, because a sleeping free-tier instance runs no scheduled work.
 */

let running = false;

const REPEAT_COOLDOWN_MS = 60 * 60 * 1000;

export interface AlertEvaluation {
  examined: number;
  triggered: number;
}

/** Pure predicate, so the threshold logic is unit-testable in isolation. */
export function conditionMet(
  condition: AlertCondition,
  threshold: number,
  price: number,
  changePercent: number,
): boolean {
  switch (condition) {
    case 'PRICE_ABOVE':
      return price > threshold;
    case 'PRICE_BELOW':
      return price < threshold;
    case 'PCT_CHANGE_UP':
      return changePercent >= threshold;
    case 'PCT_CHANGE_DOWN':
      // Threshold is stored negative (or is compared by magnitude).
      return changePercent <= -Math.abs(threshold);
    default:
      return false;
  }
}

export async function runAlertEvaluator(): Promise<AlertEvaluation> {
  if (running) return { examined: 0, triggered: 0 };
  running = true;

  const result: AlertEvaluation = { examined: 0, triggered: 0 };

  try {
    const now = new Date();

    const alerts = await Alert.find({
      status: 'ACTIVE',
      $or: [{ cooldownUntil: null }, { cooldownUntil: { $lte: now } }],
    }).limit(1000);

    result.examined = alerts.length;
    if (alerts.length === 0) return result;

    // One quote call covers every alert on a given instrument.
    const instrumentIds = [...new Set(alerts.map((a) => a.instrumentId.toString()))];
    const instruments = await Instrument.find({ _id: { $in: instrumentIds } });
    const quotes = await getQuotes(instruments);
    const instrumentById = new Map(instruments.map((i) => [i._id.toString(), i]));

    for (const alert of alerts) {
      const instrument = instrumentById.get(alert.instrumentId.toString());
      if (!instrument) continue;

      const quote = quotes.get(`${instrument.exchange}:${instrument.symbol}`);
      if (!quote) continue;

      alert.lastCheckedAt = now;

      if (!conditionMet(alert.condition, alert.threshold, quote.ltp, quote.changePercent)) {
        await alert.save();
        continue;
      }

      alert.triggeredAt = now;
      alert.triggeredPrice = quote.ltp;

      if (alert.repeat) {
        // Stays armed, but is muted for an hour so a hovering price does not
        // fire the same alert on every pass.
        alert.cooldownUntil = new Date(now.getTime() + REPEAT_COOLDOWN_MS);
      } else {
        alert.status = 'TRIGGERED';
      }

      await alert.save();
      await notifyAlertTriggered(alert, quote.ltp, instrument.currency);
      result.triggered += 1;
    }

    if (result.triggered > 0) {
      logger.info(result, 'Alert evaluator pass complete');
    }

    return result;
  } finally {
    running = false;
    recordWorkerRun('alertEvaluator', 'ok');
  }
}

let interval: NodeJS.Timeout | null = null;
let lastOpportunisticRun = 0;
const OPPORTUNISTIC_MIN_GAP_MS = 60_000;

export function triggerOpportunisticAlertCheck(): void {
  if (!env.ENABLE_WORKERS) return;
  if (Date.now() - lastOpportunisticRun < OPPORTUNISTIC_MIN_GAP_MS) return;

  lastOpportunisticRun = Date.now();
  void runAlertEvaluator().catch((error: unknown) => {
    logger.error({ err: error }, 'Opportunistic alert check failed');
  });
}

export function startAlertEvaluator(): void {
  if (!env.ENABLE_WORKERS || interval) return;

  interval = setInterval(() => {
    void runAlertEvaluator().catch((error: unknown) => {
      logger.error({ err: error }, 'Scheduled alert evaluation failed');
    });
  }, env.ALERT_EVALUATOR_INTERVAL_SECONDS * 1000);

  interval.unref();
  logger.info({ intervalSeconds: env.ALERT_EVALUATOR_INTERVAL_SECONDS }, 'Alert evaluator started');
}

export function stopAlertEvaluator(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
