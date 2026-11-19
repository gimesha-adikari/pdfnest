import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const api = process.env.PLATEN_EDITOR_TEST_API ?? "http://localhost:8080";
const ui = process.env.PLATEN_EDITOR_TEST_ORIGIN ?? "http://localhost:3000";
const extraction = "**/api/edit/extract";
let pdf: Buffer;

test.skip(process.env.PLATEN_EDITOR_EXTRACTION_E2E !== "1", "Use the explicit local extraction transport configuration.");

test.beforeAll(async () => {
    for (const origin of [api, ui]) {
        if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            throw new Error("Extraction fault tests require local origins.");
        }
    }
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("A synthetic document for Editor extraction transport regression", { x: 60, y: 720, size: 15, font });
    pdf = Buffer.from(await doc.save({ useObjectStreams: false }));
});

test.beforeEach(async ({ context }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error("Dedicated local credentials required.");
    await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if ([api, ui].includes(url.origin)) return route.continue();
        return route.abort();
    });
    const login = await context.request.post(api + "/api/auth/login", { data: { email, password } });
    expect(login.status()).toBe(200);
});

async function openEditor(page: Page, buffer = pdf) {
    await page.goto("/edit-pdf");
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached();
    await input.setInputFiles({ name: "editor-transport.pdf", mimeType: "application/pdf", buffer });
    await page.waitForURL("**/edit-pdf/workspace");
}

async function expectEditor(page: Page) {
    await expect(page.getByTestId("editor-overlay-layer")).toBeVisible();
    await expect(page.getByTestId("word-hit-target").first()).toBeVisible();
    await expect(page.getByText("Extracting layout", { exact: true })).toHaveCount(0);
}

test("slow upload shows upload and submission without simulated queue progress", async ({ context, page }) => {
    await page.goto("/edit-pdf");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
        offline: false, latency: 0, uploadThroughput: 4096, downloadThroughput: -1,
    });
    await openEditor(page, Buffer.concat([pdf, Buffer.alloc(32 * 1024, 32)]));
    await expect(page.getByText("Uploading PDF", { exact: true })).toBeVisible();
    await expect(page.getByText("10%", { exact: true })).toHaveCount(0);
    await cdp.send("Network.emulateNetworkConditions", {
        offline: false, latency: 0, uploadThroughput: -1, downloadThroughput: -1,
    });
    await expectEditor(page);
});

test("acknowledgment displays the real job before the first status read", async ({ context, page }) => {
    let acknowledge!: () => void;
    const submitGate = new Promise<void>(resolve => { acknowledge = resolve; });
    let checkStatus!: () => void;
    const statusGate = new Promise<void>(resolve => { checkStatus = resolve; });
    let jobId = "";
    await context.route(extraction, async route => {
        const response = await route.fetch();
        expect(response.status()).toBe(202);
        jobId = (await response.json()).job_id;
        await submitGate;
        await route.fulfill({ response });
    });
    let statusGets = 0;
    await context.route("**/api/edit/jobs/*", async route => {
        const response = await route.fetch();
        if (++statusGets === 1) await statusGate;
        if (statusGets <= 2) {
            const job = await response.json();
            await route.fulfill({ response, json: { ...job, status: statusGets === 1 ? "queued" : "running", progress: statusGets === 1 ? 0 : 41, result: null } });
        } else {
            await route.fulfill({ response });
        }
    });
    try {
        await openEditor(page);
        // Routing holds the entire response at the browser interception layer.
        // Chromium can defer the XHR upload-complete event in this setup.
        await expect(page.getByText(/^(Uploading PDF|Submitting extraction)$/)).toBeVisible();
        await expect(page.getByText("No job yet", { exact: true })).toHaveCount(0);
        await expect.poll(() => jobId).not.toBe("");
        acknowledge();
        await expect(page.getByTitle(jobId)).toBeVisible();
        await expect.poll(() => statusGets).toBe(1);
        await expect(page.getByText("10%", { exact: true })).toHaveCount(0);
        checkStatus();
        await expect(page.getByText("0%", { exact: true })).toBeVisible();
        await expect(page.getByText("41%", { exact: true })).toBeVisible();
        await expectEditor(page);
    } finally {
        acknowledge();
        checkStatus();
    }
});

test("submission rejection is actionable and causes no polling", async ({ context, page }) => {
    let reads = 0;
    await context.route("**/api/edit/jobs/*", route => { reads++; return route.continue(); });
    await context.route(extraction, route => route.fulfill({ status: 429, json: { code: "LIMIT", message: "fixture limit" } }));
    await openEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: "processing limit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry extraction" })).toBeVisible();
    expect(reads).toBe(0);
});

test("hung upload or acknowledgment ends and retry reuses the same key", async ({ context, page }) => {
    // Accelerate only the two production submission deadlines. The real XHR
    // still stalls, aborts and invokes the recovery endpoint.
    await page.addInitScript(() => {
        const schedule = window.setTimeout.bind(window);
        Object.defineProperty(window, "setTimeout", {
            value: (handler: TimerHandler, ms?: number, ...args: unknown[]) =>
                schedule(handler, ms === 120_000 || ms === 50_000 ? 2_500 : ms, ...args),
        });
    });
    const ids: string[] = [];
    await context.route(extraction, route => {
        ids.push(route.request().headers()["idempotency-key"]);
        if (ids.length === 1) return;
        return route.continue();
    });
    await openEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: "upload could not be confirmed" })).toBeVisible();
    await expect(page.getByText("10%", { exact: true })).toHaveCount(0);
    expect(ids).toHaveLength(1);
    await page.getByRole("button", { name: "Retry upload" }).click();
    await expectEditor(page);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
});

test("a lost acknowledgment and transient drops recover the accepted job without a second POST", async ({ context, page, playwright }) => {
    let attempt = "";
    let jobId = "";
    let posts = 0;
    let dropped = 0;
    await context.route(extraction, async route => {
        posts++;
        attempt = route.request().headers()["idempotency-key"];
        const backend = await route.fetch();
        expect(backend.status()).toBe(202);
        jobId = (await backend.json()).job_id;
        await route.abort("connectionreset");
    });
    await context.route("**/api/edit/jobs/*", route => ++dropped <= 2 ? route.abort("connectionreset") : route.continue());
    await openEditor(page);
    await expectEditor(page);
    expect(posts).toBe(1);
    expect(dropped).toBeGreaterThanOrEqual(3);
    const read = await context.request.get(api + "/api/edit/extract/requests/" + attempt);
    expect(await read.json()).toMatchObject({ state: "accepted", job_id: jobId });
    const again = await context.request.post(api + "/api/edit/extract", {
        headers: { "Idempotency-Key": attempt },
        multipart: { file: { name: "editor-transport.pdf", mimeType: "application/pdf", buffer: pdf } },
    });
    expect(again.status()).toBe(409);
    const other = await playwright.request.newContext();
    try {
        const foreign = await other.get(api + "/api/edit/extract/requests/" + attempt);
        expect(await foreign.json()).toEqual({ state: "not_found" });
    } finally {
        await other.dispose();
    }
});

test("workspace navigation reconnects to the same extraction", async ({ context, page }) => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    let posts = 0;
    let jobId = "";
    await context.route(extraction, async route => {
        posts++;
        const response = await route.fetch();
        expect(response.status()).toBe(202);
        jobId = (await response.json()).job_id;
        await gate;
        await route.fulfill({ response });
    });
    try {
        await openEditor(page);
        await expect.poll(() => jobId).not.toBe("");
        await page.goBack();
        await expect(page).toHaveURL(/\/edit-pdf$/);
        await page.goForward();
        await expect(page).toHaveURL(/\/edit-pdf\/workspace$/);
        finish();
        await expectEditor(page);
        expect(posts).toBe(1);
    } finally {
        finish();
    }
});

test("failed worker status keeps the job identifier and displays an actionable error", async ({ context, page }) => {
    let jobId = "";
    await context.route(extraction, async route => {
        const response = await route.fetch();
        jobId = (await response.json()).job_id;
        await route.fulfill({ response });
    });
    await context.route("**/api/edit/jobs/*", async route => {
        const status = await route.fetch();
        const job = await status.json();
        await route.fulfill({ response: status, json: { ...job, status: "failed", error_code: "LANGUAGE_REQUIRED", result: null } });
    });
    await openEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: "Choose a language and retry" })).toBeVisible();
    await expect(page.getByTitle(jobId)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry extraction" })).toBeVisible();
});

test("an unavailable status endpoint stops spinning and resumes the same job on demand", async ({ context, page }) => {
    await page.addInitScript(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout = ms => timeout(ms === 20_000 ? 400 : ms);
    });
    let submissions = 0;
    let reads = 0;
    let jobId = "";
    await context.route(extraction, async route => {
        submissions++;
        const response = await route.fetch();
        jobId = (await response.json()).job_id;
        await route.fulfill({ response });
    });
    await context.route("**/api/edit/jobs/*", () => { reads++; });
    await openEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: "Restore your connection" })).toBeVisible();
    await expect(page.getByTitle(jobId)).toBeVisible();
    expect(reads).toBe(3);
    await context.unroute("**/api/edit/jobs/*");
    await page.getByRole("button", { name: "Check extraction status" }).click();
    await expectEditor(page);
    expect(submissions).toBe(1);
});

test("an expired tracking session is visible and checking again does not resubmit", async ({ context, page }) => {
    let posts = 0;
    await context.route(extraction, route => { posts++; return route.continue(); });
    await context.route("**/api/edit/jobs/*", route => route.fulfill({ status: 401, json: { error: "expired session" } }));
    await openEditor(page);
    await expect(page.getByRole("alert").filter({ hasText: "session expired" })).toBeVisible();
    await context.unroute("**/api/edit/jobs/*");
    await page.getByRole("button", { name: "Check extraction status" }).click();
    await expectEditor(page);
    expect(posts).toBe(1);
});
