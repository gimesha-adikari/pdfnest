import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureDir = process.env.PLATEN_M1_FIXTURE_DIR || path.join(os.tmpdir(), "platen-m1-security-fixtures");
const plainPdf = readFileSync(path.join(fixtureDir, "plain-two-pages.pdf"));
const protectedAlpha = readFileSync(path.join(fixtureDir, "protected-alpha.pdf"));
const protectedBeta = readFileSync(path.join(fixtureDir, "protected-beta.pdf"));
const malformedPdf = readFileSync(path.join(fixtureDir, "malformed.pdf"));
const alphaPassword = "platen-m1-user-alpha";
const betaPassword = "platen-m1-user-beta";
const appOrigin = new URL(process.env.E2E_BASE_URL || "http://localhost:3000").origin;

type ApiRequest = { method: string; origin: string; path: string; body: Buffer };
let apiRequests: ApiRequest[] = [];
let externalRequests: string[] = [];
let unlockResponseGate: Promise<void> | null = null;

function delayNextUnlockResponse(): () => void {
    let release = () => {};
    unlockResponseGate = new Promise<void>((resolve) => { release = resolve; });
    return () => release();
}

async function installLocalNetworkBoundary(context: BrowserContext): Promise<void> {
    apiRequests = [];
    externalRequests = [];
    unlockResponseGate = null;
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
        if (request.method() === "GET" && requestUrl.pathname.endsWith("/auth/session")) {
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

function expectNoProductionRequests(): void {
    expect(externalRequests.filter((url) => /platenpdf\.com/i.test(url))).toEqual([]);
}

function expectMultipartUnlock(request: ApiRequest, fileName: string, fileBytes: Buffer, password: string): void {
    const payloadText = request.body.toString("latin1");
    expect(payloadText).toContain(`filename="${fileName}"`);
    expect(payloadText).toContain(`name="password"\r\n\r\n${password}`);
    expect(request.body.indexOf(fileBytes)).toBeGreaterThanOrEqual(0);
}

function containsFilePayload(request: ApiRequest, fileName: string, fileBytes: Buffer): boolean {
    return request.body.toString("latin1").includes(`filename="${fileName}"`) ||
        request.body.indexOf(fileBytes) >= 0;
}

test.beforeEach(async ({ context }) => {
    await installLocalNetworkBoundary(context);
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
    await page.evaluate(() => {
        const originalArrayBuffer = File.prototype.arrayBuffer;
        let releaseRead = () => {};
        const blockedRead = new Promise<void>((resolve) => { releaseRead = resolve; });
        (window as Window & { releaseProtectedFileRead?: () => void }).releaseProtectedFileRead = () => releaseRead();
        File.prototype.arrayBuffer = function (this: File) {
            if (this.name === "protected-alpha.pdf") {
                return blockedRead.then(() => originalArrayBuffer.call(this));
            }
            return originalArrayBuffer.call(this);
        };
    });
    await page.goto("/rotate-pdf");
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    await chooseFile(page, "protected-beta.pdf", protectedBeta);
    await page.evaluate(() => (window as Window & { releaseProtectedFileRead?: () => void }).releaseProtectedFileRead?.());
    const dialog = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(dialog).toContainText("protected-beta.pdf");
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
    await expect(page.getByRole("status").filter({ hasText: /sent to Platen Cloud/ })).toBeVisible();
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(deviceChoice).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: /changing the processing mode cannot undo/ })).toBeVisible();
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
    await page.goto("/highlight-pdf");
    await waitForInteractiveApp(page);
    await chooseFile(page, "protected-alpha.pdf", protectedAlpha);
    const preparation = page.getByRole("dialog", { name: "Protected document detected" });
    await expect(preparation.getByRole("button", { name: "Device", exact: true })).toHaveCount(0);
    await expect(preparation).toContainText(/Some annotation modes can send the prepared PDF/);
    await preparation.getByLabel("PDF password").fill(alphaPassword);
    await preparation.getByRole("button", { name: "Unlock on this device" }).click();

    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
    await authorization.getByRole("button", { name: "Authorize Cloud processing" }).click();
    await expect(page.getByRole("heading", { name: "Highlighter Configuration" })).toBeVisible();
    expect(apiRequests.some((request) => request.method === "POST" && request.path === "/api/markup/highlight")).toBe(false);
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
    await expect(page.getByRole("status").filter({ hasText: /cannot undo that transmission/i })).toBeVisible();
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
    await expect(page.getByText(/This input was already sent to Cloud\. Changing modes cannot undo that transmission\./)).toBeVisible();
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

test("protected Merge inputs retain their own passwords and selected positions", async ({ page }) => {
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
    await dialog.getByLabel("PDF password").fill(betaPassword);
    await dialog.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace$/);
    await expect.poll(async () => page.getByTestId("merge-queue-file").allTextContents()).toEqual([
        "protected-a.pdf", "plain-b.pdf", "protected-c.pdf",
    ]);
    expect(unlockRequests()).toHaveLength(0);
    expect(processingPosts()).toHaveLength(0);
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
        await route.fulfill({ status: 200, contentType: "application/pdf", body: plainPdf });
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
    expect(apiRequests.find((request) => request.path === "/api/structure/rotate")!.body.toString("latin1")).toContain(`name="file_password"\r\n\r\n${alphaPassword}`);

    const editorCard = page.getByRole("heading", { name: "PDF Editor" }).locator("..");
    await editorCard.getByRole("button", { name: "Open tool" }).click();
    await expect(page).toHaveURL(/\/edit-pdf\/workspace$/);
    const authorization = page.getByRole("dialog", { name: "Cloud processing authorization" });
    await expect(authorization).toBeVisible();
    await expect(authorization).toContainText(/already transmitted to Cloud/i);
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
    await expect(page.getByRole("status").filter({ hasText: /sent to Platen Cloud/ })).toBeVisible();
});

test("legacy shared uploader fails closed for protected input without an explicit policy", async ({ page }) => {
    await page.goto("/studio");
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

test("legacy Studio sidebar and Merge replacement uploads fail closed for protected input", async ({ page }) => {
    await page.goto("/studio");
    await chooseFile(page, "plain-two-pages.pdf", plainPdf);
    await expect(page.getByRole("button", { name: /Upload PDF Replace current document/ })).toBeVisible();
    await expect.poll(() => apiRequests.filter((request) => request.path === "/api/conversion/preview/session").length).toBe(1);
    await page.waitForTimeout(100);
    const requestsBeforeReplacement = processingPosts().length;

    await page.getByRole("button", { name: /Upload PDF Replace current document/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles({
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
