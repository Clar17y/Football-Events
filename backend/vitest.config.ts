import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const RUN_DB_TESTS = process.env['RUN_DB_TESTS'] === 'true';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: RUN_DB_TESTS
      ? []
      : [
          'tests/api/**',
          'tests/routes/**',
          'tests/schema-alignment/**',
          'tests/integration/**',
          'tests/unit/naturalKeyResolver.test.ts',
        ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'src/app.ts',
        'dist/',
        'vitest.config.ts'
      ],
      thresholds: {
        global: {
          branches: 60,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../shared')
    }
  }
});
