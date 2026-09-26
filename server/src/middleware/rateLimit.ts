import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ERROR_CODES, type ApiFailure } from '@smd/shared';
import { isTest } from '../config/env.js';
import { getRequestId } from './httpLogger.js';

/**
 * Rate limiting.
 *
 * Uses the in-process memory store. That is correct for a single Render
 * instance; a Redis store would be required to share counters across replicas,
 * and is wired in alongside the Redis client when the deployment scales past
 * one instance.
 *
 * Limits are disabled under test so the suite is not throttled by its own
 * speed - the limiter's behaviour is covered by its own dedicated test.
 */

function buildHandler(message: string) {
  return (req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    const requestId = getRequestId(req);
    const body: ApiFailure = {
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message,
        ...(requestId ? { requestId } : {}),
      },
    };
    res.status(429).json(body);
  };
}

interface LimiterOptions extends Partial<Options> {
  windowMs: number;
  limit: number;
  message: string;
}

function createLimiter(options: LimiterOptions) {
  const { message, ...rest } = options;
  return rateLimit({
    ...rest,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // A no-op limiter keeps the middleware chain identical between test and
    // production, so nothing is skipped that could hide a bug.
    skip: () => isTest,
    handler: buildHandler(message),
  });
}

/** Broad protection for the whole API. */
export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'Too many requests. Please slow down and try again shortly.',
});

/**
 * Credential endpoints. Keyed on IP plus the submitted email so one attacker
 * cannot lock out an entire office NAT, and so spraying many emails from one
 * IP still gets throttled.
 */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many attempts. Please wait a few minutes before trying again.',
  keyGenerator: (req: Request): string => {
    const email =
      typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
        ? (req.body as { email: string }).email.toLowerCase()
        : 'anonymous';
    // `ipKeyGenerator` normalises IPv6 to a /64 subnet. Using `req.ip` raw is
    // rejected by express-rate-limit v8, because a single IPv6 host can cycle
    // through effectively unlimited addresses and trivially evade the limit.
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
});

/** Password reset and verification resend: expensive and email-sending. */
export const sensitiveLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many requests for this action. Please try again in an hour.',
});

/** Order placement, to stop a runaway client hammering the trading engine. */
export const tradingLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'You are placing orders too quickly. Please wait a moment.',
});

/** Market data, which fans out to rate-limited upstream providers. */
export const marketDataLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: 'Too many market data requests. Please wait a moment.',
});
