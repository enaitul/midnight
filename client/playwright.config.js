import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './node_modules/.cache/playwright-test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
