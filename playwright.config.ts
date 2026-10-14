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

const managedTarget = Boolean(process.env.E2E_BASE_URL);
const managedStorageState = process.env.E2E_STORAGE_STATE || undefined;
const isolatedPrivacySuite = process.env.PLATEN_M1_PRIVACY_E2E === '1';
const privacyAppPort = process.env.PLATEN_M1_PRIVACY_PORT || '3000';
const privacyAppOrigin = `http://127.0.0.1:${privacyAppPort}`;
const privacyMockApiOrigin = 'http://127.0.0.1:3999';

if (isolatedPrivacySuite) {
  process.env.PLATEN_M1_PRIVACY_APP_ORIGIN = privacyAppOrigin;
}

/**
 * PDFNest End-to-End Testing Configuration
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  // The Milestone 1 privacy browser suite requires explicit local API/app mocks.
  // Keep it out of the default Playwright run unless the task verifier opts in.
  testIgnore: process.env.PLATEN_M1_PRIVACY_E2E === '1'
    ? []
    : ['**/security/milestone-1/protected-input-privacy.spec.ts'],
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
    baseURL: isolatedPrivacySuite
      ? privacyAppOrigin
      : process.env.E2E_BASE_URL || 'http://localhost:3000',
    ...(!isolatedPrivacySuite && managedStorageState ? { storageState: managedStorageState } : {}),
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

  ...(managedTarget && !isolatedPrivacySuite
    ? {}
    : {
        webServer: {
          command: isolatedPrivacySuite
            ? `npm run dev -- --hostname 127.0.0.1 --port ${privacyAppPort}`
            : 'npm run dev',
          url: isolatedPrivacySuite ? privacyAppOrigin : 'http://localhost:3000',
          reuseExistingServer: !isolatedPrivacySuite,
          ...(isolatedPrivacySuite
            ? { env: { NEXT_PUBLIC_API_URL: privacyMockApiOrigin } }
            : {}),
          timeout: 60_000,
        },
      }),
});
