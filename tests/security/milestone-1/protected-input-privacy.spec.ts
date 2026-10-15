import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureDir = process.env.PLATEN_M1_FIXTURE_DIR || path.join(os.tmpdir(), "platen-m1-security-fixtures");
const plainPdf = readFileSync(path.join(fixtureDir, "plain-two-pages.pdf"));
const protectedAlpha = readFileSync(path.join(fixtureDir, "protected-alpha.pdf"));
const protectedBeta = readFileSync(path.join(fixtureDir, "protected-beta.pdf"));
const protectedMergeAlpha = readFileSync(path.join(fixtureDir, "protected-merge-alpha-aes128.pdf"));
const protectedMergeBeta = readFileSync(path.join(fixtureDir, "protected-merge-beta-aes256.pdf"));
const protectedStudioProject = readFileSync(path.join(fixtureDir, "legacy-studio-protected.pns"));
const protectedStudioHistoryProject = readFileSync(path.join(fixtureDir, "legacy-studio-protected-history.pns"));
const protectedStudioFutureProject = readFileSync(path.join(fixtureDir, "legacy-studio-protected-future.pns"));
const plainStudioProject = readFileSync(path.join(fixtureDir, "legacy-studio-plain.pns"));
const alternatePlainStudioProject = readFileSync(path.join(fixtureDir, "legacy-studio-alternate-plain.pns"));
const protectedLockOutputAes128 = readFileSync(path.join(fixtureDir, "protected-lock-output-aes128.pdf"));
const protectedScanned = readFileSync(path.join(fixtureDir, "protected-scanned.pdf"));
const malformedPdf = readFileSync(path.join(fixtureDir, "malformed.pdf"));
const alphaPassword = "platen-m1-user-alpha";
const betaPassword = "platen-m1-user-beta";
const appOrigin = process.env.PLATEN_M1_PRIVACY_E2E === "1"
    ? process.env.PLATEN_M1_PRIVACY_APP_ORIGIN || "http://127.0.0.1:3000"
    : new URL(process.env.E2E_BASE_URL || "http://localhost:3000").origin;

type ApiRequest = { method: string; origin: string; path: string; body: Buffer };
let apiRequests: ApiRequest[] = [];
let externalRequests: string[] = [];
let unlockResponseGate: Promise<void> | null = null;
let authSessionResponseGate: Promise<void> | null = null;
let authSessionResponsesFulfilled = 0;
let mockHealthStatuses: number[] = [];
let previewSessionCount = 0;

function delayNextUnlockResponse(): () => void {
    let release = () => {};
    unlockResponseGate = new Promise<void>((resolve) => { release = resolve; });
    return () => release();
}

function delayAuthSessionResponses(): () => void {
    let release = () => {};
    authSessionResponseGate = new Promise<void>((resolve) => { release = resolve; });
    return () => {
        release();
        authSessionResponseGate = null;
    };
}

async function installLocalNetworkBoundary(context: BrowserContext): Promise<void> {
    apiRequests = [];
    externalRequests = [];
    unlockResponseGate = null;
    authSessionResponseGate = null;
    authSessionResponsesFulfilled = 0;
    mockHealthStatuses = [];
    previewSessionCount = 0;
    await context.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        const isApp = requestUrl.origin === appOrigin;
        if (isApp) {
            if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname.endsWith("/sessions/from-upload")) {
                const request = route.request();
                apiRequests.push({
                    method: request.method(),
                    origin: requestUrl.origin,
                    path: requestUrl.pathname,
                    body: request.postDataBuffer() || Buffer.alloc(0),
                });
            }
            await route.continue();
            return;
        }

        const isMockApi = requestUrl.hostname === "127.0.0.1" && requestUrl.port === "3999";
        if (!isMockApi) {
            externalRequests.push(route.request().url());
            await route.abort("blockedbyclient");
            return;
        }

        const request = route.request();
        const body = request.postDataBuffer() || Buffer.alloc(0);
        apiRequests.push({ method: request.method(), origin: requestUrl.origin, path: requestUrl.pathname, body });
        const corsHeaders = {
            "access-control-allow-origin": appOrigin,
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "access-control-allow-headers": "content-type, authorization, idempotency-key",
        };
        if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: corsHeaders });
            return;
        }
        if (request.method() === "GET" && requestUrl.pathname === "/api/health") {
            mockHealthStatuses.push(200);
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ status: "ok", available: true }),
            });
            return;
        }
        if (request.method() === "GET" && requestUrl.pathname.endsWith("/auth/session")) {
            const responseGate = authSessionResponseGate;
            if (responseGate) await responseGate;
            authSessionResponsesFulfilled += 1;
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({
                    type: "user",
                    user: { id: "synthetic-browser-test-user", email: "test@example.invalid" },
                    subscription: { tier: "free" },
                    billing_policy: null,
                }),
            });
            return;
        }
        if (request.method() === "POST" && requestUrl.pathname === "/api/conversion/preview/session") {
            previewSessionCount += 1;
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ session_id: `synthetic-studio-preview-${previewSessionCount}`, page_count: 2 }),
            });
            return;
        }
        if (request.method() === "GET" && /\/api\/conversion\/preview\/session\/[^/]+\/page\/\d+$/.test(requestUrl.pathname)) {
            await route.fulfill({
                status: 200,
                contentType: "image/png",
                headers: corsHeaders,
                body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64"),
            });
            return;
        }
        if (request.method() === "POST" && requestUrl.pathname === "/api/security/unlock") {
            const responseGate = unlockResponseGate;
            unlockResponseGate = null;
            if (responseGate) await responseGate;
            await route.fulfill({
                status: 200,
                contentType: "application/pdf",
                headers: corsHeaders,
                body: plainPdf,
            }).catch(() => {});
            return;
        }

        if (request.method() === "POST" && requestUrl.pathname === "/api/ocr/extract-text-async") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ taskId: "synthetic-cloud-ocr-task" }),
            });
            return;
        }

        if (request.method() === "GET" && requestUrl.pathname === "/api/v1/tasks/synthetic-cloud-ocr-task") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ id: "synthetic-cloud-ocr-task", status: "PROCESSING", progress: 5 }),
            });
            return;
        }

        if (request.method() === "DELETE" && requestUrl.pathname === "/api/v1/tasks/synthetic-cloud-ocr-task") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ id: "synthetic-cloud-ocr-task", status: "CANCELLED" }),
            });
            return;
        }

        if (request.method() === "POST" && requestUrl.pathname.endsWith("/sessions/from-upload")) {
            await route.fulfill({
                status: 422,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ message: "Local security test mock rejected session creation after capturing the request." }),
            });
            return;
        }

        if (request.method() === "GET" && requestUrl.pathname === "/api/v2/ocr/structured/capabilities") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({
                    service_ready: true,
                    languages: [{ code: "eng", name: "English" }],
                    routing_modes: [
                        { id: "AUTO", available: true },
                        { id: "FAST", available: true },
                        { id: "QUALITY", available: true },
                    ],
                }),
            });
            return;
        }

        if (request.method() === "POST" && requestUrl.pathname === "/api/v2/ocr/document-extraction-v2/jobs") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({
                    job_id: "623e4567-e89b-42d3-a456-426614174000",
                    status: "FAILED",
                    profile: "DOCUMENT_EXTRACTION_V2",
                    language: "eng",
                    routing_policy: "AUTO",
                    progress: { completed_pages: 0, total_pages: 0, percent: 0, page_statuses: {} },
                    warnings: [],
                    result_available: false,
                    error: { code: "STRUCTURED_ENGINE_UNAVAILABLE", message: "Synthetic test stop." },
                }),
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({ status: "ok", available: true, tools: [] }),
        });
    });
}

async function chooseFile(page: Page, fileName: string, bytes: Buffer): Promise<void> {
    await page.locator('input[type="file"]').first().setInputFiles({
        name: fileName,
        mimeType: "application/pdf",
        buffer: bytes,
    });
}

async function blockStudioSnapshotInspection(page: Page, snapshotName: string): Promise<void> {
    await page.addInitScript((targetName: string) => {
        const originalArrayBuffer = File.prototype.arrayBuffer;
        const testWindow = window as typeof window & {
            __studioInspectionStarted?: boolean;
            __releaseStudioInspection?: () => void;
        };

        Object.defineProperty(File.prototype, "arrayBuffer", {
            configurable: true,
            value: function patchedArrayBuffer(this: File): Promise<ArrayBuffer> {
                if (this.name === targetName && !testWindow.__studioInspectionStarted) {
                    testWindow.__studioInspectionStarted = true;
                    return new Promise<ArrayBuffer>((resolve, reject) => {
                        testWindow.__releaseStudioInspection = () => {
                            originalArrayBuffer.call(this).then(resolve, reject);
                        };
                    });
                }
                return originalArrayBuffer.call(this);
            },
        });
    }, snapshotName);
}

async function waitForBlockedStudioInspection(page: Page): Promise<void> {
    await expect.poll(() => page.evaluate(() =>
        Boolean((window as Window & { __studioInspectionStarted?: boolean }).__studioInspectionStarted)
    )).toBe(true);
}

async function releaseBlockedStudioInspection(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as Window & { __releaseStudioInspection?: () => void }).__releaseStudioInspection?.();
    });
}

function captureApiRequest(request: import("@playwright/test").Request): ApiRequest {
    const requestUrl = new URL(request.url());
    const captured = {
        method: request.method(),
        origin: requestUrl.origin,
        path: requestUrl.pathname,
        body: request.postDataBuffer() || Buffer.alloc(0),
    };
    apiRequests.push(captured);
    return captured;
}

async function mockEditorJobs(page: Page, failFirstExtraction = false): Promise<{ counts: () => { extracts: number; compiles: number } }> {
    let extracts = 0;
    let compiles = 0;
    const editorLayout = {
        schema_version: "ocr_v2_editor_layout.v1",
        pages: [{
            page_num: 1,
            width: 612,
            height: 792,
            kind: "text",
            elements: [{ id: "synthetic-text", text: "Hello", x: 50, y: 50, width: 80, height: 20, size: 12, font: "Helvetica" }],
        }],
    };

    await page.route("**/api/edit/extract", async (route) => {
        captureApiRequest(route.request());
        extracts += 1;
        if (failFirstExtraction && extracts === 1) {
            await route.fulfill({ status: 503, contentType: "text/plain", body: "Synthetic first extract failure." });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, job_id: "synthetic-editor-extract-job", status: "queued", source_tracker: "synthetic-source-tracker" }),
        });
    });

    await page.route("**/api/edit/compile", async (route) => {
        captureApiRequest(route.request());
        compiles += 1;
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true, job_id: "synthetic-editor-compile-job", status: "queued" }),
        });
    });

    await page.route("**/api/edit/jobs/**", async (route) => {
        captureApiRequest(route.request());
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/download")) {
            await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                id: url.pathname.split("/").pop(),
                job_type: url.pathname.includes("compile") ? "compile" : "extract",
                status: "succeeded",
                progress: 100,
                message: "Synthetic job completed.",
                result: editorLayout,
                error: null,
                cancel_requested: false,
            }),
        });
    });

    return { counts: () => ({ extracts, compiles }) };
}

async function runMixedCloudMerge(page: Page): Promise<ApiRequest> {
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-a.pdf", plainPdf);
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual(["plain-a.pdf"]);

    await page.getByLabel("Upload Additional PDFs").setInputFiles([
        { name: "protected-b.pdf", mimeType: "application/pdf", buffer: protectedAlpha },
        { name: "plain-c.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "plain-a.pdf", "protected-b.pdf", "plain-c.pdf",
    ]);

    const firstRow = page.getByText("#1 • plain-a.pdf", { exact: true }).locator("xpath=../..");
    await firstRow.getByRole("button", { name: "Remove" }).click();
    const plainCRow = page.getByText("#2 • plain-c.pdf", { exact: true }).locator("xpath=../..");
    await plainCRow.getByRole("button", { name: "Move file up" }).click();
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "plain-c.pdf", "protected-b.pdf",
    ]);

    const cloudButton = page.getByRole("button", { name: "Cloud", exact: true });
    await cloudButton.click();
    await expect(cloudButton).toHaveAttribute("aria-pressed", "true");
    const outputGroup = page.getByRole("group", { name: "Merged output protection" });
    await outputGroup.getByLabel("Create an unprotected merged PDF").check();
    await outputGroup.getByLabel(/I understand and confirm that the merged PDF will not be password-protected/).check();
    await page.getByLabel("Authorize Cloud Merge").check();
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge").length).toBe(1);
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    return apiRequests.find((request) => request.method === "POST" && request.path === "/api/structure/merge")!;
}

async function prepareProtectedCloudMerge(
    page: Page,
    policy: "protected" | "unprotected",
    outputPassword = alphaPassword,
): Promise<void> {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-beta.pdf", mimeType: "application/pdf", buffer: protectedBeta },
        { name: "plain-two-pages.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);

    const cloudButton = page.getByRole("button", { name: "Cloud", exact: true });
    await cloudButton.click();
    await expect(cloudButton).toHaveAttribute("aria-pressed", "true");
    const outputGroup = page.getByRole("group", { name: "Merged output protection" });
    if (policy === "protected") {
        await outputGroup.getByLabel("Protect merged output with a new password").check();
        await page.getByLabel("New output password").fill(outputPassword);
        await page.getByLabel("Confirm output password").fill(outputPassword);
    } else {
        await outputGroup.getByLabel("Create an unprotected merged PDF").check();
        await outputGroup.getByLabel(/I understand and confirm that the merged PDF will not be password-protected/).check();
    }
}

async function prepareProtectedDeviceMerge(page: Page): Promise<void> {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-beta.pdf", mimeType: "application/pdf", buffer: protectedBeta },
        { name: "plain-two-pages.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    const modeButton = page.getByRole("button", { name: "Device", exact: true });
    await expect(modeButton).toHaveAttribute("aria-pressed", "true");
    const outputGroup = page.getByRole("group", { name: "Merged output protection" });
    await outputGroup.getByLabel("Protect merged output with a new password").check();
    await page.getByLabel("New output password").fill(alphaPassword);
    await page.getByLabel("Confirm output password").fill(alphaPassword);
}

async function authorizeAndSubmitProtectedCloudMerge(page: Page): Promise<void> {
    await expect(page.getByRole("group", { name: "Cloud Merge authorization" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Cloud output protection authorization" })).toBeVisible();
    const mergeButton = page.getByRole("button", { name: "Merge 2 PDFs" });
    await expect(mergeButton).toBeDisabled();
    expect(apiRequests.filter((request) => request.method === "POST" &&
        ["/api/structure/merge", "/api/security/lock"].includes(request.path))).toHaveLength(0);
    await page.getByLabel("Authorize Cloud Merge").check();
    await page.getByLabel("Authorize Cloud output protection request").check();
    await expect(mergeButton).toBeEnabled();
    await mergeButton.click();
}

async function runMockedProtectedCloudMerge(
    page: Page,
    lockResponse: { status?: number; contentType?: string; body: Buffer | string },
): Promise<ApiRequest[]> {
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({
            status: lockResponse.status ?? 200,
            contentType: lockResponse.contentType ?? "application/pdf",
            body: lockResponse.body,
        });
    });

    await prepareProtectedCloudMerge(page, "protected", alphaPassword);
    await authorizeAndSubmitProtectedCloudMerge(page);
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" &&
        ["/api/structure/merge", "/api/security/lock"].includes(request.path)).length).toBe(2);
    return apiRequests.filter((request) => request.method === "POST" &&
        ["/api/structure/merge", "/api/security/lock"].includes(request.path));
}

async function runProtectedAnnotationAnalysis(page: Page, toolId: "highlight-pdf" | "underline-pdf" | "strikeout-pdf"): Promise<ApiRequest> {
    await page.goto(`/${toolId}`);
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(preparation.getByRole("button", { name: "Device", exact: true })).toHaveCount(0);
    await preparation.getByLabel("PDF password").fill(alphaPassword);
    await preparation.getByRole("button", { name: "Unlock on this device" }).click();

    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/analyze")).toHaveLength(0);
    const beforeAuthorization = apiRequests.length;
    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/analyze").length).toBeGreaterThan(0);
    const analysisRequests = apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/analyze");
    expect(analysisRequests.every((request) => apiRequests.indexOf(request) >= beforeAuthorization)).toBe(true);
    for (const analysisRequest of analysisRequests) {
        const payload = analysisRequest.body.toString("latin1");
        expect(payload).toContain('filename="protected-alpha.pdf"');
        expect(payload).toContain(`name="file_password"\r\n\r\n${alphaPassword}`);
        expect(analysisRequest.body.indexOf(protectedAlpha)).toBe(-1);
    }
    expect(unlockRequests()).toHaveLength(0);
    return analysisRequests[0];
}

async function waitForInteractiveApp(page: Page): Promise<void> {
    const themeToggle = page.getByRole("button", { name: /Switch to (light|dark) theme/ });
    const initialLabel = await themeToggle.getAttribute("aria-label");
    await themeToggle.click();
    await expect.poll(() => themeToggle.getAttribute("aria-label")).not.toBe(initialLabel);
}

function unlockRequests(): ApiRequest[] {
    return apiRequests.filter((request) => request.path === "/api/security/unlock");
}

function processingPosts(): ApiRequest[] {
    return apiRequests.filter((request) =>
        request.method === "POST" &&
        (request.path === "/api/security/unlock" || request.path.startsWith("/api/") || request.path.endsWith("/sessions/from-upload"))
    );
}

function studioProcessingPosts(): ApiRequest[] {
    return apiRequests.filter((request) => request.method === "POST" && request.path.startsWith("/api/"));
}

function expectNoProductionRequests(): void {
    expect(externalRequests.filter((url) => /platenpdf\.com/i.test(url))).toEqual([]);
    expect(externalRequests.filter((url) => {
        try { return new URL(url).port === "8080"; } catch { return false; }
    })).toEqual([]);
}

function expectMultipartUnlock(request: ApiRequest, fileName: string, fileBytes: Buffer, password: string): void {
    const payloadText = request.body.toString("latin1");
    expect(payloadText).toContain(`filename="${fileName}"`);
    expect(payloadText).toContain(`name="password"\r\n\r\n${password}`);
    expect(request.body.indexOf(fileBytes)).toBeGreaterThanOrEqual(0);
}

function independentlyVerifyEncryptedPdf(filePath: string, password: string, expectedPages = 2): void {
    execFileSync("qpdf", [`--password=${password}`, "--check", filePath], { stdio: "pipe" });
    expect(() => execFileSync("qpdf", ["--check", filePath], { stdio: "pipe" })).toThrow();
    expect(() => execFileSync("qpdf", [`--password=${betaPassword}`, "--check", filePath], { stdio: "pipe" })).toThrow();
    const encryption = execFileSync("qpdf", [`--password=${password}`, "--show-encryption", filePath], { encoding: "utf8" });
    expect(encryption).toMatch(/AESv2|128-bit/);
    const details = execFileSync("pdfinfo", ["-upw", password, filePath], { encoding: "utf8" });
    expect(details).toMatch(/^Encrypted:\s+yes\b/m);
    expect(details).toMatch(new RegExp(`^Pages:\\s+${expectedPages}\\b`, "m"));
}

async function independentlyVerifyDownload(
    download: import("@playwright/test").Download,
    password: string,
    expectedPages = 2,
): Promise<void> {
    const directory = mkdtempSync(path.join(os.tmpdir(), "platen-lock-output-"));
    try {
        const outputPath = path.join(directory, download.suggestedFilename());
        await download.saveAs(outputPath);
        independentlyVerifyEncryptedPdf(outputPath, password, expectedPages);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function containsFilePayload(request: ApiRequest, fileName: string, fileBytes: Buffer): boolean {
    return request.body.toString("latin1").includes(`filename="${fileName}"`) ||
        request.body.indexOf(fileBytes) >= 0;
}

test.beforeEach(async ({ context }) => {
    await installLocalNetworkBoundary(context);
});

test("isolated privacy-suite preflight uses only the configured mock API for health checks", async ({ page }) => {
    test.skip(process.env.PLATEN_M1_PRIVACY_E2E !== "1", "Only applies to the isolated local-mock invocation.");
    await page.goto("/");
    await expect.poll(() => apiRequests.some((request) =>
        request.method === "GET" &&
        request.origin === "http://127.0.0.1:3999" &&
        request.path === "/api/health"
    )).toBe(true);
    expect(mockHealthStatuses).toEqual([200]);
    expect(externalRequests.filter((url) => /platenpdf\.com/i.test(url))).toEqual([]);
    expect(externalRequests.filter((url) => {
        try { return new URL(url).port === "8080"; } catch { return false; }
    })).toEqual([]);
    const blockedExternalOrigins = [...new Set(externalRequests.map((url) => {
        try { return new URL(url).origin; } catch { return "invalid-url"; }
    }))].sort();
    console.log(`[privacy preflight] health mock=127.0.0.1:3999 status=200; blocked external origins=${JSON.stringify(blockedExternalOrigins)}; port-8080 requests=0; production Platen requests=0`);
});

test("explicit Cloud Lock rejects plaintext HTTP 200 before publishing a result", async ({ page }) => {
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);

    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await expect(page.getByText(/could not be confirmed; no download was created/i)).toBeVisible();
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(1);
    expectNoProductionRequests();
});

test("explicit Cloud Lock publishes only a valid protected PDF and does not recurse to a second Lock request", async ({ page }) => {
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedLockOutputAes128 });
    });

    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(page).toHaveURL(/\/lock-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    const lockRequests = apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock");
    expect(lockRequests).toHaveLength(1);
    expect(lockRequests[0].body.toString("latin1")).toContain(`name="password"\r\n\r\n${alphaPassword}`);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("plain-two-pages-locked.pdf");
    await independentlyVerifyDownload(download, alphaPassword);
    expectNoProductionRequests();
});

test("Device Lock verifies the real local pdfcpu result before publication", async ({ page }) => {
    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await page.getByRole("button", { name: "Device", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(page).toHaveURL(/\/lock-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("plain-two-pages-locked.pdf");
    await independentlyVerifyDownload(download, alphaPassword);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Auto Lock accepts its verified local result without a Cloud request", async ({ page }) => {
    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    const autoButton = page.getByRole("button", { name: "Auto", exact: true });
    await expect(autoButton).toHaveAttribute("aria-pressed", "true");
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(page).toHaveURL(/\/lock-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    await independentlyVerifyDownload(download, alphaPassword);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Auto Lock verifies a Cloud-selected result when client execution is disabled", async ({ page }) => {
    test.skip(
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_LOCK !== "false",
        "Run this case with NEXT_PUBLIC_HYBRID_ENABLE_LOCK=false to exercise Auto's Cloud-selected path.",
    );
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedLockOutputAes128 });
    });

    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    const autoButton = page.getByRole("button", { name: "Auto", exact: true });
    await expect(autoButton).toHaveAttribute("aria-pressed", "true");
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(page).toHaveURL(/\/lock-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    const lockRequests = apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock");
    expect(lockRequests).toHaveLength(1);
    expect(lockRequests[0].body.toString("latin1")).toContain(`name="password"\r\n\r\n${alphaPassword}`);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    await independentlyVerifyDownload(download, alphaPassword);
    expect(processingPosts()).toHaveLength(1);
    expectNoProductionRequests();
});

test("Cloud Lock rejects a protected result that uses the wrong password", async ({ page }) => {
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedBeta });
    });

    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    await page.getByRole("button", { name: /Encrypt and Protect PDF/i }).click();

    await expect(
        page.getByRole("alert").filter({ hasText: /could not be confirmed; no download was created/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(1);
    expectNoProductionRequests();
});

test("duplicate Cloud Lock clicks submit once and a stale response after removal cannot publish", async ({ page }) => {
    let markRequestSeen!: () => void;
    const requestSeen = new Promise<void>((resolve) => { markRequestSeen = resolve; });
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
    let markRouteComplete!: () => void;
    const routeComplete = new Promise<void>((resolve) => { markRouteComplete = resolve; });
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        markRequestSeen();
        await responseGate;
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedBeta }).catch(() => {});
        markRouteComplete();
    });

    await page.goto("/lock-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/lock-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByPlaceholder("Configure strong access code strings").fill(alphaPassword);
    const lockButton = page.getByRole("button", { name: /Encrypt and Protect PDF/i });
    await lockButton.evaluate((element) => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await requestSeen;
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock").length).toBe(1);
    expect(apiRequests.find((request) => request.path === "/api/security/lock")!.body.toString("latin1"))
        .toContain(`name="password"\r\n\r\n${alphaPassword}`);

    const requestSettled = page.waitForEvent("requestfailed", (request) =>
        new URL(request.url()).pathname === "/api/security/lock",
    );
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page).toHaveURL(/\/lock-pdf$/);
    releaseResponse();
    await Promise.all([routeComplete, requestSettled]);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page).toHaveURL(/\/lock-pdf$/);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(1);
    expectNoProductionRequests();
});

test("a plaintext HTTP 200 re-lock response cannot publish an immediate Cloud result", async ({ page }) => {
    await page.route("**/api/structure/rotate", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: plainPdf });
    });
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);

    await page.getByRole("button", { name: "Rotate All 90°" }).click();
    await page.getByRole("button", { name: "Apply Rotation Matrices" }).click();
    await expect.poll(() => apiRequests.some((request) => request.method === "POST" && request.path === "/api/security/lock")).toBe(true);
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    await expect(page.getByText("Page rotation adjustments successful!")).toHaveCount(0);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expect(apiRequests.findIndex((request) => request.path === "/api/security/lock"))
        .toBeGreaterThan(apiRequests.findIndex((request) => request.path === "/api/structure/rotate"));
    expectNoProductionRequests();
});

test("a backend-compatible AES-128 restoration response reaches the download page only after PDF.js verification", async ({ page }) => {
    await page.route("**/api/structure/rotate", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: plainPdf });
    });
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedLockOutputAes128 });
    });

    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);

    await page.getByRole("button", { name: "Rotate All 90°" }).click();
    await page.getByRole("button", { name: "Apply Rotation Matrices" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    const lockRequest = apiRequests.find((request) => request.path === "/api/security/lock");
    expect(lockRequest).toBeDefined();
    expect(lockRequest!.body.toString("latin1")).toContain(`name="password"\r\n\r\n${alphaPassword}`);
    expect(lockRequest!.body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);
    expect(apiRequests.findIndex((request) => request.path === "/api/security/lock"))
        .toBeGreaterThan(apiRequests.findIndex((request) => request.path === "/api/structure/rotate"));
    expectNoProductionRequests();
});

test("Device protected input unlocks locally and carries Device mode into the workspace", async ({ page, context }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    const deviceChoice = page.getByRole("button", { name: "Device", exact: true });
    await expect(deviceChoice).toHaveAttribute("aria-pressed", "true");
    await expect(deviceChoice).toBeEnabled();
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
    await context.unrouteAll();
});

test("Auto protected input performs local preparation without authorizing an early Cloud request", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("replacing a file during protection inspection discards the stale result", async ({ page }) => {
    await page.addInitScript(() => {
        const originalArrayBuffer = File.prototype.arrayBuffer;
        let releaseRead: () => void = () => {};
        const blockedRead = new Promise<void>((resolve) => { releaseRead = resolve; });
        const testWindow = window as Window & {
            protectedAlphaInspectionStarted?: boolean;
            releaseProtectedAlphaInspection?: () => void;
        };
        testWindow.protectedAlphaInspectionStarted = false;
        testWindow.releaseProtectedAlphaInspection = () => releaseRead();
        File.prototype.arrayBuffer = function (this: File) {
            if (this.name === "protected-alpha.pdf" && !testWindow.protectedAlphaInspectionStarted) {
                testWindow.protectedAlphaInspectionStarted = true;
                return blockedRead.then(() => originalArrayBuffer.call(this));
            }
            return originalArrayBuffer.call(this);
        };
    });
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    await page.waitForFunction(() =>
        (window as Window & { protectedAlphaInspectionStarted?: boolean }).protectedAlphaInspectionStarted === true
    );
    await chooseFile(page, "protected-beta.pdf", protectedBeta);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("protected-beta.pdf");
    await page.evaluate(() => (window as Window & { releaseProtectedAlphaInspection?: () => void }).releaseProtectedAlphaInspection?.());
    await expect(dialog).toContainText("protected-beta.pdf");
    expect(page.url()).toMatch(/\/rotate-pdf$/);
    expect(processingPosts()).toHaveLength(0);
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    expect(processingPosts()).toHaveLength(0);
});

test("Cloud unlock sends bytes and password only after the explicit authorization click and retains provenance", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    expect(unlockRequests()).toHaveLength(0);
    await expect(dialog.getByText(/sends this encrypted PDF and its password to Platen Cloud now/)).toBeVisible();
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
    });
    await expect.poll(() => unlockRequests().length).toBe(1);
    expectMultipartUnlock(unlockRequests()[0], "protected-alpha.pdf", protectedAlpha, alphaPassword);
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);

    const deviceChoice = page.getByRole("button", { name: "Device", exact: true });
    await expect(deviceChoice).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /Cloud request was started/ })).toBeVisible();
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(deviceChoice).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /changing the mode cannot recall/ })).toBeVisible();
});

test("Cloud-only PDF-to-Word requires a separate Cloud processing consent after local protected-input preparation", async ({ page }) => {
    await page.goto("/pdf-to-word");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Device", exact: true })).toHaveCount(0);
    await expect(dialog).toContainText(/Cloud processing is required/i);
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: /Unlock locally/ }).click();

    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();

    await page.getByRole("button", { name: "Convert PDF to DOCX" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/conversion/pdf-to-word").length).toBe(1);
    const processingRequest = apiRequests.find((request) => request.path === "/api/conversion/pdf-to-word");
    expect(processingRequest).toBeDefined();
    expect(processingRequest!.body.toString("latin1")).toContain(`name="file_password"\r\n\r\n${alphaPassword}`);
    expect(processingRequest!.body.indexOf(protectedAlpha)).toBe(-1);
    expect(unlockRequests()).toHaveLength(0);
    expectNoProductionRequests();
});

test("plain PDF-to-Word keeps its existing Cloud workflow without a protected-input consent gate", async ({ page }) => {
    await page.goto("/pdf-to-word");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/pdf-to-word\/workspace$/);
    await expect(page.getByRole("dialog", { name: "Cloud processing authorization" })).toHaveCount(0);

    await page.getByRole("button", { name: "Convert PDF to DOCX" }).click();
    await expect.poll(() => apiRequests.some((request) => request.method === "POST" && request.path === "/api/conversion/pdf-to-word")).toBe(true);
    expectNoProductionRequests();
});

test("plain PDF Editor extraction retry and compilation remain usable after Cloud submission starts", async ({ page }) => {
    const editor = await mockEditorJobs(page, true);
    await page.goto("/edit-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/edit-pdf\/workspace$/);
    await expect(page.getByText("Failed to extract the editor layout.", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Cloud processing authorization" })).toHaveCount(0);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByLabel("Edit text Hello")).toBeVisible();
    await page.getByLabel("Edit text Hello").fill("Hello changed");
    await page.getByRole("button", { name: "Export edited PDF" }).click();
    await expect(page).toHaveURL(/\/edit-pdf\/download$/);

    expect(editor.counts()).toEqual({ extracts: 2, compiles: 1 });
    expect(apiRequests.filter((request) => request.path === "/api/edit/extract")).toHaveLength(2);
    expect(apiRequests.filter((request) => request.path === "/api/edit/compile")).toHaveLength(1);
    expect(unlockRequests()).toHaveLength(0);
    await expect(page.getByRole("dialog", { name: "Cloud processing authorization" })).toHaveCount(0);
    expectNoProductionRequests();
});

test("plain PDF-to-Word can retry a failed first Cloud request without becoming a protected-input workflow", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/conversion/pdf-to-word", async (route) => {
        captureApiRequest(route.request());
        attempts += 1;
        if (attempts === 1) {
            await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Synthetic temporary failure." }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: Buffer.from("synthetic-docx-result") });
    });

    await page.goto("/pdf-to-word");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/pdf-to-word\/workspace$/);
    const convert = page.getByRole("button", { name: "Convert PDF to DOCX" });
    await convert.click();
    await expect.poll(() => attempts).toBe(1);
    await expect(convert).toBeEnabled();
    await convert.click();
    await expect.poll(() => attempts).toBe(2);
    await expect(page).toHaveURL(/\/pdf-to-word\/download$/);

    expect(apiRequests.filter((request) => request.path === "/api/conversion/pdf-to-word")).toHaveLength(2);
    await expect(page.getByRole("dialog", { name: "Cloud processing authorization" })).toHaveCount(0);
    expectNoProductionRequests();
});

test("a queued structured route sends no protected input before its route-scoped Cloud authorization", async ({ page }) => {
    await page.goto("/document-extraction-v2");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog.getByRole("button", { name: "Device", exact: true })).toHaveCount(0);
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: /Unlock locally/ }).click();

    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    const beforeAuthorization = apiRequests.length;
    expect(processingPosts()).toHaveLength(0);
    expect(apiRequests.slice(beforeAuthorization).some((request) => containsFilePayload(request, "protected-alpha.pdf", protectedAlpha))).toBe(false);

    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();
    await expect(page.getByRole("heading", { name: "Extract Data from PDF" })).toBeVisible();
    await expect.poll(() => apiRequests.some((request) => request.path === "/api/v2/ocr/structured/capabilities")).toBe(true);
    expect(apiRequests.some((request) => request.method === "POST" && request.path === "/api/v2/ocr/document-extraction-v2/jobs")).toBe(false);

    const submitButton = page.getByRole("button", { name: "Extract data", exact: true });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect.poll(() => apiRequests.some((request) => request.method === "POST" && request.path === "/api/v2/ocr/document-extraction-v2/jobs")).toBe(true);
    const jobRequest = apiRequests.find((request) => request.method === "POST" && request.path === "/api/v2/ocr/document-extraction-v2/jobs")!;
    expect(jobRequest.body.toString("latin1")).toContain('filename="protected-alpha.pdf"');
    expect(jobRequest.body.indexOf(protectedAlpha)).toBe(-1);
    expect(jobRequest.body.toString("latin1")).not.toContain(alphaPassword);
    expectNoProductionRequests();
});

test("Cloud-capable annotation routes do not offer Device for protected input and require route consent", async ({ page }) => {
    const analysisRequest = await runProtectedAnnotationAnalysis(page, "highlight-pdf");
    await expect(page.getByRole("heading", { name: "Highlighter Configuration" })).toBeVisible();
    expect(apiRequests.some((request) => request.method === "POST" && request.path === "/api/markup/highlight")).toBe(false);
    expect(analysisRequest.path).toBe("/api/structure/analyze");
    expectNoProductionRequests();
});

test("Underline analysis sends protected input only after route authorization", async ({ page }) => {
    const analysisRequest = await runProtectedAnnotationAnalysis(page, "underline-pdf");
    expect(analysisRequest.path).toBe("/api/structure/analyze");
    expect(apiRequests.some((request) => request.method === "POST" && request.path === "/api/markup/underline")).toBe(false);
    expectNoProductionRequests();
});

test("Strikeout analysis sends protected input only after route authorization", async ({ page }) => {
    const analysisRequest = await runProtectedAnnotationAnalysis(page, "strikeout-pdf");
    expect(analysisRequest.path).toBe("/api/structure/analyze");
    expect(apiRequests.some((request) => request.method === "POST" && request.path === "/api/markup/strikeout")).toBe(false);
    expectNoProductionRequests();
});

test("the Cloud-offline alternate action cannot switch a Cloud-prepared file to Device", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText("Cloud processing is currently unavailable.")).toBeVisible();

    const deviceChoice = page.getByRole("button", { name: "Device", exact: true });
    await expect(deviceChoice).toBeDisabled();
    const alternateDevice = page.getByRole("button", { name: "Switch to Device" });
    await expect(alternateDevice).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /File delivery may have occurred/i })).toBeVisible();
    expect(unlockRequests()).toHaveLength(1);
});

test("eligible plain PDF inputs retain Device, Auto, and Cloud mode selection", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);

    const device = page.getByRole("button", { name: "Device", exact: true });
    const auto = page.getByRole("button", { name: "Auto", exact: true });
    const cloud = page.getByRole("button", { name: "Cloud", exact: true });
    await expect(device).toBeEnabled();
    await expect(auto).toBeEnabled();
    await expect(cloud).toBeEnabled();

    await device.click();
    await expect(device).toHaveAttribute("aria-pressed", "true");
    await auto.click();
    await expect(auto).toHaveAttribute("aria-pressed", "true");
    await cloud.click();
    await expect(cloud).toHaveAttribute("aria-pressed", "true");
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("PDF-to-Text requires separate Cloud processing authorization and records the OCR transmission", async ({ page }) => {
    await page.goto("/pdf-to-text");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await preparation.getByRole("button", { name: "Cloud", exact: true }).click();
    await preparation.getByLabel("PDF password").fill(alphaPassword);
    expect(unlockRequests()).toHaveLength(0);
    await preparation.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(1);
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace$/);

    await page.getByRole("button", { name: "Extract Text via Cloud OCR" }).click();
    const consent = page.getByRole("dialog", { name: "Authorize Cloud text extraction" });
    await expect(consent).toBeVisible();
    expect(unlockRequests()).toHaveLength(1);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async")).toHaveLength(0);

    await consent.getByRole("button", { name: "Authorize and extract text" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async").length).toBe(1);
    const request = apiRequests.find((item) => item.method === "POST" && item.path === "/api/ocr/extract-text-async")!;
    const payload = request.body.toString("latin1");
    expect(payload).toContain('filename="protected-alpha.pdf"');
    expect(payload).toContain(`name="file_password"\r\n\r\n${alphaPassword}`);
    await expect(page.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started for this input\. File delivery may have occurred/ })).toBeVisible();
    expectNoProductionRequests();
});

test("Auto OCR fallback records the Cloud request after local scanned-page detection", async ({ page }) => {
    await page.goto("/pdf-to-text");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-scanned.pdf", protectedScanned);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace$/);

    await page.getByRole("button", { name: "Extract Text", exact: true }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async").length).toBe(1);
    const request = apiRequests.find((item) => item.method === "POST" && item.path === "/api/ocr/extract-text-async")!;
    const payload = request.body.toString("latin1");
    expect(payload).toContain('filename="protected-scanned.pdf"');
    expect(payload).toContain(`name="file_password"\r\n\r\n${alphaPassword}`);
    expect(request.body.indexOf(protectedScanned)).toBe(-1);
    expect(unlockRequests()).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started/ })).toBeVisible();
    expectNoProductionRequests();
});

test("Auto OCR fallback retains transmission risk after its Cloud task is cancelled", async ({ page }) => {
    await page.goto("/pdf-to-text");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-scanned.pdf", protectedScanned);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Auto", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace$/);

    await page.getByRole("button", { name: "Extract Text", exact: true }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async").length).toBe(1);
    await page.getByRole("button", { name: "Cancel Task" }).click();
    await expect(page.getByText("Task was cancelled.")).toBeVisible();

    await expect(page.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started/ })).toBeVisible();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async")).toHaveLength(1);
    expectNoProductionRequests();
});

test("Auto OCR retries retain transmission risk when the initial Cloud task requests fail", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/ocr/extract-text-async", async (route) => {
        captureApiRequest(route.request());
        attempts += 1;
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            headers: { "access-control-allow-origin": appOrigin, "access-control-allow-credentials": "true" },
            body: JSON.stringify({ message: "Synthetic temporary failure." }),
        });
    });

    await page.goto("/pdf-to-text");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-scanned.pdf", protectedScanned);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Auto", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace$/);

    await page.getByRole("button", { name: "Extract Text", exact: true }).click();
    await expect.poll(() => attempts).toBe(5);
    await expect(page.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started/ })).toBeVisible();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async")).toHaveLength(5);
    expectNoProductionRequests();
});

test("explicit Device text extraction of a protected scanned PDF stays local", async ({ page }) => {
    await page.goto("/pdf-to-text");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-scanned.pdf", protectedScanned);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace$/);
    const extract = page.getByRole("button", { name: "Extract Text", exact: true });
    await extract.click();
    await expect(extract).toBeEnabled();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/ocr/extract-text-async")).toHaveLength(0);
    expect(unlockRequests()).toHaveLength(0);
    expectNoProductionRequests();
});

test("mixed Merge input preparation preserves original order around a protected file", async ({ page }) => {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "plain-a.pdf", mimeType: "application/pdf", buffer: plainPdf },
        { name: "protected-b.pdf", mimeType: "application/pdf", buffer: protectedAlpha },
        { name: "plain-c.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "plain-a.pdf", "protected-b.pdf", "plain-c.pdf",
    ]);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("protected Merge requires an explicit output-protection choice before submission", async ({ page }) => {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-alpha.pdf", mimeType: "application/pdf", buffer: protectedAlpha },
        { name: "plain-two-pages.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);

    await expect(page.getByRole("group", { name: "Merged output protection" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Merge 2 PDFs" })).toBeDisabled();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge")).toHaveLength(0);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(0);
    expectNoProductionRequests();
});

test("all-plain Merge keeps the existing output behavior without a password prompt", async ({ page }) => {
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-first.pdf", plainPdf);
    await page.getByLabel("Upload Additional PDFs").setInputFiles({
        name: "plain-second.pdf", mimeType: "application/pdf", buffer: plainPdf,
    });
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "plain-first.pdf", "plain-second.pdf",
    ]);
    await expect(page.getByRole("group", { name: "Merged output protection" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    const mergeRequests = apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge");
    expect(mergeRequests).toHaveLength(1);
    expect(mergeRequests[0].body.toString("latin1")).not.toMatch(/name="(?:password(?:_\d+)?|file_password)"/i);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(0);
    expectNoProductionRequests();
});

test("M1-S2-04R old plaintext download cannot survive a failed protected Merge through Forward", async ({ page }) => {
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Synthetic Lock failure." }) });
    });
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "plain-first.pdf", mimeType: "application/pdf", buffer: plainPdf },
        { name: "plain-second.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    const firstDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download File", exact: true }).click();
    expect(readFileSync((await (await firstDownload).path())!)).toEqual(plainPdf);

    // Passive history navigation must retain the legitimate completed artifact.
    await page.goBack();
    await expect(page.getByTestId("merge-queue-file")).toHaveCount(2);
    await page.goForward();
    await expect(page.getByRole("button", { name: "Download File", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("merge-queue-file")).toHaveCount(2);
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await page.getByLabel("Upload Additional PDFs").setInputFiles({
        name: "protected-third.pdf", mimeType: "application/pdf", buffer: protectedBeta,
    });
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page.getByTestId("merge-queue-file")).toHaveCount(3);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByLabel("Protect merged output with a new password").check();
    await page.getByLabel("New output password").fill(alphaPassword);
    await page.getByLabel("Confirm output password").fill(alphaPassword);
    await page.getByLabel("Authorize Cloud Merge").check();
    await page.getByLabel("Authorize Cloud output protection request").check();
    await page.getByRole("button", { name: "Merge 3 PDFs" }).click();
    await expect(page.getByText("Merge or output-password verification failed. No download was published.")).toBeVisible();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge")).toHaveLength(2);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(1);

    await page.goForward();
    if (await page.getByRole("button", { name: "Download File", exact: true }).isVisible()) {
        const staleDownload = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download File", exact: true }).click();
        expect(readFileSync((await (await staleDownload).path())!)).toEqual(plainPdf);
        console.log("[M1-S2-04R reproduction] Forward exposed the previous plaintext Blob after the protected attempt failed.");
    }
    await expect(page).toHaveURL(/\/merge-pdf(?:\/workspace)?$/);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download File", exact: true })).toHaveCount(0);
    expectNoProductionRequests();
});

async function publishPlainMergeForLifecycle(page: Page): Promise<void> {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "plain-first.pdf", mimeType: "application/pdf", buffer: plainPdf },
        { name: "plain-second.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download File", exact: true }).click();
    expect(readFileSync((await (await download).path())!)).toEqual(plainPdf);
    await page.goBack();
    await expect(page.getByTestId("merge-queue-file")).toHaveCount(2);
}

for (const change of ["remove", "reorder", "retry"] as const) {
    test(`M1-S2-04R ${change} supersedes a completed plain Merge download`, async ({ page }) => {
        let mergeCount = 0;
        await page.route("**/api/structure/merge", async (route) => {
            captureApiRequest(route.request());
            mergeCount += 1;
            await route.fulfill(mergeCount === 1
                ? { status: 200, contentType: "application/pdf", body: plainPdf }
                : { status: 503, contentType: "application/json", body: "{}" });
        });
        await publishPlainMergeForLifecycle(page);
        if (change === "retry") {
            await expect(page.getByRole("button", { name: "Cloud", exact: true })).toHaveAttribute("aria-pressed", "true");
            await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
            await expect.poll(() => mergeCount).toBe(2);
            await expect(page.getByRole("button", { name: "Merge 2 PDFs" })).toBeEnabled();
        } else {
            const firstRow = page.getByText("#1 • plain-first.pdf", { exact: true }).locator("xpath=../..");
            await firstRow.getByRole("button", { name: change === "remove" ? "Remove" : "Move file down" }).click();
            await expect.poll(() => page.getByTestId("merge-queue-file").allTextContents()).toEqual(
                change === "remove" ? ["plain-second.pdf"] : ["plain-second.pdf", "plain-first.pdf"],
            );
            expect(mergeCount).toBe(1);
        }
        await page.goForward();
        await expect(page).toHaveURL(/\/merge-pdf(?:\/workspace)?$/);
        await expect(page.getByRole("button", { name: "Download File", exact: true })).toHaveCount(0);
        await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
        expectNoProductionRequests();
    });
}

for (const response of [
    { name: "HTTP 503", status: 503, body: Buffer.from("{}") },
    { name: "plaintext", status: 200, body: plainPdf },
    { name: "malformed", status: 200, body: malformedPdf },
    // The old artifact opens with alpha, while the second attempt requests beta.
    { name: "wrong password", status: 200, body: protectedLockOutputAes128 },
]) {
    test(`M1-S2-04R a previous protected download cannot satisfy a new password after ${response.name}`, async ({ page }) => {
        await runMockedProtectedCloudMerge(page, { body: protectedLockOutputAes128 });
        await expect(page).toHaveURL(/\/merge-pdf\/download$/);
        const first = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download File", exact: true }).click();
        expect(readFileSync((await (await first).path())!)).toEqual(protectedLockOutputAes128);
        await page.goBack();
        await expect(page.getByTestId("merge-queue-file")).toHaveCount(2);
        await page.getByRole("button", { name: "Cloud", exact: true }).click();
        await page.getByLabel("Protect merged output with a new password").check();
        await page.getByLabel("New output password").fill(betaPassword);
        await page.getByLabel("Confirm output password").fill(betaPassword);
        await page.getByLabel("Authorize Cloud Merge").check();
        await page.getByLabel("Authorize Cloud output protection request").check();
        await page.route("**/api/security/lock", async (route) => {
            const request = captureApiRequest(route.request());
            expect(request.body.toString("latin1")).toContain(`name="password"\r\n\r\n${betaPassword}`);
            await route.fulfill({ status: response.status, contentType: "application/pdf", body: response.body });
        });
        await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
        await expect(page.getByText("Merge or output-password verification failed. No download was published.")).toBeVisible();
        await page.goForward();
        await expect(page).toHaveURL(/\/merge-pdf(?:\/workspace)?$/);
        await expect(page.getByRole("button", { name: "Download File", exact: true })).toHaveCount(0);
        expectNoProductionRequests();
    });
}

test("M1-S2-04R a successful second Merge publishes its own protected Blob filename and transfer history", async ({ page }) => {
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });
    await publishPlainMergeForLifecycle(page);
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await page.getByLabel("Upload Additional PDFs").setInputFiles({ name: "protected-new.pdf", mimeType: "application/pdf", buffer: protectedBeta });
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await preparation.getByLabel("PDF password").fill(betaPassword);
    await preparation.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page.getByTestId("merge-queue-file")).toHaveCount(3);
    await page.getByText("#1 • plain-first.pdf", { exact: true }).locator("xpath=../..").getByRole("button", { name: "Remove" }).click();
    await page.getByText("#2 • protected-new.pdf", { exact: true }).locator("xpath=../..").getByRole("button", { name: "Move file up" }).click();
    await expect.poll(() => page.getByTestId("merge-queue-file").allTextContents()).toEqual(["protected-new.pdf", "plain-second.pdf"]);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByLabel("Protect merged output with a new password").check();
    await page.getByLabel("New output password").fill(alphaPassword);
    await page.getByLabel("Confirm output password").fill(alphaPassword);
    await page.getByLabel("Authorize Cloud Merge").check();
    await page.getByLabel("Authorize Cloud output protection request").check();
    await page.route("**/api/security/lock", async (route) => {
        captureApiRequest(route.request());
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedLockOutputAes128 });
    });
    const merge = page.getByRole("button", { name: "Merge 2 PDFs" });
    await merge.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download File", exact: true }).click();
    const artifact = await downloaded;
    expect(artifact.suggestedFilename()).toBe("protected-new-merge.pdf");
    expect(readFileSync((await artifact.path())!)).toEqual(protectedLockOutputAes128);
    await independentlyVerifyDownload(artifact, alphaPassword);
    const merges = apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge");
    expect(merges).toHaveLength(2);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(1);
    const payload = merges[1].body.toString("latin1");
    expect(payload.indexOf('filename="protected-new.pdf"')).toBeLessThan(payload.indexOf('filename="plain-second.pdf"'));
    expect(payload).not.toContain('filename="plain-first.pdf"');
    expect(payload).not.toMatch(/name="(?:password(?:_\d+)?|file_password)"/i);
    const compress = page.getByRole("heading", { name: /Compress PDF/ }).locator("..");
    await compress.getByRole("button", { name: "Open tool" }).click();
    const transferred = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(transferred).toContainText("protected-new-merge.pdf");
    await expect(transferred.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await transferred.getByLabel("PDF password").fill(alphaPassword);
    await transferred.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect(page).toHaveURL(/\/compress-pdf\/workspace$/);
    await expect(page.getByRole("button", { name: "Device", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started/ })).toBeVisible();
    const unlock = unlockRequests();
    expect(unlock).toHaveLength(1);
    expectMultipartUnlock(unlock[0], "protected-new-merge.pdf", protectedLockOutputAes128, alphaPassword);
    expectNoProductionRequests();
});

test("protected Cloud Merge publishes only after the separate new-password Lock response verifies", async ({ page }) => {
    const requests = await runMockedProtectedCloudMerge(page, {
        status: 200,
        contentType: "application/pdf",
        body: protectedLockOutputAes128,
    });
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    expect(requests.map((request) => request.path)).toEqual([
        "/api/structure/merge",
        "/api/security/lock",
    ]);
    const mergePayload = requests[0].body.toString("latin1");
    expect(mergePayload).toContain('name="files"; filename="protected-beta.pdf"');
    expect(mergePayload).not.toMatch(/name="(?:password(?:_\d+)?|file_password)"/i);
    expect(mergePayload).not.toContain(alphaPassword);
    expect(mergePayload).not.toContain(betaPassword);
    expect(requests[0].body.indexOf(protectedBeta)).toBe(-1);
    const lockPayload = requests[1].body.toString("latin1");
    expect(lockPayload).toContain('name="file"; filename="protected-beta-merge.pdf"');
    expect(lockPayload).toContain(`name="password"\r\n\r\n${alphaPassword}`);
    expect(lockPayload).not.toContain(betaPassword);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    await independentlyVerifyDownload(download, alphaPassword);
    expectNoProductionRequests();
});

test("Device protected Merge and new output Lock remain entirely local", async ({ page }) => {
    await prepareProtectedDeviceMerge(page);
    await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/download$/);
    await expect(page.getByText("Task completed successfully!")).toBeVisible();
    expect(processingPosts()).toHaveLength(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download File/i }).click();
    const download = await downloadPromise;
    await independentlyVerifyDownload(download, alphaPassword, 4);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("M1-S2-04 Device output Lock fails closed when the local Lock engine is unavailable", async ({ page }) => {
    test.skip(
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_LOCK !== "false",
        "Run with NEXT_PUBLIC_HYBRID_ENABLE_LOCK=false to exercise the unavailable local output-lock path.",
    );
    await prepareProtectedDeviceMerge(page);
    await page.getByLabel("New output password").fill(alphaPassword);
    await page.getByLabel("Confirm output password").fill(alphaPassword);
    const mergeAction = page.getByRole("button", { name: "Merge 2 PDFs" });
    await expect(mergeAction).toBeEnabled();
    await mergeAction.click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect(page.getByText(/Merge or output-password verification failed\. No download was published\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

async function assertProtectedMergeLockFailure(
    page: Page,
    response: { status: number; contentType: string; body: Buffer | string },
): Promise<void> {
    const requests = await runMockedProtectedCloudMerge(page, response);
    expect(requests.map((request) => request.path)).toEqual([
        "/api/structure/merge",
        "/api/security/lock",
    ]);
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect(page.getByText(/Merge or output-password verification failed\. No download was published\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expectNoProductionRequests();
}

for (const scenario of [
    { name: "HTTP 503", status: 503, contentType: "application/json", body: "{\"message\":\"synthetic lock failure\"}" },
    { name: "HTTP 200 plaintext", status: 200, contentType: "application/pdf", body: plainPdf },
    { name: "malformed PDF", status: 200, contentType: "application/pdf", body: malformedPdf },
    { name: "wrong-password PDF", status: 200, contentType: "application/pdf", body: protectedBeta },
]) {
    test(`protected Merge does not publish after Lock returns ${scenario.name}`, async ({ page }) => {
        await assertProtectedMergeLockFailure(page, scenario);
    });
}

test("a duplicate or stale protected Merge result cannot publish after the queue changes", async ({ page }) => {
    let markRequestSeen!: () => void;
    const requestSeen = new Promise<void>((resolve) => { markRequestSeen = resolve; });
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
    await page.route("**/api/structure/merge", async (route) => {
        captureApiRequest(route.request());
        markRequestSeen();
        await responseGate;
        try {
            await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
        } catch {
            // Queue invalidation may abort the request while this controlled response is held.
        }
    });
    await prepareProtectedCloudMerge(page, "unprotected");
    await page.getByLabel("I understand and confirm that the merged PDF will not be password-protected.").check();
    await page.getByLabel("Authorize Cloud Merge").check();
    const mergeButton = page.getByRole("button", { name: "Merge 2 PDFs" });
    await mergeButton.click();
    await requestSeen;
    const loadingButton = page.getByRole("button", { name: "Merging and verifying output..." });
    await expect(loadingButton).toBeDisabled();
    await loadingButton.click({ force: true });
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/merge").length).toBe(1);

    const plainRow = page.getByText("#2 • plain-two-pages.pdf", { exact: true }).locator("xpath=../..");
    await plainRow.getByRole("button", { name: "Remove" }).click();
    releaseResponse();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/security/lock")).toHaveLength(0);
    expectNoProductionRequests();
});

test("a Merge submission deferred for authentication is discarded after queue and consent changes", async ({ page }) => {
    const releaseAuth = delayAuthSessionResponses();
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await expect.poll(() => apiRequests.filter((request) =>
        request.method === "GET" && request.path.endsWith("/auth/session")
    ).length).toBeGreaterThan(0);

    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-alpha.pdf", mimeType: "application/pdf", buffer: protectedMergeAlpha },
        { name: "plain-two-pages.pdf", mimeType: "application/pdf", buffer: plainPdf },
    ]);
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await preparation.getByRole("button", { name: "Device", exact: true }).click();
    await preparation.getByLabel("PDF password").fill(alphaPassword);
    await preparation.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect.poll(() => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "protected-alpha.pdf", "plain-two-pages.pdf",
    ]);

    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    const outputGroup = page.getByRole("group", { name: "Merged output protection" });
    await outputGroup.getByLabel("Protect merged output with a new password").check();
    await page.getByLabel("New output password").fill("synthetic-new-output-password");
    await page.getByLabel("Confirm output password").fill("synthetic-new-output-password");
    await page.getByLabel("Authorize Cloud Merge").check();
    await page.getByLabel("Authorize Cloud output protection request").check();

    const mergeButton = page.getByRole("button", { name: "Merge 2 PDFs" });
    await expect(mergeButton).toBeEnabled();
    await mergeButton.click();
    await expect.poll(() => apiRequests.filter((request) =>
        request.method === "GET" && request.path.endsWith("/auth/session")
    ).length).toBeGreaterThan(1);
    expect(apiRequests.filter((request) => request.method === "POST")).toHaveLength(0);

    const secondRow = page.getByText("#2 • plain-two-pages.pdf", { exact: true }).locator("xpath=../..");
    await secondRow.getByRole("button", { name: "Remove" }).click();
    await page.getByLabel("Upload Additional PDFs").setInputFiles({
        name: "replacement-plain.pdf", mimeType: "application/pdf", buffer: plainPdf,
    });
    await expect.poll(() => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "protected-alpha.pdf", "replacement-plain.pdf",
    ]);
    await expect(page.getByLabel("Authorize Cloud Merge")).not.toBeChecked();
    await expect(page.getByRole("group", { name: "Cloud output protection authorization" })).toHaveCount(0);
    await expect(page.getByLabel("Protect merged output with a new password")).not.toBeChecked();

    releaseAuth();
    await expect.poll(() => authSessionResponsesFulfilled).toBeGreaterThan(1);
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Download File" })).toHaveCount(0);
    await expect(page.getByText("Task completed successfully!")).toHaveCount(0);
    expectNoProductionRequests();
});

test("protected Merge inputs retain their own passwords and selected positions", async ({ page }) => {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-a.pdf", mimeType: "application/pdf", buffer: protectedMergeAlpha },
        { name: "plain-b.pdf", mimeType: "application/pdf", buffer: plainPdf },
        { name: "protected-c.pdf", mimeType: "application/pdf", buffer: protectedMergeBeta },
    ]);
    let dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("protected-c.pdf");
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "protected-a.pdf", "plain-b.pdf", "protected-c.pdf",
    ]);
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
});

test("Merge result uses the submitted reordered queue for Cloud-only transfer authorization", async ({ page }) => {
    const mergeRequest = await runMixedCloudMerge(page);
    const mergePayload = mergeRequest.body.toString("latin1");
    const plainPosition = mergePayload.indexOf('filename="plain-c.pdf"');
    const protectedPosition = mergePayload.indexOf('filename="protected-b.pdf"');
    expect(plainPosition).toBeGreaterThanOrEqual(0);
    expect(protectedPosition).toBeGreaterThan(plainPosition);
    expect(mergePayload).not.toMatch(/name="(?:password(?:_\d+)?|file_password)"/i);
    expect(mergePayload).not.toContain(alphaPassword);
    expect(mergeRequest.body.indexOf(protectedAlpha)).toBe(-1);

    // The local mock deliberately returns an unencrypted PDF so lineage is tested independently of output encryption.
    const editorCard = page.getByRole("heading", { name: /PDF to Word/ }).locator("..");
    await editorCard.getByRole("button", { name: "Open tool" }).click();
    await expect(page).toHaveURL(/\/pdf-to-word\/workspace$/);
    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    await expect(authorization).toContainText(/Cloud request was started/i);
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/conversion/pdf-to-word")).toHaveLength(0);
    expect(unlockRequests()).toHaveLength(0);

    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();
    await page.getByRole("button", { name: "Convert PDF to DOCX" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/conversion/pdf-to-word").length).toBe(1);
    const targetRequest = apiRequests.find((request) => request.path === "/api/conversion/pdf-to-word")!;
    expect(targetRequest.body.toString("latin1")).not.toContain(alphaPassword);
    expectNoProductionRequests();
});

test("Merge result transfer to a Device-capable target keeps the historical Cloud lockout", async ({ page }) => {
    await runMixedCloudMerge(page);
    // The local mock deliberately returns an unencrypted PDF; the transferred source history remains separate.
    const compressCard = page.getByRole("heading", { name: /Compress PDF/ }).locator("..");
    await compressCard.getByRole("button", { name: "Open tool" }).click();
    await expect(page).toHaveURL(/\/compress-pdf\/workspace$/);
    const device = page.getByRole("button", { name: "Device", exact: true });
    await expect(device).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /A Cloud request was started/ })).toBeVisible();
    expect(apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/compress")).toHaveLength(0);
    expectNoProductionRequests();
});

test("cancelling midway through a mixed Merge queue does not navigate or submit files", async ({ page }) => {
    await page.goto("/merge-pdf");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-a.pdf", mimeType: "application/pdf", buffer: protectedAlpha },
        { name: "plain-b.pdf", mimeType: "application/pdf", buffer: plainPdf },
        { name: "protected-c.pdf", mimeType: "application/pdf", buffer: protectedBeta },
    ]);
    let dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("protected-c.pdf");
    await dialog.getByRole("button", { name: "Cancel all" }).click();
    await expect(page).toHaveURL(/\/merge-pdf$/);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("transferring a protected-source result to PDF Editor cannot submit before target-route consent", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await waitForInteractiveApp(page);
    await page.route("**/api/structure/rotate", async (route) => {
        const request = route.request();
        apiRequests.push({
            method: request.method(),
            origin: new URL(request.url()).origin,
            path: new URL(request.url()).pathname,
            body: request.postDataBuffer() || Buffer.alloc(0),
        });
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });
    await page.route("**/api/security/lock", async (route) => {
        const request = route.request();
        apiRequests.push({
            method: request.method(),
            origin: new URL(request.url()).origin,
            path: new URL(request.url()).pathname,
            body: request.postDataBuffer() || Buffer.alloc(0),
        });
        await route.fulfill({ status: 200, contentType: "application/pdf", body: protectedLockOutputAes128 });
    });
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Device", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    await page.getByRole("button", { name: "Cloud", exact: true }).click();
    await page.getByRole("button", { name: "Rotate All 90°" }).click();
    await page.getByRole("button", { name: "Apply Rotation Matrices" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.method === "POST" && request.path === "/api/structure/rotate").length).toBe(1);
    await expect(page).toHaveURL(/\/rotate-pdf\/download$/);
    const rotatePayload = apiRequests.find((request) => request.path === "/api/structure/rotate")!.body.toString("latin1");
    expect(rotatePayload).not.toContain(alphaPassword);
    expect(rotatePayload).not.toContain('name="password_0"');
    expect(rotatePayload).not.toContain('name="file_password"');

    const editorCard = page.getByRole("heading", { name: "PDF Editor" }).locator("..");
    await editorCard.getByRole("button", { name: "Open tool" }).click();
    const transferredProtectedInput = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(transferredProtectedInput).toBeVisible();
    await transferredProtectedInput.getByLabel("PDF password").fill(alphaPassword);
    await transferredProtectedInput.getByRole("button", { name: "Unlock locally" }).click();
    await expect(page).toHaveURL(/\/edit-pdf\/workspace$/);
    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    await expect(authorization).toContainText(/A Cloud request was started/i);
    const requestCountBeforeConsent = processingPosts().length;
    expect(apiRequests.some((request) => request.path === "/api/edit/extract")).toBe(false);
    expect(processingPosts()).toHaveLength(requestCountBeforeConsent);
    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();
    await expect.poll(() => apiRequests.some((request) => request.method === "POST" && request.path === "/api/edit/extract")).toBe(true);
    const targetRequest = apiRequests.find((request) => request.method === "POST" && request.path === "/api/edit/extract")!;
    expect(targetRequest.body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);
    expect(targetRequest.body.toString("latin1")).not.toContain(alphaPassword);
    expectNoProductionRequests();
});

test("cancellation during Cloud preparation prevents stale navigation after the request returns", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    const releaseResponse = delayNextUnlockResponse();
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(1);
    await page.getByRole("button", { name: "Cancel preparation" }).click();
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    await expect(page.locator('p[role="alert"]')).toContainText("cannot be recalled");
    releaseResponse();
    await page.waitForTimeout(100);
    await expect(page).toHaveURL(/\/rotate-pdf$/);
    expect(unlockRequests()).toHaveLength(1);
});

test("unmount during Cloud preparation aborts follow-on work and cannot restore the stale workspace", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    const releaseResponse = delayNextUnlockResponse();
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(1);
    await page.goto("/tools");
    releaseResponse();
    await expect(page).toHaveURL(/\/tools$/);
    await page.waitForTimeout(100);
    expect(unlockRequests()).toHaveLength(1);
});

test("cancelled and incorrect local preparation make no Cloud request", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cancel all" }).click();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    expect(processingPosts()).toHaveLength(0);

    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const retryDialog = page.getByRole("dialog", { name: "Protected document detected" });
    await retryDialog.getByRole("button", { name: "Device", exact: true }).click();
    await retryDialog.getByLabel("PDF password").fill("wrong synthetic password");
    await retryDialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(retryDialog.getByRole("alert")).toContainText("No Cloud fallback occurred");
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
});

test("plain input keeps the current route behavior and explicit Unlock remains a deliberate operation", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page).toHaveURL(/\/rotate-pdf\/workspace$/);
    expect(processingPosts()).toHaveLength(0);

    await page.goto("/unlock-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    await expect(page).toHaveURL(/\/unlock-pdf\/workspace$/);
    await expect(page.getByPlaceholder("Enter the password to decrypt the file")).toBeVisible();
    expect(processingPosts()).toHaveLength(0);
});

test("image-to-PDF accepts image input without PDF protection inspection or a Cloud preparation request", async ({ page }) => {
    await page.goto("/images-to-pdf");
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "synthetic-image.png",
        mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64"),
    });
    await expect(page).toHaveURL(/\/images-to-pdf\/workspace$/);
    expect(processingPosts()).toHaveLength(0);
});

test("malformed PDF inspection fails closed without a processing request", async ({ page }) => {
    await page.goto("/rotate-pdf");
    await chooseFile(page, "malformed.pdf", malformedPdf);
    await expect(page.locator("p[role='alert']")).toContainText("Could not verify whether");
    expect(processingPosts()).toHaveLength(0);
});

test("Merge preserves per-file passwords and requires Cloud authorization for additional protected PDFs", async ({ page }) => {
    await page.goto("/merge-pdf");
    // Select both protected sources in one batch so queue order and per-file passwords are exercised.
    await page.locator('input[type="file"]').first().setInputFiles([
        { name: "protected-alpha.pdf", mimeType: "application/pdf", buffer: protectedAlpha },
        { name: "protected-beta.pdf", mimeType: "application/pdf", buffer: protectedBeta },
    ]);

    let dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByRole("button", { name: "Cloud", exact: true }).click();
    await dialog.getByLabel("PDF password").fill(alphaPassword);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(1);
    expectMultipartUnlock(unlockRequests()[0], "protected-alpha.pdf", protectedAlpha, alphaPassword);

    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("protected-beta.pdf");
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(2);
    expectMultipartUnlock(unlockRequests()[1], "protected-beta.pdf", protectedBeta, betaPassword);
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);

    const deviceChoice = page.getByRole("button", { name: "Device", exact: true });
    await expect(deviceChoice).toBeDisabled();
    await page.getByLabel("Upload Additional PDFs").setInputFiles({
        name: "protected-beta.pdf",
        mimeType: "application/pdf",
        buffer: protectedBeta,
    });
    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await dialog.getByLabel("PDF password").fill(betaPassword);
    expect(unlockRequests()).toHaveLength(2);
    await dialog.getByRole("button", { name: "Authorize Cloud unlock" }).click();
    await expect.poll(() => unlockRequests().length).toBe(3);
    expectMultipartUnlock(unlockRequests()[2], "protected-beta.pdf", protectedBeta, betaPassword);
    await expect(page.getByRole("status").filter({ hasText: /Cloud request was started/ })).toBeVisible();
});

test("legacy shared uploader fails closed for protected input without an explicit policy", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    const picker = page.locator('input[type="file"]').first();
    await picker.setInputFiles({
        name: "protected-alpha.pdf",
        mimeType: "application/pdf",
        buffer: protectedAlpha,
    });
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("does not have an approved protected-PDF preparation path");
    await expect(dialog.getByLabel("PDF password")).toHaveCount(0);
    expect(processingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Legacy Studio rejects an encrypted PDF imported from a project before creating a preview session", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "protected-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: protectedStudioProject,
    });

    await expect(page.getByRole("paragraph").filter({ hasText: /Legacy Studio only accepts unprotected PDFs from project and recovery files/i })).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    expect(studioProcessingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Legacy Studio rejects protected PDFs hidden in project history before enabling undo or redo", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "protected-history-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: protectedStudioHistoryProject,
    });

    await expect(page.getByRole("paragraph").filter({ hasText: /Legacy Studio only accepts unprotected PDFs from project and recovery files/i })).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    expect(studioProcessingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Legacy Studio rejects protected PDFs hidden in future project snapshots before consent", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "protected-future-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: protectedStudioFutureProject,
    });

    await expect(page.getByRole("paragraph").filter({
        hasText: /Legacy Studio only accepts unprotected PDFs from project and recovery files/i,
    })).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);
    expectNoProductionRequests();
});

test("restored .pns project waits for explicit Cloud preview authorization and can be declined", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "plain-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });

    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    await expect(consent).toContainText(/preview rendering uses Platen Cloud/i);
    await expect(consent).toContainText(/current PDF and its saved document-history snapshots/i);
    await expect(consent).toContainText(/source-protection or earlier Device\/Cloud execution history.*cannot be reconstructed/i);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);

    await consent.getByRole("button", { name: "Cancel" }).click();
    await expect(consent).toHaveCount(0);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Upload a PDF to start the Studio" })).toBeVisible();
    expectNoProductionRequests();
});

test("authorized restored project can preview current, past, and future snapshots without another prompt", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "plain-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });

    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")[0].body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Control+y");
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(2);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(3);
    await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);
    expectNoProductionRequests();
});

test("restored preview authorization remains valid while its exact File is retained by Undo and Redo history", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "authorized-history-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });

    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);

    const sidebarInput = page.getByRole("complementary").locator('input[type="file"]');
    await sidebarInput.setInputFiles({
        name: "failed-replacement.pdf",
        mimeType: "application/pdf",
        buffer: malformedPdf,
    });
    await expect(page.getByRole("alert").filter({ hasText: /Could not verify whether.*protected/i })).toBeVisible();
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Cloud preview for this restored Studio project requires explicit Cloud preview authorization/i)).toHaveCount(0);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(1);

    await sidebarInput.setInputFiles({
        name: "ordinary-replacement.pdf",
        mimeType: "application/pdf",
        buffer: plainPdf,
    });
    await expect(page.getByRole("complementary").getByText("ordinary-replacement.pdf", { exact: true })).toBeVisible();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(2);

    await page.keyboard.press("Control+z");
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
    await expect(page.getByText(/Cloud preview for this restored Studio project requires explicit Cloud preview authorization/i)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);

    await page.keyboard.press("Control+y");
    await expect(page.getByRole("complementary").getByText("ordinary-replacement.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText(/Cloud preview for this restored Studio project requires explicit Cloud preview authorization/i)).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
    await expect(page.getByText(/Cloud preview for this restored Studio project requires explicit Cloud preview authorization/i)).toHaveCount(0);

    const previewSessions = apiRequests.filter((request) => request.path === "/api/conversion/preview/session");
    expect(previewSessions).toHaveLength(2);
    expect(previewSessions[0].body.toString("latin1")).toContain('filename="plain-two-pages.pdf"');
    expect(previewSessions[1].body.toString("latin1")).toContain('filename="ordinary-replacement.pdf"');
    expect(apiRequests.filter((request) => request.path === "/api/security/unlock")).toHaveLength(0);
    expect(studioProcessingPosts().map((request) => request.path)).toEqual([
        "/api/conversion/preview/session",
        "/api/conversion/preview/session",
    ]);
    expectNoProductionRequests();
});

test("tool-generated Studio replacement keeps the restored source preview authorized through Undo", async ({ page }) => {
    const rotateRequests: ApiRequest[] = [];
    await page.route("**/api/structure/rotate", async (route) => {
        rotateRequests.push(captureApiRequest(route.request()));
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "tool-replacement-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });

    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);

    await page.getByRole("button", { name: "Rotate", exact: true }).click();
    await page.getByRole("button", { name: "Rotate all 90°" }).click();
    await page.getByRole("button", { name: "Apply rotation to current document" }).click();

    await expect.poll(() => rotateRequests.length).toBe(1);
    await expect(page.getByText("The rotated PDF replaced the current document and is now part of the Studio history.")).toBeVisible();
    await expect(page.getByRole("complementary").getByText("rotated-document.pdf", { exact: true }).first()).toBeVisible();

    await page.keyboard.press("Control+z");
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: "Preview page 1" })).toBeVisible();
    await expect(page.getByText(/Cloud preview for this restored Studio project requires explicit Cloud preview authorization/i)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);

    expect(rotateRequests[0].path).toBe("/api/structure/rotate");
    expect(rotateRequests[0].body.toString("latin1")).toContain('filename="plain-two-pages.pdf"');
    expect(rotateRequests[0].body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);
    expect(apiRequests.filter((request) => request.path === "/api/security/unlock")).toHaveLength(0);
    expectNoProductionRequests();
});

test("a different imported project requires its own preview authorization", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    const welcomeInput = page.locator('input[type="file"]').first();
    await welcomeInput.setInputFiles({
        name: "first-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    const firstConsent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(firstConsent).toBeVisible();
    await firstConsent.getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);

    const sidebarInput = page.getByRole("complementary").locator('input[type="file"]');
    await sidebarInput.setInputFiles({
        name: "second-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    const secondConsent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(secondConsent).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(1);

    await secondConsent.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(1);
    expectNoProductionRequests();
});

test("a newer project import wins over an older blocked inspection", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-two-pages.pdf");
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    const picker = page.locator('input[type="file"]').first();
    await picker.setInputFiles({
        name: "slow-project-a.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await waitForBlockedStudioInspection(page);

    await picker.setInputFiles({
        name: "project-b.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: alternatePlainStudioProject,
    });
    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    await consent.getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);

    await releaseBlockedStudioInspection(page);
    await page.waitForTimeout(100);
    const sessions = apiRequests.filter((request) => request.path === "/api/conversion/preview/session");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].body.toString("latin1")).toContain('filename="scanned-image-only.pdf"');
    expect(sessions[0].body.indexOf(plainPdf)).toBe(-1);
    await expect(page.getByRole("heading", { name: /Authorize Cloud preview/i })).toHaveCount(0);
    expectNoProductionRequests();
});

test("authorizing restored project preview does not persist an authorization token", async ({ page }) => {
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "plain-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i })
        .getByRole("button", { name: "Authorize Cloud preview" }).click();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);

    const storedAuthorization = await page.evaluate(() => {
        const allValues = [localStorage, sessionStorage].flatMap((storage) =>
            Array.from({ length: storage.length }, (_, index) => {
                const key = storage.key(index) ?? "";
                return `${key}=${storage.getItem(key) ?? ""}`;
            }),
        ).join("\n");
        return /restoredStudioPreview|cloudPreviewAuthorization/i.test(allValues);
    });
    expect(storedAuthorization).toBe(false);
    expectNoProductionRequests();
});

test("recovery requires preview authorization and declining it preserves the IndexedDB record", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async (pdfBytes) => {
        const request = indexedDB.open("pdfnest-studio", 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onupgradeneeded = () => request.result.createObjectStore("autosave");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const file = new File([new Uint8Array(pdfBytes)], "plain-recovery.pdf", { type: "application/pdf" });
        const transaction = database.transaction("autosave", "readwrite");
        transaction.objectStore("autosave").put({
            version: 1,
            savedAt: Date.now(),
            activeTool: "select",
            zoom: 1,
            current: {
                file,
                pages: [{ id: "synthetic-recovery-page", pageNumber: 1 }],
                currentPageIndex: 0,
                fingerprint: "synthetic-recovery-plain",
            },
            past: [],
            future: [],
        }, "current");
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    }, Array.from(plainPdf));

    await page.goto("/studio");
    await page.getByRole("button", { name: "Resume" }).click();
    const consent = page.getByRole("dialog", { name: /Authorize Cloud preview for this restored project/i });
    await expect(consent).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await consent.getByRole("button", { name: "Cancel" }).click();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    const recoveryStillExists = await page.evaluate(async () => {
        const request = indexedDB.open("pdfnest-studio", 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("autosave", "readonly");
        const result = await new Promise<unknown>((resolve, reject) => {
            const getRequest = transaction.objectStore("autosave").get("current");
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
        database.close();
        return Boolean(result);
    });
    expect(recoveryStillExists).toBe(true);
    expectNoProductionRequests();
});

test("cancelling a blocked recovery inspection preserves the recovery and prevents preview", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-recovery.pdf");
    await page.goto("/");
    await page.evaluate(async (pdfBytes) => {
        const request = indexedDB.open("pdfnest-studio", 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onupgradeneeded = () => request.result.createObjectStore("autosave");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const file = new File([new Uint8Array(pdfBytes)], "plain-recovery.pdf", { type: "application/pdf" });
        const transaction = database.transaction("autosave", "readwrite");
        transaction.objectStore("autosave").put({
            version: 1,
            savedAt: Date.now(),
            activeTool: "select",
            zoom: 1,
            current: {
                file,
                pages: [{ id: "synthetic-recovery-page", pageNumber: 1 }],
                currentPageIndex: 0,
                fingerprint: "synthetic-recovery-plain",
            },
            past: [],
            future: [],
        }, "current");
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    }, Array.from(plainPdf));

    await page.goto("/studio");
    await page.getByRole("button", { name: "Resume" }).click();
    await waitForBlockedStudioInspection(page);
    await page.getByRole("dialog", { name: /Opening restored Studio project/i }).getByRole("button", { name: "Cancel" }).click();
    await releaseBlockedStudioInspection(page);
    await expect(page.getByRole("heading", { name: "Resume previous session?" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/saved recovery remains available/i);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    const recoveryStillExists = await page.evaluate(async () => {
        const request = indexedDB.open("pdfnest-studio", 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction("autosave", "readonly");
        const result = await new Promise<unknown>((resolve, reject) => {
            const getRequest = transaction.objectStore("autosave").get("current");
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        });
        database.close();
        return Boolean(result);
    });
    expect(recoveryStillExists).toBe(true);
    expectNoProductionRequests();
});

test("cancelling while restored snapshot inspection is blocked cannot start preview", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-two-pages.pdf");
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "slow-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await waitForBlockedStudioInspection(page);
    await page.getByRole("dialog", { name: /Opening restored Studio project/i }).getByRole("button", { name: "Cancel" }).click();
    await releaseBlockedStudioInspection(page);
    await page.waitForTimeout(100);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Upload a PDF to start the Studio" })).toBeVisible();
    expectNoProductionRequests();
});

test("reset invalidates a restored-project inspection before its late completion", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-two-pages.pdf");
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "slow-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await waitForBlockedStudioInspection(page);
    // Exercise the reset callback while the restore dialog is modal; normal
    // pointer interaction is intentionally blocked by that dialog.
    await page.getByRole("button", { name: "Reset" }).dispatchEvent("click");
    await releaseBlockedStudioInspection(page);
    await page.waitForTimeout(100);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Upload a PDF to start the Studio" })).toBeVisible();
    expectNoProductionRequests();
});

test("a newer PDF selection wins over a blocked restored-project inspection", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-two-pages.pdf");
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles({
        name: "slow-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await waitForBlockedStudioInspection(page);

    await input.setInputFiles({
        name: "replacement.pdf",
        mimeType: "application/pdf",
        buffer: plainPdf,
    });
    await expect(page.getByRole("complementary").getByText("replacement.pdf", { exact: true })).toBeVisible();
    await releaseBlockedStudioInspection(page);
    await page.waitForTimeout(150);

    const sessions = apiRequests.filter((request) => request.path === "/api/conversion/preview/session");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].body.toString("latin1")).toContain('filename="replacement.pdf"');
    await expect(page.getByRole("dialog", { name: /Authorize Cloud preview/i })).toHaveCount(0);
    expectNoProductionRequests();
});

test("unmount during a blocked project inspection prevents late preview submission", async ({ page }) => {
    await blockStudioSnapshotInspection(page, "plain-two-pages.pdf");
    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "slow-project.pns",
        mimeType: "application/x-pdfnest-project",
        buffer: plainStudioProject,
    });
    await waitForBlockedStudioInspection(page);

    await page.locator('header a[href="/"]').dispatchEvent("click");
    await page.waitForURL("**/");
    await releaseBlockedStudioInspection(page);
    await page.waitForTimeout(100);
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    expectNoProductionRequests();
});

test("Legacy Studio rejects a protected recovery document before creating a preview session", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async (pdfBytes) => {
        const request = indexedDB.open("pdfnest-studio", 1);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onupgradeneeded = () => request.result.createObjectStore("autosave");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const protectedFile = new File([new Uint8Array(pdfBytes)], "recovery-protected.pdf", { type: "application/pdf" });
        const transaction = database.transaction("autosave", "readwrite");
        transaction.objectStore("autosave").put({
            version: 1,
            savedAt: Date.now(),
            activeTool: "select",
            zoom: 1,
            current: {
                file: protectedFile,
                pages: [{ id: "synthetic-recovery-page", pageNumber: 1 }],
                currentPageIndex: 0,
                fingerprint: "synthetic-recovery-protected",
            },
            past: [],
            future: [],
        }, "current");
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    }, Array.from(protectedAlpha));

    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "Resume previous session?" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();

    await expect(page.getByRole("paragraph").filter({
        hasText: /Legacy Studio only accepts unprotected PDFs from project and recovery files/i,
    })).toBeVisible();
    expect(apiRequests.filter((request) => request.path === "/api/conversion/preview/session")).toHaveLength(0);
    expect(studioProcessingPosts()).toHaveLength(0);
    expectNoProductionRequests();
});

test("Legacy Studio still submits plain PDFs to its existing Rotate Cloud endpoint", async ({ page }) => {
    const rotateRequests: ApiRequest[] = [];
    await page.route("**/api/structure/rotate", async (route) => {
        rotateRequests.push(captureApiRequest(route.request()));
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rotate", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Rotate", exact: true }).click();
    await page.getByRole("button", { name: "Rotate all 90°" }).click();
    await page.getByRole("button", { name: "Apply rotation to current document" }).click();

    await expect.poll(() => rotateRequests.length).toBe(1);
    const rotateRequest = rotateRequests[0];
    expect(rotateRequest.path).toBe("/api/structure/rotate");
    expect(rotateRequest.method).toBe("POST");
    expect(rotateRequest.body.toString("latin1")).toContain('filename="plain-two-pages.pdf"');
    expect(rotateRequest.body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);
    expectNoProductionRequests();
});

test("Legacy Studio still submits plain multiple-file input to its existing Merge Cloud endpoint", async ({ page }) => {
    const mergeRequests: ApiRequest[] = [];
    await page.route("**/api/structure/merge", async (route) => {
        mergeRequests.push(captureApiRequest(route.request()));
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
    });

    await page.goto("/studio");
    await waitForInteractiveApp(page);
    await chooseFile(page, "plain-base.pdf", plainPdf);
    await expect(page.getByRole("complementary").getByText("plain-base.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
        name: "plain-additional.pdf",
        mimeType: "application/pdf",
        buffer: plainPdf,
    });
    await expect(page.getByRole("button", { name: "Merge into current document" })).toBeEnabled();
    await page.getByRole("button", { name: "Merge into current document" }).click();

    await expect.poll(() => mergeRequests.length).toBe(1);
    const mergeRequest = mergeRequests[0];
    const payload = mergeRequest.body.toString("latin1");
    expect(mergeRequest.path).toBe("/api/structure/merge");
    expect(mergeRequest.method).toBe("POST");
    expect(payload).toContain('filename="plain-base.pdf"');
    expect(payload).toContain('filename="plain-additional.pdf"');
    expect(mergeRequest.body.indexOf(plainPdf)).toBeGreaterThanOrEqual(0);
    expectNoProductionRequests();
});

test("legacy Studio sidebar and Merge replacement uploads fail closed for protected input", async ({ page }) => {
    await page.goto("/studio");
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page.getByRole("complementary").getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    const sidebarUpload = page.getByRole("complementary").locator('input[type="file"]');
    await expect(sidebarUpload).toHaveCount(1);
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);
    await page.waitForTimeout(100);
    const requestsBeforeReplacement = processingPosts().length;

    await sidebarUpload.setInputFiles({
        name: "protected-alpha.pdf",
        mimeType: "application/pdf",
        buffer: protectedAlpha,
    });
    let dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("does not have an approved protected-PDF preparation path");
    expect(processingPosts()).toHaveLength(requestsBeforeReplacement);

    await dialog.getByRole("button", { name: "Cancel all" }).click();
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    await page.locator('input[type="file"]').last().setInputFiles({
        name: "protected-beta.pdf",
        mimeType: "application/pdf",
        buffer: protectedBeta,
    });
    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("does not have an approved protected-PDF preparation path");
    expect(processingPosts()).toHaveLength(requestsBeforeReplacement);
    expectNoProductionRequests();
});

test("direct OCR and structured-document PDF pickers fail closed on protected input", async ({ page }) => {
    await page.goto("/highlight-pdf-v2/workspace");
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "protected-alpha.pdf",
        mimeType: "application/pdf",
        buffer: protectedAlpha,
    });
    let dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("does not have an approved protected-PDF preparation path");
    expect(processingPosts()).toHaveLength(0);
    await dialog.getByRole("button", { name: "Cancel all" }).click();
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "plain-two-pages.pdf",
        mimeType: "application/pdf",
        buffer: plainPdf,
    });
    await expect(page.getByTestId("markup-v2-selected-file")).toContainText("plain-two-pages.pdf");

    await page.goto("/document-extraction-v2/workspace");
    const requestsBeforeStructuredProtectedInput = apiRequests.length;
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "protected-alpha.pdf",
        mimeType: "application/pdf",
        buffer: protectedAlpha,
    });
    dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("does not have an approved protected-PDF preparation path");
    expect(unlockRequests()).toHaveLength(0);
    expect(apiRequests.slice(requestsBeforeStructuredProtectedInput).some((request) =>
        containsFilePayload(request, "protected-alpha.pdf", protectedAlpha)
    )).toBe(false);
    await dialog.getByRole("button", { name: "Cancel all" }).click();
    await page.locator('input[type="file"]').first().setInputFiles({
        name: "plain-two-pages.pdf",
        mimeType: "application/pdf",
        buffer: plainPdf,
    });
    await expect(page.getByText("plain-two-pages.pdf", { exact: true })).toBeVisible();
    expectNoProductionRequests();
});

test("Studio V2 keeps its inspection bypass but waits for explicit Cloud session-upload authorization", async ({ page }) => {
    await page.goto("/studio-v2");
    await expect(page.getByRole("heading", { name: "Open a PDF in Studio" })).toBeVisible();
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const dialog = page.getByRole("dialog", { name: "Cloud upload authorization" });
    await expect(dialog).toContainText("Protection inspection is intentionally skipped");
    expect(processingPosts()).toHaveLength(0);
    await expect(dialog.getByLabel("PDF password")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Authorize Cloud upload" }).evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
    });
    await expect.poll(() => apiRequests.filter((request) => request.path.endsWith("/sessions/from-upload")).length).toBe(1);
    const sessionUpload = apiRequests.find((request) => request.path.endsWith("/sessions/from-upload"));
    expect(sessionUpload).toBeDefined();
    expect(sessionUpload?.body.toString("latin1")).toContain('filename="protected-alpha.pdf"');
    expect(sessionUpload?.body.indexOf(protectedAlpha)).toBeGreaterThanOrEqual(0);
    expect(sessionUpload?.body.toString("latin1")).not.toContain('name="password"');
    expectNoProductionRequests();
});
