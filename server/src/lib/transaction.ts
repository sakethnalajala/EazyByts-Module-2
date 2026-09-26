import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../config/logger.js';

/**
 * Transaction helper with an honest standalone fallback.
 *
 * MongoDB multi-document transactions require a replica set or a sharded
 * cluster. Atlas - including the free M0 tier - is always a replica set, so
 * production and CI get real atomicity. A developer running a plain local
 * `mongod`, however, gets errors like "Transaction numbers are only allowed on
 * a replica set member or mongos".
 *
 * Support is DETECTED by probing the server topology once after connecting,
 * not by pattern-matching error messages. Message matching proved fragile: the
 * same underlying limitation surfaces as "does not support retryable writes"
 * in some driver paths and as "transaction numbers are only allowed..." in
 * others, and a missed variant means a 500 instead of a graceful fallback.
 *
 * When transactions are unavailable the same callback runs WITHOUT a session
 * and a loud warning is logged, because that path is genuinely weaker: a crash
 * mid-write could leave the ledger inconsistent. It is a local-development
 * convenience, never a production path.
 */

let transactionsSupported: boolean | null = null;
let warnedAboutFallback = false;

interface HelloResponse {
  /** Present on a replica set member. */
  setName?: string;
  /** 'isdbgrid' on a mongos router. */
  msg?: string;
}

/**
 * Asks the server what it is. A replica set reports `setName`; a mongos
 * reports `msg: 'isdbgrid'`. Anything else is a standalone.
 */
export async function probeTransactionSupport(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) {
    transactionsSupported = false;
    return false;
  }

  try {
    const hello = (await db.admin().command({ hello: 1 })) as HelloResponse;
    const supported = Boolean(hello.setName) || hello.msg === 'isdbgrid';

    transactionsSupported = supported;

    if (supported) {
      logger.info('MongoDB supports multi-document transactions (replica set or mongos)');
    } else {
      logger.warn(
        'MongoDB is running as a STANDALONE server, which cannot do multi-document ' +
          'transactions. Trading writes will run without atomicity. This is fine for local ' +
          'development; MongoDB Atlas is always a replica set and gets full transactions.',
      );
    }

    return supported;
  } catch (error) {
    // If the probe itself fails, assume the safer-to-run option and let the
    // per-call error handling below catch anything unexpected.
    logger.warn({ err: error }, 'Could not determine transaction support; assuming unavailable');
    transactionsSupported = false;
    return false;
  }
}

/** Walks an error and its nested causes looking for the standalone signature. */
function isUnsupportedTransactionError(error: unknown, depth = 0): boolean {
  if (depth > 4 || !(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  if (
    message.includes('transaction numbers are only allowed') ||
    message.includes('does not support retryable writes') ||
    message.includes('transactions are not supported') ||
    message.includes('replica set member or mongos')
  ) {
    return true;
  }

  const candidate = error as { code?: number; cause?: unknown; originalError?: unknown };
  if (candidate.code === 20 || candidate.code === 263) return true;

  return (
    isUnsupportedTransactionError(candidate.cause, depth + 1) ||
    isUnsupportedTransactionError(candidate.originalError, depth + 1)
  );
}

export function resetTransactionSupportCache(): void {
  transactionsSupported = null;
}

/** True/false once probed, null before the first probe. */
export function getTransactionSupport(): boolean | null {
  return transactionsSupported;
}

function warnOnce(): void {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;
  logger.warn(
    'Running trading writes WITHOUT a transaction because this MongoDB deployment ' +
      'does not support them. Acceptable for local development only.',
  );
}

/**
 * Runs `work` inside a transaction when the deployment supports one.
 *
 * The callback receives a session or `undefined`; every model call inside must
 * pass it along so the writes actually join the transaction.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  // Probe lazily if the connection came up after this module loaded.
  if (transactionsSupported === null) {
    await probeTransactionSupport();
  }

  if (transactionsSupported === false) {
    warnOnce();
    return work(undefined);
  }

  const session = await mongoose.startSession();

  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    // Definite assignment: withTransaction always runs the callback.
    return result!;
  } catch (error) {
    if (isUnsupportedTransactionError(error)) {
      // The probe said yes but the server disagrees - trust the server.
      transactionsSupported = false;
      warnOnce();
      return work(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
