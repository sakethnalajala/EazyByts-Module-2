import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/__tests__/globalSetup.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    // Booting a mongod and hashing with argon2 are both deliberately slow.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // The env module parses process.env at import time, so the test
    // environment has to be complete before any source file loads.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
      MONGODB_DB_NAME: 'smd_test',
      CORS_ORIGINS: 'http://localhost:5173',
      PORT: '5099',
      TRUST_PROXY: '0',
      APP_URL: 'http://localhost:5173',
      // DEMO_PASSWORD deliberately unset: it is a global override, and setting
      // it here would mask the per-account passwords the tests need to verify.
      // Workers would fight the test database; they get their own tests.
      ENABLE_WORKERS: 'false',
      // Deterministic market data, so no test depends on a live provider.
      MARKET_DATA_FORCE_MOCK: 'true',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/__tests__/**', 'src/db/*.data.ts'],
    },
  },
});
