import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { staticAssets } from './scripts/static-assets.ts';

export default defineConfig({
  plugins: [staticAssets(), react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            // Translate only a verified same-origin dev request. The Function
            // still rejects foreign origins, locally and in production.
            if (request.headers.origin === `http://${request.headers.host}`) {
              proxyRequest.setHeader('origin', 'http://127.0.0.1:8788');
            }
          });
        },
      },
    },
  },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts', 'functions/**/*.test.ts'], environment: 'node' },
});
