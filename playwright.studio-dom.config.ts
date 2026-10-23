import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "studio-v2-page-selection.dom.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 900, height: 600 },
  },
});
