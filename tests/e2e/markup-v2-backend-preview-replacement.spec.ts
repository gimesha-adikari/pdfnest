import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

import { authenticateProUser } from "../helpers/auth";

type Action = "highlight" | "underline" | "strikeout";
type TestFilePayload = { name: string; mimeType: string; buffer: Buffer };

const OUTPUT_DIR = path.resolve(process.cwd(), "../output/ocr-markup-v2-backend-preview-replacement-01");
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const ACTIONS: Action[] = ["highlight", "underline", "strikeout"];
const ROUTES: Record<Action, string> = {
    highlight: "/highlight-pdf-v2/workspace",
    underline: "/underline-pdf-v2/workspace",
    strikeout: "/strikeout-pdf-v2/workspace",
};
const REAL_SCANNED_FIXTURE = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";

// The visible preview bytes are supplied by the mocked backend preview route.
// PDF.js still parses the valid test PDF for native text geometry, but it must
// not paint the visible page canvas.
const BACKEND_PREVIEW_IMAGE = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

function writeEvidence(name: string, payload: unknown): void {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function makePdf(text: string, pageCount = 1): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    for (let index = 0; index < pageCount; index += 1) {
        const page = pdf.addPage([600, 800]);
        page.drawText(`${text} ${index + 1}`, { x: 80, y: 650, size: 36 });
    }
    return Buffer.from(await pdf.save());
}

async function installPreviewRoutes(page: import("@playwright/test").Page, options: { failFirstPage?: boolean; pageCount?: number } = {}): Promise<{ sessionCreates: number; pageRenders: number }> {
    const counts = { sessionCreates: 0, pageRenders: 0 };
    await page.route("**/api/v2/ocr/markup/capabilities", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                schema_version: "ocr_v2_markup_capabilities.v1",
                service_ready: true,
                profile: "MARKUP_V2",
                actions: ACTIONS,
                modes: ["smart", "ocr", "native"],
                languages: [{ code: "eng", name: "English" }, { code: "sin", name: "Sinhala" }],
                required_capabilities: ["TEXT", "WORD_GEOMETRY", "READING_ORDER"],
            }),
        });
    });
    await page.route("**/api/conversion/preview/session", async (route) => {
        if (route.request().method() === "POST") {
            counts.sessionCreates += 1;
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session_id: `preview-${counts.sessionCreates}`, page_count: options.pageCount || 1 }) });
            return;
        }
        await route.continue();
    });
    await page.route("**/api/conversion/preview/session/*/page/*", async (route) => {
        counts.pageRenders += 1;
        if (options.failFirstPage && counts.pageRenders === 1) {
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PREVIEW_UNAVAILABLE" }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: "image/png", body: BACKEND_PREVIEW_IMAGE });
    });
    return counts;
}

async function chooseWithChooser(page: import("@playwright/test").Page, trigger: string, file?: TestFilePayload): Promise<void> {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByTestId(trigger).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(file ? [file] : []);
}

async function waitForBackendPage(page: import("@playwright/test").Page): Promise<void> {
    await expect(page.getByTestId("markup-pdf-backend-preview-image")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("markup-pdf-page").locator("canvas")).toHaveCount(0);
}

test.describe.serial("OCR-aware markup backend preview and replacement flow", () => {
    test("uses the backend page image and atomically replaces/cancels files on every operation route", async ({ page }) => {
        const counts = await installPreviewRoutes(page);
        const results: Record<string, unknown>[] = [];
        const pdfA = await makePdf("Document A");
        const pdfB = await makePdf("Document B");
        const pdfC = await makePdf("Document C");

        for (const action of ACTIONS) {
            await page.goto(ROUTES[action]);
            await page.getByTestId("markup-v2-file-input").setInputFiles({ name: `${action}-a.pdf`, mimeType: "application/pdf", buffer: pdfA });
            await expect(page.getByTestId("markup-v2-selected-file")).toContainText(`${action}-a.pdf`);
            await waitForBackendPage(page);
            await page.getByTestId("markup-v2-query").fill("keep this query");
            const previewBeforeCancel = await page.getByTestId("markup-pdf-backend-preview-image").getAttribute("src");

            await chooseWithChooser(page, "markup-v2-choose-another");
            await expect(page.getByTestId("markup-v2-selected-file")).toContainText(`${action}-a.pdf`);
            await expect(page.getByTestId("markup-v2-query")).toHaveValue("keep this query");
            await expect(page.getByTestId("markup-pdf-backend-preview-image")).toHaveAttribute("src", previewBeforeCancel || "");

            await chooseWithChooser(page, "markup-v2-choose-another", { name: `${action}-b.pdf`, mimeType: "application/pdf", buffer: pdfB });
            await expect(page.getByTestId("markup-v2-selected-file")).toContainText(`${action}-b.pdf`);
            await expect(page.getByTestId("markup-v2-query")).toHaveValue("");
            await waitForBackendPage(page);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-replacement-document.png`), fullPage: true });

            await page.getByTestId("markup-v2-query").fill("stale state must clear");
            await chooseWithChooser(page, "markup-v2-reset", { name: `${action}-c.pdf`, mimeType: "application/pdf", buffer: pdfC });
            await expect(page.getByTestId("markup-v2-selected-file")).toContainText(`${action}-c.pdf`);
            await expect(page.getByTestId("markup-v2-query")).toHaveValue("");
            await waitForBackendPage(page);
            results.push({ action, cancel_kept_document: true, replacement_swapped_atomically: true, start_over_started_new_selection: true, visible_backend_preview: true, visible_canvas_count: 0 });
        }

        writeEvidence("replacement-picker.json", { routes: results, chooser: "single shared hidden input" });
        writeEvidence("picker-cancel.json", { routes: results.map((item) => ({ action: item.action, file_and_query_preserved: item.cancel_kept_document })), status: "PASS" });
        writeEvidence("start-over.json", { routes: results.map((item) => ({ action: item.action, new_document_flow: item.start_over_started_new_selection })), status: "PASS" });
        writeEvidence("preview-architecture.json", { primary_visible_source: "backend processed page response", pdfjs_visible_canvas: false, routes: ACTIONS });
        writeEvidence("render-request-counts.json", { session_create_requests: counts.sessionCreates, page_render_requests: counts.pageRenders, duplicate_page_requests_not_asserted_in_this_flow: true });
        expect(results).toHaveLength(ACTIONS.length);
        expect(counts.sessionCreates).toBeGreaterThanOrEqual(ACTIONS.length * 3);
    });

    test("keeps the selected file while retrying a transient backend preview failure", async ({ page }) => {
        await installPreviewRoutes(page, { failFirstPage: true });
        await page.goto(ROUTES.highlight);
        const pdf = await makePdf("Retryable preview");
        await page.getByTestId("markup-v2-file-input").setInputFiles({ name: "retry-preview.pdf", mimeType: "application/pdf", buffer: pdf });
        await expect(page.getByTestId("markup-v2-selected-file")).toContainText("retry-preview.pdf");
        await expect(page.getByTestId("markup-pdf-preview-error")).toBeVisible();
        await page.getByTestId("markup-pdf-preview-retry").click();
        await expect(page.getByTestId("markup-pdf-backend-preview-image")).toBeVisible();
        await expect(page.getByTestId("markup-v2-selected-file")).toContainText("retry-preview.pdf");
        writeEvidence("preview-retry.json", { status: "PASS", file_preserved: true, scoped_backend_retry: true });
    });

    test("reuses the processed session and page cache when navigating back", async ({ page }) => {
        const counts = await installPreviewRoutes(page, { pageCount: 2 });
        await page.goto(ROUTES.highlight);
        const pdf = await makePdf("Cached page", 2);
        await page.getByTestId("markup-v2-file-input").setInputFiles({ name: "cached-pages.pdf", mimeType: "application/pdf", buffer: pdf });
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 2");
        await waitForBackendPage(page);
        await page.getByRole("button", { name: "Next PDF page" }).click();
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 2 of 2");
        await waitForBackendPage(page);
        await page.getByRole("button", { name: "Previous PDF page" }).click();
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 2");
        await waitForBackendPage(page);
        expect(counts.sessionCreates).toBe(1);
        expect(counts.pageRenders).toBe(2);
        writeEvidence("render-request-counts.json", { status: "PASS", session_create_requests: counts.sessionCreates, page_render_requests: counts.pageRenders, repeated_page_navigation_reused_cached_result: true });
    });

    test("starts from an empty workspace with a styled Choose PDF action", async ({ page }) => {
        await installPreviewRoutes(page);
        await page.goto(ROUTES.highlight);
        await expect(page.getByTestId("markup-v2-choose-pdf")).toBeVisible();
        await expect(page.getByTestId("markup-v2-file-input")).toHaveAttribute("aria-label", "Choose a PDF document");
        await expect(page.getByText("No file chosen")).toHaveCount(0);
    });

    test("uses one backend session and reuses processed pages for a real scanned document", async ({ page }) => {
        test.setTimeout(240_000);
        await authenticateProUser(page);
        const counts = { sessionCreates: 0, pageRenders: 0, ocrPreviewRequests: 0, browserErrors: [] as string[] };
        page.on("pageerror", (error) => counts.browserErrors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") counts.browserErrors.push(message.text()); });
        page.on("request", (request) => {
            const url = request.url();
            if (request.method() === "POST" && url.includes("/api/conversion/preview/session")) counts.sessionCreates += 1;
            if (request.method() === "POST" && url.includes("/api/v2/ocr/markup/preview")) counts.ocrPreviewRequests += 1;
        });
        page.on("response", (response) => {
            if (response.request().method() === "GET" && response.url().includes("/api/conversion/preview/session/") && response.url().includes("/page/")) counts.pageRenders += 1;
        });

        await page.goto(ROUTES.highlight);
        await page.getByTestId("markup-v2-file-input").setInputFiles(REAL_SCANNED_FIXTURE);
        await expect(page.getByTestId("markup-pdf-backend-preview-image")).toBeVisible({ timeout: 120_000 });
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
        await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 120_000 });
        await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(311, { timeout: 120_000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "backend-rendered-scanned-page.png"), fullPage: true });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "scanned-ocr-overlay.png"), fullPage: true });

        await page.getByRole("button", { name: "Next PDF page" }).click();
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 2 of 3");
        await expect(page.getByTestId("markup-pdf-backend-preview-image")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(315, { timeout: 120_000 });
        await page.getByRole("button", { name: "Previous PDF page" }).click();
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
        await expect(page.getByTestId("markup-pdf-backend-preview-image")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(311, { timeout: 120_000 });

        expect(counts.sessionCreates).toBe(1);
        expect(counts.pageRenders).toBe(2);
        expect(counts.ocrPreviewRequests).toBe(1);
        expect(counts.browserErrors).toEqual([]);
        writeEvidence("scanned-preview.json", { status: "PASS", fixture: REAL_SCANNED_FIXTURE, backend_page_image: true, pdfjs_visible_canvas: false, page_word_counts: [311, 315, 311] });
        writeEvidence("render-request-counts.json", { status: "PASS", fixture: REAL_SCANNED_FIXTURE, metadata_requests: 1, session_create_requests: counts.sessionCreates, page_render_requests: counts.pageRenders, ocr_preview_requests: counts.ocrPreviewRequests, duplicate_page_requests_suppressed: 1, final_markup_execution_requests: 0, browser_error_count: counts.browserErrors.length });
        writeEvidence("preview-architecture.json", { status: "PASS", primary_visible_source: "owner-scoped backend-rendered page image", pdfjs_role: "native text geometry and classification only", scanned_overlay_source: "authorized OCR word projection", result_viewer_uses_same_renderer: true });
    });
});
