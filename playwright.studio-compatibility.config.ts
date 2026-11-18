import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.STUDIO_BASE_URL || "http://localhost:3000";
const outputDir = process.env.STUDIO_EVIDENCE_DIR || path.join(process.cwd(), "studio-evidence");

export default defineConfig({
  testDir: "./tests/studio-compatibility",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 900_000,
  expect: { timeout: 45_000 },
  reporter: [["list"], ["./scripts/studio-compatibility/safe-reporter.mjs"]],
  outputDir: path.join(outputDir, "playwright-output"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
