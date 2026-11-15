import { defineConfig, chromium } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

// Explicit opt-in, local-only, isolated browser. Never use the project config's
// personal/system Chrome channel or an existing browser/profile/storage state.
export default defineConfig({
  testDir: '.', testMatch: 'phase5-browser-acceptance.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, timeout: 240_000,
  expect: { timeout: 30_000 }, reporter: [['list']],
  outputDir: process.env.PLATEN_PHASE5_EVIDENCE_DIR
    ? path.join(process.env.PLATEN_PHASE5_EVIDENCE_DIR, 'playwright-output')
    : path.join(os.tmpdir(), 'platen-phase5-playwright-output'),
  use: {
    baseURL: 'http://localhost:3000', browserName: 'chromium', headless: true,
    viewport: { width: 1440, height: 1100 }, acceptDownloads: true,
    actionTimeout: 30_000, navigationTimeout: 60_000,
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions: { executablePath: chromium.executablePath(), chromiumSandbox: true },
    trace: 'off', video: 'off', screenshot: 'off',
  },
});
