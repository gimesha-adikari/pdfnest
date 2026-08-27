import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Safely load dedicated E2E test environment variables from git-ignored local env file
const dedicatedEnvFile = path.resolve(__dirname, '.env.test.local');

if (fs.existsSync(dedicatedEnvFile)) {
  const content = fs.readFileSync(dedicatedEnvFile, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * PDFNest End-to-End Testing Configuration
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run sequentially to avoid backend CPU/worker exhaustion
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker thread to respect Go limiter and Python OCR Tesseract worker limits
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  timeout: 120_000, // 2 minutes max per test
  expect: {
    timeout: 30_000, // 30s timeout for individual assertions
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
