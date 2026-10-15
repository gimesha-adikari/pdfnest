import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    requireExplicitLoopbackOrigin,
    requireRevision,
} from "./tests/security/milestone-1/previewIntegrationTarget";

if (process.env.PLATEN_M1_PROTECTED_OUTPUT_E2E !== "1") {
    throw new Error("Set PLATEN_M1_PROTECTED_OUTPUT_E2E=1 to run protected-output backend qualification.");
}

const appOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_S203_APP_ORIGIN,
    "PLATEN_M1_S203_APP_ORIGIN",
);
const backendOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_S203_BACKEND_ORIGIN,
    "PLATEN_M1_S203_BACKEND_ORIGIN",
);
const backendRevision = requireRevision(
    process.env.PLATEN_M1_S203_BACKEND_REVISION,
    "PLATEN_M1_S203_BACKEND_REVISION",
);
const backendRepositoryPath = process.env.PLATEN_M1_S203_BACKEND_REPO;
if (!backendRepositoryPath || !path.isAbsolute(backendRepositoryPath)) {
    throw new Error("PLATEN_M1_S203_BACKEND_REPO must be an explicit absolute checkout path.");
}
const backendRepository = fs.realpathSync(backendRepositoryPath);
const actualBackendRevision = execFileSync(
    "git",
    ["-C", backendRepository, "rev-parse", "HEAD"],
    { encoding: "utf8" },
).trim();
const backendStatus = execFileSync(
    "git",
    ["-C", backendRepository, "status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
).trim();
if (actualBackendRevision !== backendRevision || backendStatus !== "") {
    throw new Error("Backend checkout must be clean and at the explicitly supplied revision.");
}

const appUrl = new URL(appOrigin);
const backendUrl = new URL(backendOrigin);
if (appUrl.port === backendUrl.port) {
    throw new Error("The frontend and backend must use distinct loopback ports.");
}

function requireTemporaryDirectory(raw: string | undefined, name: string, create: boolean): string {
    if (!raw?.trim()) throw new Error(`${name} must be explicitly set under the system temporary directory.`);
    const resolved = path.resolve(raw);
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    if (!resolved.startsWith(`${temporaryRoot}${path.sep}`)) {
        throw new Error(`${name} must be inside the system temporary directory.`);
    }
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
        throw new Error(`${name} must not be a symbolic link.`);
    }
    if (create) fs.mkdirSync(resolved, { recursive: true });
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error(`${name} must name an existing task-owned directory.`);
    }
    return resolved;
}

const fixtureDirectory = requireTemporaryDirectory(
    process.env.PLATEN_M1_S203_FIXTURE_DIR,
    "PLATEN_M1_S203_FIXTURE_DIR",
    false,
);
for (const fixture of [
    "plain-two-pages.pdf",
    "protected-alpha.pdf",
    "plain-merge-alpha.pdf",
    "plain-merge-beta.pdf",
    "protected-merge-alpha-aes128.pdf",
    "protected-merge-beta-aes256.pdf",
]) {
    if (!fs.existsSync(path.join(fixtureDirectory, fixture))) {
        throw new Error(`Required synthetic fixture is missing: ${fixture}`);
    }
}
const evidenceDirectory = requireTemporaryDirectory(
    process.env.PLATEN_M1_S203_EVIDENCE_DIR,
    "PLATEN_M1_S203_EVIDENCE_DIR",
    true,
);

process.env.PLATEN_M1_S203_BACKEND_REVISION = backendRevision;
process.env.PLATEN_M1_S203_FIXTURE_DIR = fixtureDirectory;
process.env.PLATEN_M1_S203_EVIDENCE_DIR = evidenceDirectory;

export default defineConfig({
    testDir: "./tests/security/milestone-1",
    testMatch: "protected-output-backend.integration.spec.ts",
    fullyParallel: false,
    workers: 1,
    forbidOnly: true,
    reporter: "list",
    timeout: 180_000,
    expect: { timeout: 30_000 },
    outputDir: path.join(evidenceDirectory, "playwright-output"),
    use: {
        baseURL: appOrigin,
        serviceWorkers: "block",
        trace: "off",
        screenshot: "off",
        video: "off",
    },
    projects: [{
        name: "chromium",
        use: { ...devices["Desktop Chrome"], channel: "chrome" },
    }],
    webServer: {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${appUrl.port}`,
        url: appOrigin,
        reuseExistingServer: false,
        timeout: 90_000,
        env: {
            NEXT_PUBLIC_API_URL: backendOrigin,
            NEXT_PUBLIC_APP_URL: appOrigin,
            NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
            NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "",
            NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN: "",
            NEXT_PUBLIC_PADDLE_ENV: "sandbox",
            NEXT_PUBLIC_DIRECT_R2_UPLOAD: "false",
            NEXT_PUBLIC_R2_PRESIGN_ENDPOINT: "",
            NEXT_PUBLIC_OCR_JOB_CREATE_ENDPOINT: "",
            MAIL_DOMAIN: "",
            WORKER_SHARED_SECRET: "",
            EDIT_PDF_EDITOR_ENGINE: "",
            NEXT_TELEMETRY_DISABLED: "1",
        },
    },
    metadata: {
        appOrigin,
        backendOrigin,
        backendRevision,
        backendRepository,
        fixtureDirectory,
        evidenceDirectory,
    },
});
