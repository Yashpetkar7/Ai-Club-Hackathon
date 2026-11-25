import { defineConfig } from '@playwright/test';

// Uses the Chrome already on the laptop, so nobody has to download a browser.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5199', channel: process.env.PW_CHANNEL ?? 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort', url: 'http://127.0.0.1:5199', reuseExistingServer: true, timeout: 60_000, env: { DATA_DIR: 'test-results/e2e-data' } },
});
