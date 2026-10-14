import { test, expect, type Page, type Request, type Route } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireExplicitLoopbackOrigin, requireRevision } from "./previewIntegrationTarget";

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
const fixtureDirectory = process.env.PLATEN_M1_S203_FIXTURE_DIR;
const evidenceDirectory = process.env.PLATEN_M1_S203_EVIDENCE_DIR;
if (!fixtureDirectory || !evidenceDirectory) {
    throw new Error("The protected-output integration configuration must validate fixture and evidence paths.");
}

const plainPdf = readFileSync(path.join(fixtureDirectory, "plain-two-pages.pdf"));
const protectedAlpha = readFileSync(path.join(fixtureDirectory, "protected-alpha.pdf"));
const sourcePassword = "platen-m1-user-alpha";
const outputPassword = "platen-m1-output-alpha";
const wrongPassword = "platen-m1-wrong-password";

type RequestEvidence = {
    request: Request;
    method: string;
    path: string;
    requestContentType?: string;
    body?: Buffer;
    status?: number;
    contentType?: string;
};

type DelayedResponse = {
    path: string;
    responseStatus?: number;
    fetched: Promise<void>;
    finished: Promise<void>;
    release: () => void;
    waitForRelease: Promise<void>;
    markFetched: () => void;
    markFinished: () => void;
};

type FailureResponse = { path: string; status: number };
type ResponseOverride = { path: string; status: number; contentType: string; body: Buffer };

type NetworkEvidence = {
    requests: RequestEvidence[];
    blockedOrigins: Set<string>;
    byRequest: WeakMap<Request, RequestEvidence>;
    delayed: DelayedResponse | null;
    failure: FailureResponse | null;
    responseOverride: ResponseOverride | null;
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve = () => {};
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

function createDelayedResponse(pathname: string): DelayedResponse {
    const fetched = deferred();
    const finished = deferred();
    const gate = deferred();
    return {
        path: pathname,
        fetched: fetched.promise,
        finished: finished.promise,
        release: gate.resolve,
        waitForRelease: gate.promise,
        markFetched: fetched.resolve,
        markFinished: finished.resolve,
    };
}

async function installNetworkBoundary(page: Page): Promise<NetworkEvidence> {
    const evidence: NetworkEvidence = {
        requests: [],
        blockedOrigins: new Set<string>(),
        byRequest: new WeakMap<Request, RequestEvidence>(),
        delayed: null,
        failure: null,
        responseOverride: null,
    };

    await page.context().route("**/*", async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== appOrigin && url.origin !== backendOrigin) {
            evidence.blockedOrigins.add(url.origin);
            await route.abort("blockedbyclient");
            return;
        }

        if (url.origin === backendOrigin && url.pathname.startsWith("/api/")) {
            const event: RequestEvidence = {
                request,
                method: request.method(),
                path: url.pathname,
                requestContentType: request.headers()["content-type"],
                ...(request.method() === "POST" ? { body: request.postDataBuffer() ?? Buffer.alloc(0) } : {}),
            };
            evidence.requests.push(event);
            evidence.byRequest.set(request, event);

            if (request.method() === "POST" && evidence.responseOverride?.path === url.pathname) {
                const override = evidence.responseOverride;
                evidence.responseOverride = null;
                await route.fulfill({
                    status: override.status,
                    contentType: override.contentType,
                    headers: {
                        "access-control-allow-origin": appOrigin,
                        "access-control-allow-credentials": "true",
                    },
                    body: override.body,
                });
                return;
            }

            if (request.method() === "POST" && evidence.failure?.path === url.pathname) {
                const status = evidence.failure.status;
                evidence.failure = null;
                await route.fulfill({
                    status,
                    contentType: "application/json",
                    headers: {
                        "access-control-allow-origin": appOrigin,
                        "access-control-allow-credentials": "true",
                    },
                    body: JSON.stringify({ error: "Synthetic integration failure." }),
                });
                return;
            }

            if (request.method() === "POST" && evidence.delayed?.path === url.pathname) {
                const delayed = evidence.delayed;
                try {
                    const response = await route.fetch({ timeout: 90_000 });
                    delayed.responseStatus = response.status();
                    delayed.markFetched();
                    await delayed.waitForRelease;
                    await route.fulfill({ response });
                } finally {
                    delayed.markFinished();
                }
                return;
            }
        }

        await route.continue();
    });

    page.on("response", (response) => {
        const event = evidence.byRequest.get(response.request());
        if (!event) return;
        event.status = response.status();
        event.contentType = response.headers()["content-type"] ?? "";
    });

    return evidence;
}

async function assertBackendReady(): Promise<void> {
    const response = await fetch(`${backendOrigin}/api/health`, { signal: AbortSignal.timeout(5_000) });
    expect(response.status, `backend revision ${backendRevision} health`).toBe(200);
    const health = await response.json() as { status?: string; service?: { environment?: string } };
    expect(health.status).toBe("healthy");
    expect(health.service?.environment).toBe("development");
}

async function openTool(page: Page, tool: "lock-pdf" | "rotate-pdf", evidence: NetworkEvidence): Promise<void> {
    await page.goto(`/${tool}`);
    await expect(page.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
    await expect.poll(() => evidence.requests.some((entry) =>
        entry.method === "GET" && entry.path === "/api/health" && entry.status === 200
    )).toBe(true);
}

async function choosePdf(page: Page, name: string, bytes: Buffer): Promise<void> {
    await page.locator('input[type="file"]').first().setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: bytes,
    });
}

async function prepareCloudLock(page: Page, evidence: NetworkEvidence): Promise<void> {
    await openTool(page, "lock-pdf", evidence);
    await choosePdf(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(outputPassword);
}

async function assertInvalidCloudLockDoesNotPublish(
    page: Page,
    evidence: NetworkEvidence,
    scenario: string,
    response: ResponseOverride,
): Promise<void> {
    await prepareCloudLock(page, evidence);
    evidence.responseOverride = response;
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();
    await expect.poll(() => evidence.requests.find((entry) => entry.path === "/api/security/lock")?.status).toBe(200);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await expect(page.getByText(/could not be confirmed; no download was created/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    const lockRequest = evidence.requests.find((entry) => entry.path === "/api/security/lock");
    expect(lockRequest?.contentType?.toLowerCase()).toContain("application/pdf");
    expect(multipartFields(lockRequest?.body)).toEqual(["file", "password"]);
    expect(lockRequest?.body?.toString("latin1")).toContain(`name="password"\r\n\r\n${outputPassword}`);
    assertNoProductionOrFallbackRequests(evidence);
    logSummary(scenario, evidence);
}

async function prepareProtectedRotate(page: Page, evidence: NetworkEvidence): Promise<void> {
    await openTool(page, "rotate-pdf", evidence);
    await choosePdf(page, "protected-alpha.pdf", protectedAlpha);
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(preparation).toBeVisible();
    await preparation.getByRole("button", { name: "Device", exact: true }).click();
    await preparation.getByLabel("PDF password").fill(sourcePassword);
    await preparation.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    expect(evidence.requests.filter((entry) => entry.method === "POST" && entry.path.startsWith("/api/"))).toHaveLength(0);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cloud", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Executes on Platen .*cloud (processing|engine)/i)).toBeVisible();
}

async function requestRotation(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Rotate all 90°" }).click();
    await page.getByRole("button", { name: "Apply Rotation Matrices" }).click();
}

function qpdfText(args: string[]): string {
    try {
        return execFileSync("qpdf", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
        throw new Error("Independent qpdf validation failed.");
    }
}

function verifyEncryptedPdf(
    pdfPath: string,
    expectedPassword: string,
    expectedPageCount: number,
    expectedRotation?: number,
): void {
    qpdfText([`--password=${expectedPassword}`, "--check", pdfPath]);
    const withoutPassword = spawnSync("qpdf", ["--check", pdfPath], { stdio: "ignore" });
    expect(withoutPassword.status).not.toBe(0);
    const wrongPasswordResult = spawnSync("qpdf", [`--password=${wrongPassword}`, "--check", pdfPath], { stdio: "ignore" });
    expect(wrongPasswordResult.status).not.toBe(0);

    const encryption = qpdfText([`--password=${expectedPassword}`, "--show-encryption", pdfPath]);
    expect(encryption).toMatch(/stream encryption method: AESv2\b/);
    expect(encryption).toMatch(/string encryption method: AESv2\b/);

    let info: string;
    let text: string;
    try {
        info = execFileSync("pdfinfo", ["-upw", expectedPassword, pdfPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        text = execFileSync("pdftotext", ["-upw", expectedPassword, pdfPath, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch {
        throw new Error("Independent PDF metadata or content validation failed.");
    }
    expect(info).toMatch(/^Encrypted:\s+yes\b/m);
    expect(info).toMatch(new RegExp(`^Pages:\\s+${expectedPageCount}\\s*$`, "m"));
    expect(text).toContain("PLATEN_M1_SYNTHETIC_ALPHA");
    expect(text).toContain("PLATEN_M1_SYNTHETIC_BETA");

    if (expectedRotation !== undefined) {
        const pageInfo = qpdfText([`--password=${expectedPassword}`, "--show-npages", pdfPath]);
        expect(Number(pageInfo.trim())).toBe(expectedPageCount);
        let details: string;
        try {
            details = execFileSync("pdfinfo", ["-upw", expectedPassword, "-f", "1", "-l", String(expectedPageCount), pdfPath], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            });
        } catch {
            throw new Error("Independent rotation metadata validation failed.");
        }
        for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 1) {
            expect(details).toMatch(new RegExp(`^Page\\s+${pageNumber} rot:\\s+${expectedRotation}\\s*$`, "m"));
        }
    }
}

async function downloadAndVerify(
    page: Page,
    expectedFilename: string,
    expectedPassword: string,
    expectedRotation?: number,
): Promise<void> {
    const downloadDirectory = mkdtempSync(path.join(os.tmpdir(), "platen-m1-s203-artifact-"));
    try {
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download File" }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe(expectedFilename);
        const artifactPath = path.join(downloadDirectory, download.suggestedFilename());
        await download.saveAs(artifactPath);
        verifyEncryptedPdf(artifactPath, expectedPassword, 2, expectedRotation);
    } finally {
        rmSync(downloadDirectory, { recursive: true, force: true });
    }
}

function multipartFields(body: Buffer | undefined): string[] {
    if (!body) return [];
    return [...body.toString("latin1").matchAll(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/gi)]
        .map((match) => match[1]);
}

function multipartFilePayload(body: Buffer | undefined, contentType: string | undefined, fieldName: string): Buffer | null {
    if (!body || !contentType) return null;
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary) return null;

    const raw = body.toString("latin1");
    for (const part of raw.split(`--${boundary}`)) {
        const separator = part.indexOf("\r\n\r\n");
        if (separator < 0) continue;
        const headers = part.slice(0, separator);
        if (!headers.includes(`name="${fieldName}"`) || !headers.includes("filename=")) continue;
        let contents = part.slice(separator + 4);
        if (contents.endsWith("\r\n")) contents = contents.slice(0, -2);
        return Buffer.from(contents, "latin1");
    }
    return null;
}

function verifyPlainRotateUpload(upload: Buffer | null): void {
    expect(upload?.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "platen-m1-s203-rotate-upload-"));
    const uploadPath = path.join(temporaryDirectory, "rotate-input.pdf");
    try {
        writeFileSync(uploadPath, upload!);
        execFileSync("qpdf", ["--check", uploadPath], { stdio: ["ignore", "ignore", "ignore"] });
        const info = execFileSync("pdfinfo", [uploadPath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        const text = execFileSync("pdftotext", [uploadPath, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        expect(info).toMatch(/^Encrypted:\s+no\b/m);
        expect(info).toMatch(/^Pages:\s+2\s*$/m);
        expect(text).toContain("PLATEN_M1_SYNTHETIC_ALPHA");
        expect(text).toContain("PLATEN_M1_SYNTHETIC_BETA");
    } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

function assertNoProductionOrFallbackRequests(evidence: NetworkEvidence): void {
    expect([...evidence.blockedOrigins].filter((origin) => /(^|\.)platenpdf\.com$/i.test(new URL(origin).hostname))).toEqual([]);
    expect(evidence.requests.filter((entry) => entry.path.includes(":8080"))).toEqual([]);
    for (const request of evidence.requests) {
        expect(request.request.url().startsWith(`${appOrigin}/`) || request.request.url().startsWith(`${backendOrigin}/`)).toBe(true);
    }
}

function logSummary(name: string, evidence: NetworkEvidence): void {
    console.info(`[M1-S2-03] ${JSON.stringify({
        scenario: name,
        backendRevision,
        requests: evidence.requests.map((entry, index) => ({
            order: index + 1,
            method: entry.method,
            path: entry.path,
            status: entry.status,
            contentType: entry.contentType,
            multipartFieldNames: multipartFields(entry.body),
        })),
        blockedOrigins: [...evidence.blockedOrigins].sort(),
        productionRequests: 0,
    })}`);
}

test.describe("REAL GO BACKEND — explicit Lock and protected Rotate publication", () => {
    test.beforeAll(async () => {
        await assertBackendReady();
    });

    test("Cloud Lock publishes only the actual backend's AES-128 result after verification", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await openTool(page, "lock-pdf", evidence);
        await choosePdf(page, "plain-two-pages.pdf", plainPdf);
        await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
        await page.getByRole("button", { name: "Cloud", exact: true }).click();
        await page.getByPlaceholder("Configure strong access code strings").fill(outputPassword);

        const delay = createDelayedResponse("/api/security/lock");
        evidence.delayed = delay;
        const lockAction = page.getByRole("button", { name: /Encrypt and Protect PDF/i });
        await lockAction.click();
        await delay.fetched;
        expect(delay.responseStatus).toBe(200);
        expect(await page.url()).toMatch(/\/lock-pdf\/workspace$/);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        await expect(page.getByText(/PDF password protection could not be confirmed/i)).toHaveCount(0);

        delay.release();
        await delay.finished;
        await expect(page).toHaveURL(/\/lock-pdf\/download$/);
        await expect(page.getByText("Task completed successfully!")).toBeVisible();

        const lockRequests = evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock");
        expect(lockRequests).toHaveLength(1);
        const lockRequest = lockRequests[0];
        expect(lockRequest.status).toBe(200);
        expect(lockRequest.contentType?.toLowerCase()).toContain("application/pdf");
        expect(multipartFields(lockRequest.body)).toEqual(["file", "password"]);
        expect(lockRequest.body?.toString("latin1")).toContain('filename="plain-two-pages.pdf"');
        expect(lockRequest.body?.indexOf(plainPdf) ?? -1).toBeGreaterThanOrEqual(0);
        expect(lockRequest.body?.toString("latin1")).toContain(`name="password"\r\n\r\n${outputPassword}`);
        expect(evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock")).toHaveLength(1);

        await downloadAndVerify(page, "plain-two-pages-locked.pdf", outputPassword);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("real Cloud Lock", evidence);
    });

    test("protected Rotate locally prepares, calls real Rotate then real re-lock before download", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await prepareProtectedRotate(page, evidence);

        const lockDelay = createDelayedResponse("/api/security/lock");
        evidence.delayed = lockDelay;
        await requestRotation(page);
        await lockDelay.fetched;
        expect(lockDelay.responseStatus).toBe(200);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);

        const rotationRequests = evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/structure/rotate");
        expect(rotationRequests).toHaveLength(1);
        expect(rotationRequests[0].status).toBe(200);
        expect(rotationRequests[0].body?.toString("latin1")).toContain('filename="protected-alpha.pdf"');
        expect(rotationRequests[0].body?.toString("latin1")).toContain('name="rotations"\r\n\r\n');
        expect(multipartFields(rotationRequests[0].body)).toEqual(["file", "rotations"]);
        expect(rotationRequests[0].body?.toString("latin1")).not.toContain(sourcePassword);
        verifyPlainRotateUpload(multipartFilePayload(rotationRequests[0].body, rotationRequests[0].requestContentType, "file"));
        expect(evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/unlock")).toHaveLength(0);

        lockDelay.release();
        await lockDelay.finished;
        await expect(page).toHaveURL(/\/rotate-pdf\/download$/);
        await expect(page.getByText("Task completed successfully!")).toBeVisible();

        const lockRequests = evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock");
        expect(lockRequests).toHaveLength(1);
        expect(lockRequests[0].status).toBe(200);
        expect(multipartFields(lockRequests[0].body)).toEqual(["file", "password"]);
        expect(lockRequests[0].body?.toString("latin1")).toContain(`name="password"\r\n\r\n${sourcePassword}`);
        expect(evidence.requests.findIndex((entry) => entry.path === "/api/security/lock"))
            .toBeGreaterThan(evidence.requests.findIndex((entry) => entry.path === "/api/structure/rotate"));

        await downloadAndVerify(page, "protected-alpha-rotated.pdf", sourcePassword, 90);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("real protected Rotate and restoration", evidence);
    });

    test("real Rotate success followed by a controlled re-lock error cannot publish plaintext", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await prepareProtectedRotate(page, evidence);
        evidence.failure = { path: "/api/security/lock", status: 503 };
        await requestRotation(page);

        await expect.poll(() => evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/structure/rotate").length).toBe(1);
        await expect.poll(() => evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock").length).toBe(1);
        await expect.poll(() => evidence.requests.find((entry) => entry.path === "/api/security/lock")?.status).toBe(503);
        await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
        await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        await expect(page.getByRole("alert")).toBeVisible();
        expect(evidence.requests.find((entry) => entry.path === "/api/structure/rotate")?.status).toBe(200);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("real Rotate plus controlled restoration 503", evidence);
    });

    test("rapid duplicate protected Rotate submissions publish one verified artifact", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await prepareProtectedRotate(page, evidence);

        const rotateDelay = createDelayedResponse("/api/structure/rotate");
        evidence.delayed = rotateDelay;
        await page.getByRole("button", { name: "Rotate all 90°" }).click();
        await page.getByRole("button", { name: "Apply Rotation Matrices" }).evaluate((button) => {
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await rotateDelay.fetched;
        expect(rotateDelay.responseStatus).toBe(200);
        expect(evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/structure/rotate")).toHaveLength(1);

        rotateDelay.release();
        await rotateDelay.finished;
        await expect(page).toHaveURL(/\/rotate-pdf\/download$/);
        await expect.poll(() => evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock").length).toBe(1);
        await downloadAndVerify(page, "protected-alpha-rotated.pdf", sourcePassword, 90);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("rapid duplicate protected Rotate submissions", evidence);
    });

    test("a stale real Rotate response after source removal cannot create re-lock or download state", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await prepareProtectedRotate(page, evidence);

        const rotateDelay = createDelayedResponse("/api/structure/rotate");
        evidence.delayed = rotateDelay;
        await requestRotation(page);
        await rotateDelay.fetched;
        expect(rotateDelay.responseStatus).toBe(200);
        await page.getByRole("button", { name: "Remove" }).click();
        await expect(page).toHaveURL(/\/rotate-pdf$/);

        rotateDelay.release();
        await rotateDelay.finished;
        await page.waitForTimeout(1_000);

        expect(evidence.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/security/lock")).toHaveLength(0);
        await expect(page).toHaveURL(/\/rotate-pdf$/);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("stale real Rotate discarded after input removal", evidence);
    });

    test("an explicit Cloud Lock HTTP 503 stays on the workspace without successful publication", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await openTool(page, "lock-pdf", evidence);
        await choosePdf(page, "plain-two-pages.pdf", plainPdf);
        await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
        await page.getByRole("button", { name: "Cloud", exact: true }).click();
        await page.getByPlaceholder("Configure strong access code strings").fill(outputPassword);
        evidence.failure = { path: "/api/security/lock", status: 503 };
        await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

        await expect.poll(() => evidence.requests.find((entry) => entry.path === "/api/security/lock")?.status).toBe(503);
        await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
        await expect(page.getByText(/could not be confirmed; no download was created/i)).toBeVisible();
        await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        assertNoProductionOrFallbackRequests(evidence);
        logSummary("controlled explicit Cloud Lock 503", evidence);
    });

    test("controlled HTTP 200 plaintext Lock response cannot publish a protected result", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await assertInvalidCloudLockDoesNotPublish(page, evidence, "controlled Cloud Lock 200 plaintext", {
            path: "/api/security/lock",
            status: 200,
            contentType: "application/pdf",
            body: plainPdf,
        });
    });

    test("controlled malformed Lock response cannot publish a protected result", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await assertInvalidCloudLockDoesNotPublish(page, evidence, "controlled Cloud Lock malformed PDF", {
            path: "/api/security/lock",
            status: 200,
            contentType: "application/pdf",
            body: Buffer.from("%PDF-1.7\nmalformed synthetic response"),
        });
    });

    test("controlled encrypted Lock response with the wrong password cannot publish", async ({ page }) => {
        const evidence = await installNetworkBoundary(page);
        await assertInvalidCloudLockDoesNotPublish(page, evidence, "controlled Cloud Lock wrong-password PDF", {
            path: "/api/security/lock",
            status: 200,
            contentType: "application/pdf",
            body: readFileSync(path.join(fixtureDirectory, "protected-lock-output-aes128.pdf")),
        });
    });
});
