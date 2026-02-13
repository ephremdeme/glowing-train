import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true
  },
  webServer: {
    command: 'corepack pnpm --filter @cryptopay/web dev:e2e',
    port: 3100,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
});
