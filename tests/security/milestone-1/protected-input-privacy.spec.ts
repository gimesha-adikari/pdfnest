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
            "access-control-allow-headers": "content-type, authorization",
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

        if (request.method() === "POST" && requestUrl.pathname.endsWith("/sessions/from-upload")) {
            await route.fulfill({
                status: 422,
                contentType: "application/json",
                headers: corsHeaders,
                body: JSON.stringify({ message: "Local security test mock rejected session creation after capturing the request." }),
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
