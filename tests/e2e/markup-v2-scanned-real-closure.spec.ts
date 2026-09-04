import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

import { authenticateProUser } from "../helpers/auth";

type Action = "highlight" | "underline" | "strikeout";

const OUTPUT_DIR = path.resolve(process.cwd(), "../output/ocr-markup-v2-product-ux-remediation-02");
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const FIXTURE = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";
const EXPECTED_FIXTURE_SHA256 = "120f36b0ae84432beb9a4ae1df987afc4b7d80c4f85586c6eb8730ced8c151af";
const IMAGE_ONLY_FIXTURE = "/home/gimesha/pdfnest-tests/compiled-images.pdf";
const IMAGE_ONLY_OUTPUT_DIR = path.resolve(process.cwd(), "../output/ocr-markup-v2-image-only-real-03");
const EXPECTED_IMAGE_ONLY_SHA256 = "592471117cea3ac05eb888b7ff7281569c39e7c2867708b2466f77e060c1a0a6";
const ACTIONS: Action[] = ["highlight", "underline", "strikeout"];
const ROUTES: Record<Action, string> = {
    highlight: "/highlight-pdf-v2",
    underline: "/underline-pdf-v2",
    strikeout: "/strikeout-pdf-v2",
};

function writeEvidence(name: string, value: unknown, outputDir = OUTPUT_DIR): void {
    fs.mkdirSync(path.join(outputDir, "screenshots"), { recursive: true });
    fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixtureSha256(sourcePath = FIXTURE): string {
    return execFileSync("sha256sum", [sourcePath], { encoding: "utf8" }).trim().split(/\s+/)[0];
}

function inspectMarkupOutput(outputPath: string, action: Action, expectedPhrase: string, sourcePath = FIXTURE, requirePhrase = true): Record<string, unknown> {
    const script = [
        "import fitz, hashlib, json, numpy as np, sys",
        "source=fitz.open(sys.argv[1]); output=fitz.open(sys.argv[2])",
        "assert output.page_count == source.page_count == 3",
        "expected={'highlight':'Highlight','underline':'Underline','strikeout':'StrikeOut'}[sys.argv[3]]",
        "page_metrics=[]; all_valid_bboxes=True; all_rasters_within_tolerance=True; annotation_types=[]; reading_order_preserved=True; has_sinhala=False",
        "for index in range(source.page_count):",
        "    sp, op = source[index], output[index]",
        "    assert abs(op.rect.width-sp.rect.width) < 0.01 and abs(op.rect.height-sp.rect.height) < 0.01",
        "    source_words=sp.get_text('words'); output_words=op.get_text('words')",
        "    source_order=[str(row[4]) for row in source_words]; output_order=[str(row[4]) for row in output_words]",
        "    if source_order != output_order: reading_order_preserved=False",
        "    all_valid_bboxes = all_valid_bboxes and all(float(row[2]) >= float(row[0]) and float(row[3]) >= float(row[1]) for row in output_words)",
        "    annotations=[{'type': ann.type[1], 'rect':[ann.rect.x0,ann.rect.y0,ann.rect.x1,ann.rect.y1]} for ann in (op.annots() or [])]",
        "    annotation_types.extend(item['type'] for item in annotations)",
        "    source_pixels=sp.get_pixmap(alpha=False, annots=False).samples; output_pixels=op.get_pixmap(alpha=False, annots=False).samples",
        "    source_array=np.frombuffer(source_pixels,dtype=np.uint8); output_array=np.frombuffer(output_pixels,dtype=np.uint8); assert source_array.shape == output_array.shape",
        "    delta=np.abs(source_array.astype(np.int16)-output_array.astype(np.int16)); within=bool(int(delta.max()) <= 1 and int(np.count_nonzero(delta)) < max(1,int(source_array.size*0.01))); all_rasters_within_tolerance = all_rasters_within_tolerance and within",
        "    text=op.get_text('text'); has_sinhala = has_sinhala or any('\\u0d80' <= char <= '\\u0dff' for char in text)",
        "    page_metrics.append({'page':index+1,'word_count':len(output_words),'annotation_count':len(annotations),'source_image_count':len(sp.get_images(full=True)),'output_image_count':len(op.get_images(full=True)),'raster_max_delta':int(delta.max()),'raster_changed_samples':int(np.count_nonzero(delta)),'page_size':[op.rect.width,op.rect.height]})",
        "assert annotation_types and all(item == expected for item in annotation_types)",
        "all_text='\\n'.join(page.get_text('text') for page in output)",
        "phrase_present=sys.argv[4].casefold() in all_text.casefold()",
        "if sys.argv[5] == '1': assert phrase_present",
        "print(json.dumps({'sha256':hashlib.sha256(open(sys.argv[2],'rb').read()).hexdigest(),'page_count':output.page_count,'page_metrics':page_metrics,'annotation_types':annotation_types,'valid_word_bboxes':all_valid_bboxes,'reading_order_preserved':reading_order_preserved,'visible_raster_within_tolerance':all_rasters_within_tolerance,'has_sinhala_unicode':has_sinhala,'phrase_present':phrase_present,'word_count':sum(item['word_count'] for item in page_metrics)}))",
    ].join("\n");
    return JSON.parse(execFileSync(process.env.PDFNEST_WORKER_PYTHON || path.resolve(process.cwd(), "../pdfnest-worker/.venv/bin/python"), ["-c", script, sourcePath, outputPath, action, expectedPhrase, requirePhrase ? "1" : "0"], { encoding: "utf8" })) as Record<string, unknown>;
}

async function selectScannedHeading(page: import("@playwright/test").Page): Promise<string> {
    const words = page.getByTestId("markup-pdf-ocr-word");
    await expect(words).toHaveCount(311, { timeout: 120_000 });
    const texts = await words.evaluateAll((items) => items.map((item) => (item.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()));
    const start = texts.findIndex((text) => text.trim().toUpperCase() === "FACULTY");
    if (start < 0) throw new Error("The approved scanned fixture did not expose the expected OCR heading.");
    const expected = ["FACULTY", "OF", "ENGINEERING", "TECHNOLOGY"];
    const selected = texts.slice(start, start + expected.length).map((text) => text.trim());
    if (selected.join(" ").toUpperCase() !== expected.join(" ")) {
        throw new Error(`Unexpected OCR heading sequence: ${selected.join(" ")}`);
    }

    const first = await words.nth(start).boundingBox();
    const last = await words.nth(start + expected.length - 1).boundingBox();
    if (!first || !last) throw new Error("The scanned OCR words did not have browser geometry.");
    await page.mouse.move(first.x + 1, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width + 1, last.y + last.height / 2, { steps: 12 });
    await page.mouse.up();
    const phrase = selected.join(" ");
    const browserSelection = await page.evaluate(() => {
        const current = window.getSelection();
        const layer = document.querySelector('[data-testid="markup-pdf-ocr-layer"]');
        return { text: (current?.toString() || "").replace(/\s+/g, " ").trim(), rangeCount: current?.rangeCount || 0, anchorWithinLayer: Boolean(current?.anchorNode && layer?.contains(current.anchorNode)) };
    });
    expect(browserSelection.text).toBe(phrase);
    expect(browserSelection.rangeCount).toBeGreaterThan(0);
    expect(browserSelection.anchorWithinLayer).toBe(true);
    await expect(page.getByTestId("markup-v2-find-query")).toHaveValue("");
    await expect(page.getByTestId("markup-v2-query")).toHaveValue(phrase);
    await expect(page.getByTestId("markup-v2-selection-summary")).toContainText("Page 1");
    return phrase;
}

async function waitForImageOnlyOcr(page: import("@playwright/test").Page): Promise<void> {
    await expect.poll(async () => page.evaluate(() => {
        const layer = document.querySelector('[data-testid="markup-pdf-ocr-layer"]');
        if (layer?.querySelectorAll("[data-word-id]").length) return "ready";
        const guidance = document.querySelector('[data-testid="markup-pdf-selection-guidance"]')?.textContent || "";
        return guidance.includes("Choose a language manually") ? "language" : "pending";
    }), { timeout: 120_000 }).toMatch(/ready|language/);

    const state = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="markup-pdf-ocr-layer"]');
        if (layer?.querySelectorAll("[data-word-id]").length) return "ready";
        const guidance = document.querySelector('[data-testid="markup-pdf-selection-guidance"]')?.textContent || "";
        return guidance.includes("Choose a language manually") ? "language" : "pending";
    });
    if (state === "language") {
        await page.getByRole("combobox", { name: "OCR language" }).click();
        await page.getByRole("searchbox", { name: "Search languages" }).fill("English");
        await page.getByRole("option", { name: "English", exact: true }).click();
        await page.keyboard.press("Escape");
    }
    await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(25, { timeout: 120_000 });
}

async function selectImageOnlyWords(page: import("@playwright/test").Page): Promise<string> {
    const words = page.getByTestId("markup-pdf-ocr-word");
    const texts = await words.evaluateAll((items) => items.map((item) => (item.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()));
    const expected = ["Free", "PDF", "Tools"];
    const start = texts.findIndex((text, index) => texts.slice(index, index + expected.length).join(" ") === expected.join(" "));
    if (start < 0) throw new Error(`The image-only fixture did not expose the expected OCR sequence: ${texts.join(" ")}`);
    const first = await words.nth(start).boundingBox();
    const last = await words.nth(start + expected.length - 1).boundingBox();
    if (!first || !last) throw new Error("The image-only OCR words did not have browser geometry.");
    await page.mouse.move(first.x + 1, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width + 1, last.y + last.height / 2, { steps: 8 });
    await page.mouse.up();
    const browserSelection = await page.evaluate(() => {
        const current = window.getSelection();
        const layer = document.querySelector('[data-testid="markup-pdf-ocr-layer"]');
        return { text: (current?.toString() || "").replace(/\s+/g, " ").trim(), rangeCount: current?.rangeCount || 0, anchorWithinLayer: Boolean(current?.anchorNode && layer?.contains(current.anchorNode)) };
    });
    const phrase = expected.join(" ");
    expect(browserSelection.text).toBe(phrase);
    expect(browserSelection.rangeCount).toBeGreaterThan(0);
    expect(browserSelection.anchorWithinLayer).toBe(true);
    await expect(page.getByTestId("markup-v2-find-query")).toHaveValue("");
    await expect(page.getByTestId("markup-v2-query")).toHaveValue(phrase);
    await expect(page.getByTestId("markup-v2-selection-summary")).toContainText("Page 1");
    return phrase;
}

async function verifyRotatedPageOverlay(page: import("@playwright/test").Page): Promise<Record<string, unknown>> {
    await expect(page.getByRole("button", { name: "Next PDF page" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Next PDF page" }).click();
    await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 2 of 3");
    await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(315, { timeout: 30_000 });
    const frame = await page.getByTestId("markup-pdf-page").boundingBox();
    if (!frame) throw new Error("The rotated PDF page did not have browser geometry.");
    const boxes = await page.getByTestId("markup-pdf-ocr-word").evaluateAll((items) => items.slice(0, 12).map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    const aligned = boxes.length > 0 && boxes.every((box) => box.width > 0 && box.height > 0 && box.left >= frame.x - 1 && box.top >= frame.y - 1 && box.right <= frame.x + frame.width + 1 && box.bottom <= frame.y + frame.height + 1);
    expect(aligned).toBe(true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "scanned-rotated-page-ocr-overlay.png"), fullPage: true });
    await page.getByRole("button", { name: "Previous PDF page" }).click();
    await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
    await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(311, { timeout: 30_000 });
    return { page: 2, rotation: 90, word_count: 315, overlay_words_inside_frame: aligned, frame: { width: frame.width, height: frame.height } };
}

test.describe.serial("OCR-aware markup V2 real scanned closure", () => {
    test("visually selects and durably marks a real scanned fixture for all operations", async ({ page }) => {
        test.setTimeout(540_000);
        const hash = fixtureSha256();
        expect(hash).toBe(EXPECTED_FIXTURE_SHA256);
        await authenticateProUser(page);

        const results: Record<string, unknown>[] = [];
        const status = { reads: 0, status_429: 0, status_5xx: 0 };
        let rotatedOverlay: Record<string, unknown> | null = null;
        const browserErrors: string[] = [];

        const trackPage = (candidate: import("@playwright/test").Page) => {
            candidate.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
            candidate.on("pageerror", (error) => browserErrors.push(error.message));
            candidate.on("response", (response) => {
                if (response.request().method() !== "GET" || !response.url().includes("/api/v2/ocr/markup/jobs/")) return;
                status.reads += 1;
                if (response.status() === 429) status.status_429 += 1;
                if (response.status() >= 500) status.status_5xx += 1;
            });
        };

        for (const action of ACTIONS) {
            const actionPage = action === ACTIONS[0] ? page : await page.context().newPage();
            trackPage(actionPage);
            try {
                await actionPage.goto(ROUTES[action]);
                await actionPage.locator('input[type="file"]').setInputFiles(FIXTURE);
                await expect(actionPage.getByTestId("markup-v2-selected-file")).toContainText("ocr-extracted-text-29-rotated (1).pdf");
                await expect(actionPage.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
                await expect(actionPage.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 120_000 });
                if (action === "highlight") await actionPage.screenshot({ path: path.join(SCREENSHOT_DIR, "scanned-document-ocr-selection.png"), fullPage: true });
                if (action === "highlight") rotatedOverlay = await verifyRotatedPageOverlay(actionPage);

                const phrase = await selectScannedHeading(actionPage);
                await expect(actionPage.getByTestId("markup-v2-mode")).toHaveValue("ocr");
                await expect(actionPage.getByTestId("markup-v2-submit")).toBeEnabled();
                await actionPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-scanned-ready.png`), fullPage: true });

                const submitResponsePromise = actionPage.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/v2/ocr/markup/${action}/jobs`));
                await actionPage.getByTestId("markup-v2-submit").click();
                const submitResponse = await submitResponsePromise;
                expect(submitResponse.status()).toBe(202);
                const created = await submitResponse.json() as { job_id?: string };
                expect(created.job_id).toBeTruthy();
                await expect(actionPage.getByTestId("markup-v2-job-status")).toContainText("Complete", { timeout: 240_000 });
                await expect(actionPage.getByTestId("markup-v2-result")).toBeVisible({ timeout: 30_000 });
                await expect(actionPage.getByTestId("markup-v2-result-preview")).toBeVisible({ timeout: 30_000 });
                await expect(actionPage.getByTestId("markup-result-pdf-backend-preview-image")).toBeVisible({ timeout: 120_000 });
                await expect(actionPage.getByTestId("markup-result-pdf-page").locator("canvas")).toHaveCount(0);
                await actionPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-scanned-result.png`), fullPage: true });

                const downloadPromise = actionPage.waitForEvent("download");
                await actionPage.getByTestId("markup-v2-download").click();
                const download = await downloadPromise;
                const outputPath = path.join(OUTPUT_DIR, `${action}-scanned-real.pdf`);
                await download.saveAs(outputPath);
                const validation = inspectMarkupOutput(outputPath, action, phrase);
                results.push({ action, job_id: created.job_id, source_sha256: hash, page_count: 3, selected_phrase: phrase, browser_selection: { range: true, anchor_within_ocr_layer: true, find_query: "" }, result_preview: { backend_rendered: true, client_canvas_count: 0 }, output: validation });
            } finally {
                if (actionPage !== page) await actionPage.close();
            }
        }

        writeEvidence("highlight-scanned.json", results.find((item) => item.action === "highlight"));
        writeEvidence("underline-scanned.json", results.find((item) => item.action === "underline"));
        writeEvidence("strikeout-scanned.json", results.find((item) => item.action === "strikeout"));
        writeEvidence("final-summary.json", { status: "PASS", fixture: FIXTURE, fixture_sha256: hash, operations: results.map((item) => item.action), rotated_overlay: rotatedOverlay, status_reads: status.reads, status_429: status.status_429, status_5xx: status.status_5xx, browser_error_count: browserErrors.length, browser_errors: browserErrors });
        expect(status.status_429).toBe(0);
        expect(status.status_5xx).toBe(0);
        expect(browserErrors).toEqual([]);
    });

    test("visually selects and durably marks a real image-only fixture for all operations", async ({ page }) => {
        test.setTimeout(540_000);
        const hash = fixtureSha256(IMAGE_ONLY_FIXTURE);
        expect(hash).toBe(EXPECTED_IMAGE_ONLY_SHA256);
        await authenticateProUser(page);

        const results: Record<string, unknown>[] = [];
        const status = { reads: 0, status_429: 0, status_5xx: 0 };
        const browserErrors: string[] = [];
        const trackPage = (candidate: import("@playwright/test").Page) => {
            candidate.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
            candidate.on("pageerror", (error) => browserErrors.push(error.message));
            candidate.on("response", (response) => {
                if (response.request().method() !== "GET" || !response.url().includes("/api/v2/ocr/markup/jobs/")) return;
                status.reads += 1;
                if (response.status() === 429) status.status_429 += 1;
                if (response.status() >= 500) status.status_5xx += 1;
            });
        };

        for (const action of ACTIONS) {
            const actionPage = action === ACTIONS[0] ? page : await page.context().newPage();
            trackPage(actionPage);
            try {
                await actionPage.goto(ROUTES[action]);
                await actionPage.locator('input[type="file"]').setInputFiles(IMAGE_ONLY_FIXTURE);
                await expect(actionPage.getByTestId("markup-v2-selected-file")).toContainText("compiled-images.pdf");
                await expect(actionPage.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
                await waitForImageOnlyOcr(actionPage);
                const phrase = await selectImageOnlyWords(actionPage);
                await expect(actionPage.getByTestId("markup-v2-mode")).toHaveValue("ocr");
                await expect(actionPage.getByTestId("markup-v2-submit")).toBeEnabled();

                const submitResponsePromise = actionPage.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/v2/ocr/markup/${action}/jobs`));
                await actionPage.getByTestId("markup-v2-submit").click();
                const submitResponse = await submitResponsePromise;
                expect(submitResponse.status()).toBe(202);
                const created = await submitResponse.json() as { job_id?: string };
                expect(created.job_id).toBeTruthy();
                await expect(actionPage.getByTestId("markup-v2-job-status")).toContainText("Complete", { timeout: 240_000 });
                await expect(actionPage.getByTestId("markup-v2-result")).toBeVisible({ timeout: 30_000 });
                await expect(actionPage.getByTestId("markup-result-pdf-backend-preview-image")).toBeVisible({ timeout: 120_000 });
                await expect(actionPage.getByTestId("markup-result-pdf-page").locator("canvas")).toHaveCount(0);

                const downloadPromise = actionPage.waitForEvent("download");
                await actionPage.getByTestId("markup-v2-download").click();
                const download = await downloadPromise;
                const outputPath = path.join(IMAGE_ONLY_OUTPUT_DIR, `${action}-compiled-images.pdf`);
                await download.saveAs(outputPath);
                const validation = inspectMarkupOutput(outputPath, action, phrase, IMAGE_ONLY_FIXTURE, false);
                results.push({ action, job_id: created.job_id, source_sha256: hash, page_count: 3, selected_phrase: phrase, browser_selection: { range: true, anchor_within_ocr_layer: true, find_query: "" }, output: validation });
            } finally {
                if (actionPage !== page) await actionPage.close();
            }
        }

        writeEvidence("final-summary.json", { status: "PASS", fixture: IMAGE_ONLY_FIXTURE, fixture_sha256: hash, operations: results.map((item) => item.action), results, status_reads: status.reads, status_429: status.status_429, status_5xx: status.status_5xx, browser_error_count: browserErrors.length, browser_errors: browserErrors }, IMAGE_ONLY_OUTPUT_DIR);
        expect(status.status_429).toBe(0);
        expect(status.status_5xx).toBe(0);
        expect(browserErrors).toEqual([]);
    });
});
