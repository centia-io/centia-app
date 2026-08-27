import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 4000,
    proxy: {
      '/agent': {
        target: 'http://localhost:8790',
        rewrite: (p) => p.replace(/^\/agent/, ''),
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@centia-io/sdk': path.resolve(__dirname, 'node_modules/@centia-io/sdk/dist/centia-io-sdk.js'),
    },
  },
  build: {
    rollupOptions: {
    },
  },
});
