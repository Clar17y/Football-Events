import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@shared': '/src/../shared',
    },
  },
  server: {
    open: true,
    historyApiFallback: true,
  },
});
