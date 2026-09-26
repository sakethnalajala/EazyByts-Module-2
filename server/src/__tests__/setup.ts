import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import mongoose from 'mongoose';
import { invalidateRoleCache } from '../modules/roles/role.service.js';
import { invalidateConfigCache } from '../modules/admin/config.service.js';

/**
 * Per-file database lifecycle.
 *
 * Connects to the shared in-memory replica set started by globalSetup, and
 * wipes every collection after each test so files and cases cannot leak state
 * into one another.
 */

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: `smd_test_${process.pid}` });
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));

  // These caches hold documents that were just deleted. Without clearing them,
  // the next test reads permissions and config for rows that no longer exist.
  invalidateRoleCache();
  invalidateConfigCache();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
