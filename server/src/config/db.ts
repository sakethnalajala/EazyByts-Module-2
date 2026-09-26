import mongoose from 'mongoose';
import type { DependencyStatus } from '@smd/shared';
import { env, isProduction, isTest } from './env.js';
import { logger } from './logger.js';
import { probeTransactionSupport } from '../lib/transaction.js';

/**
 * MongoDB Atlas connection.
 *
 * Connecting is deliberately non-fatal. If Atlas is unreachable the process
 * still boots and /health keeps answering, while /ready reports `degraded` so
 * the platform can route around it. A hard crash here would mean a transient
 * Atlas blip takes the whole service down until someone redeploys.
 */

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

let connectPromise: Promise<void> | null = null;
let attempt = 0;

mongoose.set('strictQuery', true);
// Index builds are convenient locally but a foot-gun against a live Atlas tier.
mongoose.set('autoIndex', !isProduction);

mongoose.connection.on('connected', () => {
  attempt = 0;
  logger.info({ db: env.MONGODB_DB_NAME }, 'MongoDB connected');

  // Determine up front whether this deployment can run multi-document
  // transactions, rather than discovering it from a failed write later.
  void probeTransactionSupport().catch((error: unknown) => {
    logger.warn({ err: error }, 'Transaction support probe failed');
  });
});
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});
mongoose.connection.on('error', (error: unknown) => {
  logger.error({ err: error }, 'MongoDB connection error');
});

async function attemptConnection(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    // Atlas M0 caps connections tightly; a small pool leaves room for workers.
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Left to the driver: it enables retryable writes on a replica set (Atlas)
    // and disables them on a standalone, which rejects the option outright.
  });
}

/** Connects with exponential backoff. Never rejects; failures are logged. */
export function connectDatabase(): Promise<void> {
  connectPromise ??= (async function run(): Promise<void> {
    try {
      await attemptConnection();
    } catch (error) {
      attempt += 1;
      const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
      logger.error(
        { err: error, attempt, retryInMs: delay },
        'MongoDB connection failed; service starts in degraded mode and will retry',
      );
      if (isTest) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return run();
    }
  })();

  return connectPromise;
}

export async function disconnectDatabase(): Promise<void> {
  connectPromise = null;
  await mongoose.connection.close(false);
  logger.info('MongoDB connection closed');
}

/** Actively pings the server rather than trusting the cached readyState. */
export async function checkDatabase(): Promise<DependencyStatus> {
  if (
    mongoose.connection.readyState !== mongoose.ConnectionStates.connected ||
    !mongoose.connection.db
  ) {
    return { state: 'down', message: 'not connected' };
  }

  const startedAt = performance.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { state: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      state: 'down',
      latencyMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : 'ping failed',
    };
  }
}
