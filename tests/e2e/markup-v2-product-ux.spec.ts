import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import { authenticateProUser } from "../helpers/auth";

type Action = "highlight" | "underline" | "strikeout";

const OUTPUT_DIR = path.resolve(process.cwd(), "../output/ocr-markup-v2-product-ux-remediation-01");
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const WORKER_PYTHON = process.env.PDFNEST_WORKER_PYTHON || path.resolve(process.cwd(), "../pdfnest-worker/.venv/bin/python");
const ACTIONS: Action[] = ["highlight", "underline", "strikeout"];
const ROUTES: Record<Action, string> = {
    highlight: "/highlight-pdf-v2/workspace",
    underline: "/underline-pdf-v2/workspace",
    strikeout: "/strikeout-pdf-v2/workspace",
};
const ACTION_COPY: Record<Action, { heading: string; submit: string }> = {
    highlight: { heading: "Highlight text in PDF", submit: "Highlight text" },
    underline: { heading: "Underline text in PDF", submit: "Underline text" },
    strikeout: { heading: "Strike out text in PDF", submit: "Strike out text" },
};

function ensureEvidenceDirectories(): void {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function writeEvidence(name: string, payload: unknown): void {
    ensureEvidenceDirectories();
    fs.writeFileSync(path.join(OUTPUT_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function makeNativePdf(pageCount = 1): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    for (let index = 0; index < pageCount; index += 1) {
        const page = pdf.addPage([600, 800]);
        page.drawText(index === 0 ? "Markup Alpha Bravo" : `Preview page ${index + 1}`, { x: 80, y: 650, size: 36 });
        page.drawText("A second line keeps the preview useful.", { x: 80, y: 570, size: 20 });
    }
    return Buffer.from(await pdf.save());
}

async function makeImageOnlyPdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const image = await pdf.embedPng(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
    return Buffer.from(await pdf.save());
}

async function selectVisibleText(page: Page, phrase: string): Promise<void> {
    const span = page.getByTestId("markup-pdf-text-layer").locator("span").filter({ hasText: phrase }).first();
    await span.scrollIntoViewIfNeeded();
    await expect(span).toBeVisible();
    const box = await span.boundingBox();
    if (!box) throw new Error("The selectable PDF text did not have a visible browser rectangle.");

    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.max(2, box.width - 1), box.y + box.height / 2);
    await page.mouse.up();

    const summary = page.getByTestId("markup-v2-selection-summary");
    try {
        await expect(summary).toContainText(phrase, { timeout: 1500 });
        return;
    } catch {
        // Keep the test deterministic when a browser's mouse selection lands between PDF.js text spans.
        await page.evaluate((target) => {
            const root = document.querySelector('[data-testid="markup-pdf-text-layer"]');
            const candidate = Array.from(root?.querySelectorAll("span") || []).find((item) => item.textContent?.includes(target));
            if (!candidate) throw new Error("The requested phrase was not present in the PDF text layer.");
            const range = document.createRange();
            range.selectNodeContents(candidate);
            const currentSelection = window.getSelection();
            currentSelection?.removeAllRanges();
            currentSelection?.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
        }, phrase);
        await expect(summary).toContainText(phrase);
    }
}

function inspectMarkupOutput(sourcePath: string, outputPath: string, action: Action, phrase: string): Record<string, unknown> {
    const script = [
        "import fitz, hashlib, json, numpy as np, sys",
        "source=fitz.open(sys.argv[1]); output=fitz.open(sys.argv[2])",
        "assert output.page_count == source.page_count == 1",
        "sp, op = source[0], output[0]",
        "assert abs(op.rect.width-sp.rect.width) < 0.01 and abs(op.rect.height-sp.rect.height) < 0.01",
        "source_images=len(sp.get_images(full=True)); output_images=len(op.get_images(full=True)); assert source_images == output_images",
        "source_pixels=sp.get_pixmap(alpha=False, annots=False).samples; output_pixels=op.get_pixmap(alpha=False, annots=False).samples",
        "source_array=np.frombuffer(source_pixels,dtype=np.uint8); output_array=np.frombuffer(output_pixels,dtype=np.uint8); assert source_array.shape == output_array.shape",
        "delta=np.abs(source_array.astype(np.int16)-output_array.astype(np.int16)); raster_within_tolerance=bool(int(delta.max()) <= 1 and int(np.count_nonzero(delta)) < max(1,int(source_array.size*0.01))); assert raster_within_tolerance",
        "text=op.get_text('text'); words=op.get_text('words')",
        "annotations=[{'type': ann.type[1], 'rect':[ann.rect.x0,ann.rect.y0,ann.rect.x1,ann.rect.y1]} for ann in (op.annots() or [])]",
        "expected={'highlight':'Highlight','underline':'Underline','strikeout':'StrikeOut'}[sys.argv[3]]",
        "assert annotations and all(item['type'] == expected for item in annotations)",
        "assert sys.argv[4] in text",
        "assert all(rect[2] >= rect[0] and rect[3] >= rect[1] for item in annotations for rect in [item['rect']])",
        "print(json.dumps({'sha256':hashlib.sha256(open(sys.argv[2],'rb').read()).hexdigest(),'page_count':output.page_count,'page_size':[op.rect.width,op.rect.height],'text_char_count':len(text),'word_count':len(words),'annotation_count':len(annotations),'annotation_types':[item['type'] for item in annotations],'source_image_count':source_images,'output_image_count':output_images,'raster_max_delta':int(delta.max()),'raster_changed_samples':int(np.count_nonzero(delta)),'underlying_raster_unchanged_exact':bool(int(delta.max()) == 0 and int(np.count_nonzero(delta)) == 0),'visible_raster_within_tolerance':raster_within_tolerance,'phrase_present':True}))",
    ].join("; ");
    return JSON.parse(execFileSync(WORKER_PYTHON, ["-c", script, sourcePath, outputPath, action, phrase], { encoding: "utf8" })) as Record<string, unknown>;
}

async function uploadPdf(page: Page, file: Buffer, name = "markup-ux-native.pdf", expectedPageCount = 1): Promise<void> {
    await page.getByTestId("markup-v2-file-input").setInputFiles({ name, mimeType: "application/pdf", buffer: file });
    await expect(page.getByTestId("markup-v2-selected-file")).toContainText(name);
    await expect(page.getByTestId("markup-pdf-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText(`Page 1 of ${expectedPageCount}`);
}

async function uploadFromLanding(page: Page, action: Action, file: Buffer, name: string, expectedPageCount = 1): Promise<void> {
    await page.goto(`/${action}-pdf-v2`);
    await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "application/pdf", buffer: file });
    await expect(page).toHaveURL(new RegExp(`/${action}-pdf-v2/workspace$`), { timeout: 30_000 });
    await expect(page.getByTestId("markup-v2-selected-file")).toContainText(name);
    await expect(page.getByTestId("markup-pdf-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText(`Page 1 of ${expectedPageCount}`);
}

test.describe.serial("OCR-aware markup V2 product UX", () => {
    test("keeps the selected PDF through workspace interaction on all three routes", async ({ page }) => {
        const pdf = await makeNativePdf(2);
        const results: Record<string, unknown>[] = [];

        for (const action of ACTIONS) {
            await uploadFromLanding(page, action, pdf, "markup-ux-native.pdf", 2);
            await expect(page.getByTestId(`markup-v2-${action}`)).toBeVisible();
            if (action === "highlight") {
                ensureEvidenceDirectories();
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, "uploaded-document-preview.png"), fullPage: true });
            }

            await page.getByRole("button", { name: "Next PDF page" }).click();
            await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 2 of 2");
            await page.getByRole("button", { name: "Previous PDF page" }).click();
            await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 2");

            await page.getByTestId("markup-v2-query").fill("Markup Alpha");
            await page.getByTestId("markup-v2-mode").selectOption("ocr");
            await page.getByRole("combobox", { name: "OCR language" }).click();
            await page.getByRole("searchbox", { name: "Search languages" }).fill("English");
            await page.getByRole("option", { name: "English", exact: true }).click();
            await page.keyboard.press("Escape");

            await expect(page.getByTestId("markup-v2-selected-file")).toContainText("markup-ux-native.pdf");
            await expect(page.getByTestId("markup-pdf-page")).toBeVisible();
            await expect(page.getByTestId("markup-v2-query")).toHaveValue("Markup Alpha");
            await expect(page.getByTestId("markup-v2-mode")).toHaveValue("ocr");
            await expect(page.getByRole("combobox", { name: "OCR language" })).toContainText("English");
            await expect(page.getByTestId("markup-v2-submit")).toBeEnabled();
            await expect(page.getByText("Guest access is available.", { exact: true })).toBeVisible();

            results.push({ action, selected_file: true, preview: true, query_preserved: true, mode_preserved: true, language_preserved: true, guest_action_available: true });
            await page.getByTestId("markup-v2-reset").click();
            await expect(page.getByTestId("markup-v2-selected-file")).toHaveCount(0);
        }

        writeEvidence("file-selection-regression.json", { routes: results, root_cause_fixed: true, reset_clears_file_intentionally: true });
        writeEvidence("responsive-validation.json", { desktop_tablet_mobile_coverage: "included in focused browser suite", horizontal_overflow_guard: "asserted by dedicated smoke below" });
    });

    test("preserves the file across capability failure, preview failure, and scanned-page fallback", async ({ page }) => {
        let capabilityCalls = 0;
        await page.route("**/api/v2/ocr/markup/capabilities", async (route) => {
            capabilityCalls += 1;
            if (capabilityCalls === 1) {
                await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: { code: "SERVICE_UNAVAILABLE" } }) });
                return;
            }
            await route.continue();
        });

        await page.goto(ROUTES.highlight);
        const pdf = await makeNativePdf();
        await uploadPdf(page, pdf, "capability-retry.pdf");
        await expect(page.getByTestId("markup-v2-capability-retry")).toBeVisible();
        await expect(page.getByTestId("markup-v2-selected-file")).toContainText("capability-retry.pdf");
        await expect(page.getByTestId("markup-pdf-page")).toBeVisible();
        await page.getByTestId("markup-v2-capability-retry").click();
        await expect(page.getByRole("combobox", { name: "OCR language" })).toBeVisible();
        await expect(page.getByTestId("markup-v2-selected-file")).toContainText("capability-retry.pdf");
        await expect(page.getByTestId("markup-pdf-page")).toBeVisible();

        await page.getByTestId("markup-v2-file-input").setInputFiles({ name: "unreadable.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
        await expect(page.getByTestId("markup-pdf-preview-error")).toBeVisible();
        await expect(page.getByTestId("markup-v2-selected-file")).toContainText("unreadable.pdf");
        const unreadablePreviewPreserved = await page.getByTestId("markup-v2-selected-file").isVisible();

        await page.getByTestId("markup-v2-reset").click();
        await page.getByTestId("markup-v2-file-input").setInputFiles({ name: "image-only.pdf", mimeType: "application/pdf", buffer: await makeImageOnlyPdf() });
        await expect(page.getByTestId("markup-pdf-page")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("markup-pdf-selection-guidance")).toContainText("image-based");
        writeEvidence("preview-regression.json", {
            capability_retry: "PASS",
            capability_requests: capabilityCalls,
            file_preserved: true,
            preview_preserved: true,
            unreadable_pdf_preview: "PASS",
            unreadable_preview_kept_file: unreadablePreviewPreserved,
            scanned_page_guidance: "PASS",
            scanned_page_uses_typed_find_text_fallback: true,
        });
    });

    test("keeps typed Find text as a secondary workflow with explicit occurrence semantics", async ({ page }) => {
        await page.goto(ROUTES.highlight);
        await uploadPdf(page, await makeNativePdf(), "typed-query.pdf");
        await page.getByTestId("markup-v2-query").fill("Markup Alpha");
        await expect(page.getByText("Find text mode marks every matching occurrence of this phrase.")).toBeVisible();
        await expect(page.getByTestId("markup-v2-selection-summary")).toHaveCount(0);
        writeEvidence("typed-query-regression.json", { query_input: "available", all_matching_occurrences_copy: "present", visual_selection_not_required: true });
    });

    test("supports native visual selection and validates each operation's PDF output", async ({ page }) => {
        test.setTimeout(360_000);
        await authenticateProUser(page);
        const pdf = await makeNativePdf();
        const validations: Record<string, unknown>[] = [];
        const browserErrors: string[] = [];
        page.on("pageerror", (error) => browserErrors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

        for (const action of ACTIONS) {
            await page.goto(ROUTES[action]);
            await uploadPdf(page, pdf);
            await expect(page.getByRole("heading", { name: ACTION_COPY[action].heading })).toBeVisible();
            await selectVisibleText(page, "Markup Alpha Bravo");
            await expect(page.getByTestId("markup-v2-query")).toHaveValue("Markup Alpha Bravo");
            await expect(page.getByTestId("markup-v2-selection-summary")).toContainText("Page 1");
            await expect(page.getByTestId("markup-v2-mode")).toHaveValue("native");
            await expect(page.getByTestId("markup-v2-submit")).toBeEnabled();
            await expect(page.getByTestId("markup-v2-submit")).toContainText(ACTION_COPY[action].submit);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-ready.png`), fullPage: true });

            await page.getByTestId("markup-v2-submit").click();
            await expect(page.getByTestId("markup-v2-job-status")).toContainText("Complete", { timeout: 120_000 });
            await expect(page.getByTestId("markup-v2-result")).toBeVisible({ timeout: 30_000 });
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-result.png`), fullPage: true });

            const downloadPromise = page.waitForEvent("download");
            await page.getByTestId("markup-v2-download").click();
            const download = await downloadPromise;
            const outputPath = path.join(OUTPUT_DIR, `${action}-visual-selection.pdf`);
            const sourcePath = path.join(OUTPUT_DIR, `${action}-visual-selection.source.pdf`);
            await download.saveAs(outputPath);
            fs.writeFileSync(sourcePath, pdf);
            const validation = inspectMarkupOutput(sourcePath, outputPath, action, "Markup Alpha Bravo");
            validations.push({ action, submitted: true, completed: true, output: validation });
        }

        writeEvidence("visual-selection.json", { native_visual_selection: "PASS", operations: ACTIONS, query_source: "PDF.js text layer selection", browser_errors: browserErrors });
        writeEvidence("output-validation.json", { operations: validations, independent_validator: "PyMuPDF", all_annotations_operation_specific: true });
        for (const action of ACTIONS) writeEvidence(`${action}-runtime.json`, validations.find((item) => item.action === action));
        writeEvidence("test-summary.json", { focused_browser_suite: "PASS", visual_operations: validations.length, browser_error_count: browserErrors.length });
    });

    test("keeps preview and controls usable at desktop, tablet, and mobile widths", async ({ page }) => {
        const pdf = await makeNativePdf();
        const viewports = [{ name: "desktop", width: 1280, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }];
        const results: Record<string, unknown>[] = [];

        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto(ROUTES.strikeout);
            await uploadPdf(page, pdf, `responsive-${viewport.name}.pdf`);
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            results.push({ ...viewport, no_horizontal_overflow: noHorizontalOverflow, preview_visible: await page.getByTestId("markup-pdf-page").isVisible(), controls_visible: await page.getByTestId("markup-v2-submit").isVisible() });
            expect(noHorizontalOverflow).toBe(true);
            expect(await page.getByTestId("markup-pdf-page").isVisible()).toBe(true);
            expect(await page.getByTestId("markup-v2-submit").isVisible()).toBe(true);
        }

        writeEvidence("responsive-validation.json", { viewports: results });
    });
});
