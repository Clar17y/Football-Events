import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Cloud replay checks drive the real frontend data layer and sync service against a running
// backend and a disposable PostgreSQL database. See tests/cloud/README.md before running them.
export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://127.0.0.1:5173/' } },
    include: ['tests/cloud/**/*.cloud.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});
