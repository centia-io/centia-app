import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    server: { port: 4000 },
    resolve: {
      alias: {
        '@centia-io/sdk': path.resolve(__dirname, 'node_modules/@centia-io/sdk/dist/centia-io-sdk.js'),
      },
    },
  };
});
