import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
    requireExplicitLoopbackOrigin,
    requireRevision,
} from "./tests/security/milestone-1/previewIntegrationTarget";

if (process.env.PLATEN_M1_PREVIEW_BACKEND_E2E !== "1") {
    throw new Error("Set PLATEN_M1_PREVIEW_BACKEND_E2E=1 to run the real-backend preview integration suite.");
}

const appOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_APP_ORIGIN,
    "PLATEN_M1_PREVIEW_APP_ORIGIN",
);
const backendOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_BACKEND_ORIGIN,
    "PLATEN_M1_PREVIEW_BACKEND_ORIGIN",
);
const workerOrigin = requireExplicitLoopbackOrigin(
    process.env.PLATEN_M1_PREVIEW_WORKER_ORIGIN,
    "PLATEN_M1_PREVIEW_WORKER_ORIGIN",
);
const backendRevision = requireRevision(
    process.env.PLATEN_M1_BACKEND_REVISION,
    "PLATEN_M1_BACKEND_REVISION",
);
const workerRevision = requireRevision(
    process.env.PLATEN_M1_WORKER_REVISION,
    "PLATEN_M1_WORKER_REVISION",
);

function requirePinnedCleanCheckout(raw: string | undefined, name: string, expectedRevision: string): string {
    if (!raw?.trim() || !path.isAbsolute(raw)) {
        throw new Error(`${name} must be explicitly set to an absolute checkout path.`);
    }
    const repository = fs.realpathSync(raw);
    const head = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const status = execFileSync("git", ["-C", repository, "status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim();
    if (head !== expectedRevision || status !== "") {
        throw new Error(`${name} must be clean and at its explicitly supplied revision.`);
    }
    return repository;
}

const backendRepository = requirePinnedCleanCheckout(
    process.env.PLATEN_M1_BACKEND_REPO,
    "PLATEN_M1_BACKEND_REPO",
    backendRevision,
);
const workerRepository = requirePinnedCleanCheckout(
    process.env.PLATEN_M1_WORKER_REPO,
    "PLATEN_M1_WORKER_REPO",
    workerRevision,
);

const appUrl = new URL(appOrigin);
const ports = [appUrl.port, new URL(backendOrigin).port, new URL(workerOrigin).port];
if (new Set(ports).size !== ports.length) {
    throw new Error("Frontend, backend, and worker integration origins must use distinct loopback ports.");
}

function requireTaskTempDirectory(raw: string | undefined, name: string): string {
    if (!raw?.trim()) {
        throw new Error(`${name} must be explicitly set to a task-owned directory under the system temporary directory.`);
    }

    const resolved = path.resolve(raw);
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    if (!resolved.startsWith(`${temporaryRoot}${path.sep}`)) {
        throw new Error(`${name} must be inside the system temporary directory.`);
    }
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
        throw new Error(`${name} must not be a symbolic link.`);
    }
    return resolved;
}

const fixtureDirectory = requireTaskTempDirectory(
    process.env.PLATEN_M1_FIXTURE_DIR,
    "PLATEN_M1_FIXTURE_DIR",
);
const workerSessionDirectory = requireTaskTempDirectory(
    process.env.PLATEN_M1_WORKER_SESSION_DIR,
    "PLATEN_M1_WORKER_SESSION_DIR",
);
const evidenceDirectory = requireTaskTempDirectory(
    process.env.PLATEN_M1_PREVIEW_EVIDENCE_DIR,
    "PLATEN_M1_PREVIEW_EVIDENCE_DIR",
);

for (const [directory, name] of [
    [fixtureDirectory, "PLATEN_M1_FIXTURE_DIR"],
    [workerSessionDirectory, "PLATEN_M1_WORKER_SESSION_DIR"],
    [evidenceDirectory, "PLATEN_M1_PREVIEW_EVIDENCE_DIR"],
] as const) {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        throw new Error(`${name} must name an existing task-owned directory.`);
    }
}

// Retain these in the config's validated environment so the test process can
// state exactly which checked-out server versions it is qualifying.
process.env.PLATEN_M1_BACKEND_REVISION = backendRevision;
process.env.PLATEN_M1_WORKER_REVISION = workerRevision;

export default defineConfig({
    testDir: "./tests/security/milestone-1",
    testMatch: "preview-backend.integration.spec.ts",
    fullyParallel: false,
    workers: 1,
    forbidOnly: true,
    reporter: "list",
    timeout: 120_000,
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
            // .env.local exists in this checkout. Keep the test server from
            // adopting any local OAuth, billing, object-storage, or worker
            // credential even if Next reads that file during startup.
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
        backendOrigin,
        workerOrigin,
        backendRevision,
        workerRevision,
        backendRepository,
        workerRepository,
        fixtureDirectory,
        workerSessionDirectory,
    },
});
