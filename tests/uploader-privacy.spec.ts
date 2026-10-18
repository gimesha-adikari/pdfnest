import { test as base, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixtures = path.resolve(process.cwd(), "tests/fixtures");
const plain = fs.readFileSync(path.join(fixtures, "normal_text.pdf"));
const encrypted = fs.readFileSync(path.join(fixtures, "encrypted_sample.pdf"));
const password = "secret123";
const wrongPassword = "wrong-password-f01";
const upload = (name: string, locked = false) => ({ name, mimeType: "application/pdf", buffer: locked ? encrypted : plain });

type Audit = { uploads: { endpoint: string; body: Buffer }[]; mutations: string[]; unlocks: string[]; logs: string[]; offline: boolean; allowProcessing: boolean };
const test = base.extend<{ audit: Audit }>({
    audit: [async ({ context, page }, use, testInfo) => {
        const audit: Audit = { uploads: [], mutations: [], unlocks: [], logs: [], offline: false, allowProcessing: false };
        // Installed BEFORE navigation/upload, across all origins/endpoints, including worker fetches.
        context.on("request", request => {
            const body = request.postDataBuffer();
            const endpoint = new URL(request.url()).pathname;
            // Next dev's own stack-frame POSTs contain source paths, not user documents.
            if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !endpoint.startsWith("/__nextjs") && !endpoint.startsWith("/_next/")) audit.mutations.push(endpoint);
            if (endpoint.includes("/security/unlock")) audit.unlocks.push(endpoint);
            if ((body && (body.includes(Buffer.from("%PDF-")) || body.includes(Buffer.from(password)) || body.includes(Buffer.from(wrongPassword)) || /filename="|JVBERi0/.test(body.toString()))) ||
                /secret123|wrong-password-f01|%PDF-|JVBERi0/.test(request.url()) ||
                (body && /application\/pdf|multipart\/form-data/.test(request.headers()["content-type"] || ""))) {
                audit.uploads.push({ endpoint, body: body || Buffer.alloc(0) });
            }
        });
        page.on("console", message => {
            if (message.type() === "log" || message.type() === "error" || message.type() === "warning") audit.logs.push(message.text());
        });
        await context.route("**/*", async route => {
            const url = new URL(route.request().url());
            const isBackend = url.port === "3199" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/");
            if (isBackend) {
                if (audit.offline) return route.abort("connectionfailed");
                if (url.pathname === "/auth/session") return route.fulfill({ json: {
                    authenticated: true, type: "guest", guest: { id: "synthetic-test-guest", trust: 1 },
                    billing_policy: { mode: "free", processing_unit_limits_enforced: false, purchases_enabled: false },
                } });
                if (url.pathname.includes("health")) return route.fulfill({ json: { status: "ok" } });
                if (route.request().method() !== "GET" && audit.allowProcessing) return route.fulfill({ status: 200, contentType: "application/pdf", body: plain });
                return route.fulfill({ json: {} });
            }
            if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort("blockedbyclient");
            return route.continue();
        });
        await use(audit);
        if (!audit.allowProcessing) expect(audit.mutations, "no application write request before processing").toEqual([]);
        expect(audit.unlocks, "shared preparation must never call server unlock").toEqual([]);
        expect(audit.logs.filter(message => message.includes(password) || message.includes(wrongPassword) || message.includes("%PDF-")), "no password/PDF console logging").toEqual([]);
        await testInfo.attach("network-privacy-audit", { contentType: "application/json", body: JSON.stringify({
            requestsWithDocumentOrPassword: audit.uploads.map(({ endpoint, body }) => ({ endpoint, bytes: body.length })),
            applicationWriteRequests: audit.mutations, serverUnlockRequests: audit.unlocks, offline: audit.offline, explicitProcessingAllowed: audit.allowProcessing,
        }, null, 2) });
    }, { auto: true }],
});

async function unlock(page: Page, value = password) {
    await page.getByPlaceholder("Enter PDF Password").fill(value);
    await page.getByRole("button", { name: "Unlock & Continue", exact: true }).click();
}
async function selected(page: Page, names: string[]) {
    await expect(page).toHaveURL(/\/merge-pdf\/workspace/);
    await expect(page.getByRole("heading", { name: `Selected Files (${names.length})`, exact: true })).toBeVisible();
    for (const [index, name] of names.entries()) await expect(page.getByText(`#${index + 1} • ${name}`, { exact: true })).toBeVisible();
}
async function delayUnlockWorker(page: Page) {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            private readonly unlockWorker: boolean;
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                this.unlockWorker = String(url).includes("pdfcpu.worker.js");
            }
            postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
                const transfer = Array.isArray(transferOrOptions) ? transferOrOptions : transferOrOptions?.transfer || [];
                if (this.unlockWorker) {
                    const state = window as Window & { __unlockPosts?: number };
                    state.__unlockPosts = (state.__unlockPosts || 0) + 1;
                    setTimeout(() => { try { super.postMessage(message, transfer); } catch { /* terminated */ } }, 800);
                }
                else super.postMessage(message, transfer);
            }
        };
    });
}

test("normal PDFs retain order with no document-bearing request before mode selection", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([upload("plain-first.pdf"), upload("plain-second.pdf")]);
    await selected(page, ["plain-first.pdf", "plain-second.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("mixed batches decrypt sequentially in original order; password retry retains queue", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([upload("first.pdf", true), upload("middle.pdf"), upload("third.pdf", true), upload("last.pdf")]);
    await unlock(page, wrongPassword);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Incorrect password");
    await unlock(page);
    await expect(page.getByText('"third.pdf" is encrypted.', { exact: false })).toBeVisible();
    await unlock(page);
    await selected(page, ["first.pdf", "middle.pdf", "third.pdf", "last.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("Device: adding encrypted input retains protected metadata and fails closed", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("existing.pdf"));
    await selected(page, ["existing.pdf"]);
    await page.getByRole("button", { name: "Device", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(upload("added.pdf", true));
    await unlock(page);
    await selected(page, ["existing.pdf", "added.pdf"]);
    await page.getByRole("button", { name: "Merge 2 PDFs", exact: true }).click();
    await expect(page.getByText(/Failed to merge PDFs/)).toBeVisible();
    await expect(page).toHaveURL(/\/merge-pdf\/workspace/);
    expect(audit.uploads).toEqual([]);
});

test("drag-and-drop uses local decryption with backend unavailable", async ({ page, audit }) => {
    audit.offline = true;
    await page.goto("/merge-pdf");
    const transfer = await page.evaluateHandle(({ bytes }) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(bytes)], "dropped.pdf", { type: "application/pdf" }));
        return data;
    }, { bytes: [...encrypted] });
    await page.locator('input[type="file"]').locator("..").dispatchEvent("drop", { dataTransfer: transfer });
    await unlock(page);
    await selected(page, ["dropped.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("wrong password then cancellation leaves previous successful uploads intact", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("existing.pdf"));
    await selected(page, ["existing.pdf"]);
    await page.locator('input[type="file"]').setInputFiles([upload("queued.pdf", true), upload("later.pdf")]);
    await unlock(page, wrongPassword);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Incorrect password");
    await page.getByRole("button", { name: "Cancel All", exact: true }).click();
    await selected(page, ["existing.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("corrupt new upload reports failure without replacing existing files", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("existing.pdf"));
    await selected(page, ["existing.pdf"]);
    await page.locator('input[type="file"]').setInputFiles({ name: "corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 broken") });
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("corrupt or invalid");
    await selected(page, ["existing.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("duplicate click/Enter dispatches one unlock; cancellation ignores late work", async ({ page, audit }) => {
    await delayUnlockWorker(page);
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("cancelled.pdf", true));
    await page.getByPlaceholder("Enter PDF Password").fill(password);
    await page.getByRole("button", { name: "Unlock & Continue", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await page.getByPlaceholder("Enter PDF Password").press("Enter");
    await expect.poll(() => page.evaluate(() => (window as Window & { __unlockPosts?: number }).__unlockPosts || 0)).toBe(1);
    await page.getByRole("button", { name: "Cancel All", exact: true }).click();
    await page.waitForTimeout(1_200); // Deliberately beyond delayed postMessage: stale completion must stay ignored.
    await expect(page).toHaveURL(/\/merge-pdf$/);
    await expect(page.getByPlaceholder("Enter PDF Password")).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles(upload("replacement.pdf"));
    await selected(page, ["replacement.pdf"]);
    expect(audit.uploads).toEqual([]);
});

test("unmount during local decryption cannot navigate on late completion", async ({ page, audit }) => {
    await delayUnlockWorker(page);
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("unmounted.pdf", true));
    await unlock(page);
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(1_200);
    await expect(page).toHaveURL(/\/$/);
    expect(audit.uploads).toEqual([]);
});

test("unavailable WASM fails locally and never requests backend decryption", async ({ page, context, audit }) => {
    await context.route("**/wasm/pdfcpu_watermark.wasm", route => route.abort("failed"));
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles(upload("locked.pdf", true));
    await unlock(page);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/local decryption|Local decryption/);
    await expect(page).toHaveURL(/\/merge-pdf$/);
    expect(audit.uploads).toEqual([]);
});

for (const mode of ["Auto", "Cloud"] as const) {
    test(`${mode}: metadata and document transmission start only after explicit processing`, async ({ page, audit }) => {
        await page.goto("/merge-pdf");
        await page.locator('input[type="file"]').setInputFiles([upload("protected.pdf", true), upload("plain.pdf")]);
        await unlock(page);
        await selected(page, ["protected.pdf", "plain.pdf"]);
        expect(audit.uploads).toEqual([]);
        await page.getByRole("button", { name: mode, exact: true }).click();
        audit.allowProcessing = true;
        await page.getByRole("button", { name: "Merge 2 PDFs", exact: true }).click();
        await expect(page).toHaveURL(/\/merge-pdf\/download/);
        expect(audit.uploads.length).toBeGreaterThan(0);
        const merge = audit.uploads.find(request => request.endpoint.includes("merge"));
        expect(merge).toBeDefined();
        expect(merge!.body.includes(Buffer.from('name="password_0"'))).toBe(true);
        expect(merge!.body.includes(Buffer.from(password))).toBe(true);
    });
}


test("Auto: ordinary PDFs still merge locally after preparation", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').setInputFiles([upload("one.pdf"), upload("two.pdf")]);
    await selected(page, ["one.pdf", "two.pdf"]);
    await page.getByRole("button", { name: "Merge 2 PDFs", exact: true }).click();
    await expect(page).toHaveURL(/\/merge-pdf\/download/);
    expect(audit.uploads).toEqual([]);
});

for (const mode of ["Auto", "Device"] as const) {
    test(`dedicated Unlock PDF keeps its ${mode} workflow and decrypts locally`, async ({ page, audit }) => {
        await page.goto("/unlock-pdf");
        await page.locator('input[type="file"]').setInputFiles(upload("dedicated.pdf", true));
        await expect(page).toHaveURL(/\/unlock-pdf\/workspace/);
        await expect(page.getByPlaceholder("Enter PDF Password")).toHaveCount(0);
        await page.getByRole("button", { name: mode, exact: true }).click();
        await page.locator('input[type="password"]').fill(password);
        await page.getByRole("button", { name: /Remove Security and Unlock PDF/i }).click();
        await expect(page).toHaveURL(/\/unlock-pdf\/download/);
        expect(audit.uploads).toEqual([]);
    });
}


test("overlapping file-change submissions keep the first batch intact", async ({ page, audit }) => {
    await page.goto("/merge-pdf");
    await page.locator('input[type="file"]').evaluate((input, bytes) => {
        const element = input as HTMLInputElement;
        for (const name of ["first-submission.pdf", "duplicate-submission.pdf"]) {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
            element.files = transfer.files;
            element.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }, [...plain]);
    await selected(page, ["first-submission.pdf"]);
    await expect(page.getByText(/duplicate-submission/)).toHaveCount(0);
    expect(audit.uploads).toEqual([]);
});
