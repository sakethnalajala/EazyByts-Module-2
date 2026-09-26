import type { Request, Response } from 'express';
import type { HealthPayload, ReadyPayload } from '@smd/shared';
import { checkDatabase } from '../../config/db.js';
import { checkCache } from '../../services/cache/cache.js';
import { env } from '../../config/env.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../../constants/app.js';
import { sendSuccess } from '../../utils/response.js';

/**
 * Liveness. Answers only "is this process up?" and therefore touches no
 * dependency - a slow Atlas must never make the platform kill a healthy node.
 */
export function getHealth(_req: Request, res: Response): void {
  const payload: HealthPayload = {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
  sendSuccess(res, payload);
}

/**
 * Readiness. Actively probes each dependency.
 *
 * Mongo being down means we cannot serve real traffic, so the response is 503
 * `degraded`. Redis is optional by design - every consumer has an in-process
 * fallback - so it never downgrades readiness on its own.
 */
export async function getReady(_req: Request, res: Response): Promise<void> {
  const [mongo, redis] = await Promise.all([checkDatabase(), checkCache()]);
  const isReady = mongo.state === 'up';

  const payload: ReadyPayload = {
    status: isReady ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    dependencies: { mongo, redis },
  };

  sendSuccess(res, payload, isReady ? 200 : 503);
}
