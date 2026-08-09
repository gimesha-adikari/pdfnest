import { defineConfig, devices } from '@playwright/test';

/**
 * PDFNest End-to-End Testing Configuration
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run sequentially or with controlled parallelism to avoid backend CPU/worker exhaustion
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker thread to respect Go limiter and Python OCR Tesseract worker limits
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  timeout: 120_000, // 2 minutes max per test (async OCR/conversions take time)
  expect: {
    timeout: 30_000, // 30s timeout for individual assertions
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
