import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

process.env.PLATEN_EDITOR_EXTRACTION_E2E = "1";

export default defineConfig({
    testDir: ".",
    testMatch: "editor-extraction-transport.spec.ts",
    workers: 1,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 20_000 },
    outputDir: process.env.PLATEN_EDITOR_TEST_OUTPUT ?? path.join(os.tmpdir(), "platen-editor-extraction-test"),
    use: {
        baseURL: process.env.PLATEN_EDITOR_TEST_ORIGIN ?? "http://localhost:3000",
        browserName: "chromium",
        serviceWorkers: "block",
        launchOptions: {
            executablePath: process.env.PLATEN_EDITOR_TEST_CHROMIUM,
            chromiumSandbox: true,
        },
        trace: "off",
        screenshot: "off",
        video: "off",
    },
});
