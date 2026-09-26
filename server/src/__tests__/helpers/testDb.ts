import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * In-memory MongoDB for integration tests.
 *
 * A REPLICA SET, not a standalone: the trading engine wraps each fill in a
 * multi-document transaction, and transactions are unavailable on a standalone
 * server. Testing against a standalone would mean the transaction path is never
 * actually exercised until production.
 */

let replSet: MongoMemoryReplSet | null = null;

export async function startTestDb(): Promise<string> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  const uri = replSet.getUri();
  await mongoose.connect(uri, { dbName: 'smd_test' });
  return uri;
}

export async function stopTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = null;
}

/** Empties every collection between tests without paying to rebuild indexes. */
export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/** True when the connected server supports multi-document transactions. */
export function supportsTransactions(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
