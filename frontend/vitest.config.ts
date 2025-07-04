import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.tsx'],
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'src/test-setup.tsx',
        'tests/',
        '**/*.d.ts',
        'src/main.tsx',
        'src/service-worker.ts',
        'vite.config.ts',
        'vitest.config.ts'
      ],
      // Realistic targets for solo dev
      thresholds: {
        global: {
          branches: 50,
          functions: 50,
          lines: 60,
          statements: 60
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});