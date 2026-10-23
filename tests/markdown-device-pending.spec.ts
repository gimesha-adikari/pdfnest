import { test, expect, type Page } from "@playwright/test";
import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const fixtures = path.join(process.cwd(), "tests/fixtures/markdown-device-pending");
const preview = (page: Page) => page.getByAltText("Markdown Layout Document Snapshot Mirror");
const save = (page: Page) => page.getByRole("button", { name: /Save Markdown Vector PDF|Rendering Vector PDF/ });
const writes: string[] = [];
test.use({ video: "off" });

test.beforeEach(async ({ context, page, baseURL }) => {
    if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
        throw new Error("Markdown regression requires a loopback frontend; production is forbidden.");
    }
    writes.length = 0;
    page.on("pageerror", error => console.error("Markdown browser error:", error.message));
    context.on("request", request => {
        const url = new URL(request.url());
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !/^\/(_next|__nextjs)/.test(url.pathname)) {
            writes.push(`${request.method()} ${url.origin}${url.pathname}`);
        }
    });
    await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort("blockedbyclient");
        if (url.pathname === "/auth/session") return route.fulfill({ json: {
            authenticated: true, type: "guest", guest: { id: "markdown-regression-guest", trust: 1 },
            billing_policy: { mode: "free", processing_unit_limits_enforced: false, purchases_enabled: false },
        } });
        if (url.port === "3199" || url.pathname.startsWith("/api/")) {
            if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.abort("blockedbyclient");
            return route.fulfill({ json: url.pathname.includes("health") ? { status: "ok" } : {} });
        }
        return route.continue();
    });
});

test.afterEach(async ({ page }, info) => {
    await info.attach("markdown-local-request-audit", { contentType: "application/json", body: JSON.stringify({
        writes, status: await page.getByRole("region", { name: "Markdown conversion status" }).allTextContents(),
        pipeline: await page.evaluate(() => window.markdownDevicePipeline ? {
            stage: window.markdownDevicePipeline.stage, error: window.markdownDevicePipeline.error,
        } : null),
        scope: "Requests observed by this local browser context; external origins and backend writes blocked.",
    }, null, 2) });
    expect(writes, "Markdown must complete without a conversion POST or other backend mutation").toEqual([]);
});

async function ready(page: Page) {
    await expect(save(page)).toBeEnabled({ timeout: 8000 });
    await expect(preview(page)).toBeVisible();
    await expect.poll(() => preview(page).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1190);
    return preview(page).getAttribute("src");
}

// PDF.js display intent awaits rAF in hidden tabs. Holding callbacks reproduces
// that scheduling condition deterministically without mocking PDF.js rendering.
async function suspendFrames(page: Page) {
    await page.evaluate(() => { window.requestAnimationFrame = () => 1; });
}

async function holdNextPdfRead(page: Page) {
    await page.evaluate(() => {
        const original = Blob.prototype.arrayBuffer;
        const state = window as Window & { releaseMarkdownPdf?: () => void; markdownPdfReadHeld?: boolean };
        Blob.prototype.arrayBuffer = async function () {
            if (this.type === "application/pdf" && !state.markdownPdfReadHeld) {
                state.markdownPdfReadHeld = true;
                await new Promise<void>(resolve => { state.releaseMarkdownPdf = resolve; });
            }
            return original.call(this);
        };
    });
}

async function releasePdfRead(page: Page) {
    await page.evaluate(() => (window as Window & { releaseMarkdownPdf?: () => void }).releaseMarkdownPdf?.());
}

test("fresh explicit Device embeds PNG/JPEG and renders with animation frames suspended", async ({ page }) => {
    const bundle = buildSync({ entryPoints: [path.join(process.cwd(), "tests/helpers/markdownDevicePipeline.ts")],
        bundle: true, write: false, platform: "browser", format: "esm", target: "es2022",
        define: { "process.env": JSON.stringify({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:3199", NODE_ENV: "test" }) },
    }).outputFiles[0].text;
    await page.route("**/__markdown-device-pipeline", route => route.fulfill({ contentType: "text/html",
        body: '<script type="module" src="/__markdown-device-pipeline.js"></script>' }));
    await page.route("**/__markdown-device-pipeline.js", route => route.fulfill({ contentType: "text/javascript", body: bundle }));
    await page.goto("/__markdown-device-pipeline");
    await page.waitForFunction(() => Boolean(window.markdownDevicePipeline), undefined, { timeout: 8000 });
    await suspendFrames(page);
    const source = fs.readFileSync(path.join(fixtures, "embedded-device.md"), "utf8");
    await page.evaluate(source => { void window.markdownDevicePipeline.run(source, "embedded-device.md", "device"); }, source);
    await expect.poll(() => page.evaluate(() => window.markdownDevicePipeline.stage), { timeout: 8000 }).toBe("ready");
    const result = await page.evaluate(() => window.markdownDevicePipeline.result);
    expect(result).toMatchObject({ executionMode: "client", fallbackOccurred: false, imageCount: 2, width: 1190 });
    expect(result!.redPixels).toBeGreaterThan(0);
    expect(result!.bluePixels).toBeGreaterThan(0);
});

test("Auto to Device rerun owns a fresh preview; pending mode changes stay disabled", async ({ page }) => {
    await page.goto("/markdown-to-pdf");
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "embedded-device.md"));
    const autoPreview = await ready(page);
    await holdNextPdfRead(page);
    await page.getByRole("button", { name: "Device", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as Window & { markdownPdfReadHeld?: boolean }).markdownPdfReadHeld))).toBe(true);
    await suspendFrames(page);
    await expect(save(page)).toBeDisabled();
    await expect(preview(page)).toHaveCount(0);
    await expect(page.getByText("My Device (Free)", { exact: true })).toBeVisible();
    const auto = page.getByRole("button", { name: "Auto", exact: true });
    await expect(auto).toBeDisabled();
    await auto.evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.getByText("My Device (Free)", { exact: true })).toBeVisible();
    await releasePdfRead(page);
    const devicePreview = await ready(page);
    expect(devicePreview).not.toBe(autoPreview);
    await auto.evaluate(button => (button as HTMLButtonElement).click());
    const rerunAutoPreview = await ready(page);
    expect(rerunAutoPreview).not.toBe(devicePreview);
});

test("Remove during Device rerun cancels ownership and a fresh upload finishes", async ({ page }) => {
    await page.goto("/markdown-to-pdf");
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "embedded-device.md"));
    const oldPreview = await ready(page);
    await holdNextPdfRead(page);
    await page.getByRole("button", { name: "Device", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as Window & { markdownPdfReadHeld?: boolean }).markdownPdfReadHeld))).toBe(true);
    await suspendFrames(page);
    await page.getByRole("button", { name: "Remove", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page).toHaveURL(/\/markdown-to-pdf$/);
    await releasePdfRead(page);
    await expect(preview(page)).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "embedded-auto.md"));
    expect(await ready(page)).not.toBe(oldPreview);
    await expect(page.getByText("Auto (Recommended)", { exact: true })).toBeVisible();
});
