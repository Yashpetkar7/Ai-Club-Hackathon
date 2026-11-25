import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { apiDevPlugin } from './server/dev-plugin.mjs';
// @ts-expect-error plain JS, shared with the server
import { csp } from './server/headers.mjs';

export default defineConfig({
  plugins: [react(), apiDevPlugin(), { name: 'page-policy', apply: 'build', transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }] }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: false },
  // Prepared up front, so opening a page for the first time never reloads the site.
  optimizeDeps: { include: ['@huggingface/transformers', 'citeproc', 'docx', 'three'] },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    // Tests never touch the real saved data.
    env: { DATA_DIR: 'test-results/unit-data' },
    // The citation engine reads large style files, which is slow on a busy laptop.
    testTimeout: 30_000,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
