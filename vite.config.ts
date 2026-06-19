import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { port: 4000 },
  resolve: {
    alias: {
      '@centia-io/sdk': path.resolve(__dirname, 'node_modules/@centia-io/sdk/dist/centia-io-sdk.js'),
    },
  },
  build: {
    rollupOptions: {
      // The SDK's Node-only configstore token store is loaded via guarded
      // dynamic imports that never run in the browser. Keep these Node-only
      // packages out of the browser bundle so Rollup doesn't try to resolve
      // their `node:*` imports (e.g. stubborn-fs -> node:util `promisify`).
      external: ['configstore', 'proper-lockfile'],
    },
  },
});
