import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Component tests run in jsdom.
 *
 * These exist because of a real failure: a `Button asChild` passed two
 * children to Radix's Slot, which throws at render time and blanked the entire
 * page. Type-checking, linting and the API test suite were all green — nothing
 * caught it, because nothing ever mounted the app. These tests do.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 15_000,
    env: {
      VITE_API_BASE_URL: '/api/v1',
      VITE_APP_NAME: 'Stock Market Dashboard',
    },
  },
});
