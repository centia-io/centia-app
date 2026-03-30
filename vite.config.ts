import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/';
  return {
    base,
    plugins: [react()],
    server: { port: 4000 },
    resolve: {
      alias: {
        '@centia-io/sdk': path.resolve(__dirname, 'node_modules/@centia-io/sdk/dist/centia-io-sdk.js'),
      },
    },
  };
});
