import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

/**
 * Starts ONE in-memory MongoDB replica set for the whole run.
 *
 * Per-file instances would cost several seconds each; this starts once and
 * hands the URI to every test file through vitest's provide/inject channel.
 *
 * It is a replica set rather than a standalone because the trading engine
 * wraps each fill in a multi-document transaction, which a standalone cannot
 * do. Testing against a standalone would silently skip that entire code path.
 */

declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string;
  }
}

let replSet: MongoMemoryReplSet | null = null;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  project.provide('mongoUri', replSet.getUri());

  return async () => {
    await replSet?.stop();
    replSet = null;
  };
}
