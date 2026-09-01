import { test, expect } from "@playwright/test";
import { PDFDocument, degrees } from "pdf-lib";
import fs from "fs";
import path from "path";

import { authenticateProUser } from "../helpers/auth";

type Action = "highlight" | "underline" | "strikeout";

const OUTPUT_DIR = path.resolve(process.cwd(), "../output/ocr-markup-v2-product-ux-remediation-02");
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const ACTIONS: Action[] = ["highlight", "underline", "strikeout"];
const ROUTES: Record<Action, string> = {
    highlight: "/highlight-pdf-v2/workspace",
    underline: "/underline-pdf-v2/workspace",
    strikeout: "/strikeout-pdf-v2/workspace",
};

function writeEvidence(name: string, value: unknown): void {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeImageOnlyPdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const image = await pdf.embedPng(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
    return Buffer.from(await pdf.save());
}

function previewPayload() {
    const words = [
        { id: "word-0", text: "Scanned", x: 48, y: 180, width: 96, height: 28, order: 0, confidence: 97 },
        { id: "word-1", text: "visual", x: 156, y: 180, width: 84, height: 28, order: 1, confidence: 96 },
        { id: "word-2", text: "selection", x: 252, y: 180, width: 118, height: 28, order: 2, confidence: 95 },
    ];
    return {
        schema_version: "ocr_v2_markup_preview.v1",
        profile: "MARKUP_V2",
        status: "SUCCEEDED",
        page_count: 1,
        pages: [{
            page_index: 0,
            page_number: 1,
            page_id: "page-0",
            width: 600,
            height: 800,
            rotation: 0,
            coordinate_space: "pdf_points_visible_cropbox_top_left",
            crop_box: [0, 0, 600, 800],
            classification: "IMAGE_SCAN",
            kind: "scanned",
            selection_mode: "ocr",
            status: "SUCCESS",
            has_selectable_text: true,
            word_count: words.length,
            reading_order: words.map((word) => word.id),
            words,
            language: { requested: ["eng"], detected: ["eng"], status: "DETECTED", mode: "EXPLICIT" },
        }],
    };
}

async function makeMixedPdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const nativePage = pdf.addPage([600, 800]);
    nativePage.drawText("Native page selection", { x: 60, y: 700, size: 28 });

    const scannedPage = pdf.addPage([600, 800]);
    scannedPage.setRotation(degrees(90));
    const image = await pdf.embedPng(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    scannedPage.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });

    const secondNativePage = pdf.addPage([600, 800]);
    secondNativePage.drawText("Second native page", { x: 60, y: 700, size: 28 });
    return Buffer.from(await pdf.save());
}

function mixedPreviewPayload() {
    const words = [
        { id: "rotated-word-0", text: "Rotated", x: 80, y: 180, width: 110, height: 30, order: 0, confidence: 97 },
        { id: "rotated-word-1", text: "OCR", x: 208, y: 180, width: 72, height: 30, order: 1, confidence: 96 },
        { id: "rotated-word-2", text: "selection", x: 306, y: 180, width: 132, height: 30, order: 2, confidence: 95 },
    ];
    const language = { requested: ["eng"], detected: ["eng"], status: "DETECTED", mode: "EXPLICIT" };
    const nativePage = (pageIndex: number, pageNumber: number, pageId: string) => ({
        page_index: pageIndex,
        page_number: pageNumber,
        page_id: pageId,
        width: 600,
        height: 800,
        rotation: 0,
        coordinate_space: "pdf_points_visible_cropbox_top_left",
        crop_box: [0, 0, 600, 800],
        classification: "TEXT_NATIVE",
        kind: "native",
        selection_mode: "native",
        status: "SUCCESS",
        has_selectable_text: true,
        word_count: 0,
        reading_order: [],
        words: [],
        language,
    });
    return {
        schema_version: "ocr_v2_markup_preview.v1",
        profile: "MARKUP_V2",
        status: "SUCCEEDED",
        page_count: 3,
        pages: [
            nativePage(0, 1, "native-page-0"),
            {
                page_index: 1,
                page_number: 2,
                page_id: "rotated-scanned-page-1",
                width: 800,
                height: 600,
                rotation: 90,
                coordinate_space: "pdf_points_visible_cropbox_top_left",
                crop_box: [0, 0, 600, 800],
                classification: "IMAGE_SCAN",
                kind: "scanned",
                selection_mode: "ocr",
                status: "SUCCESS",
                has_selectable_text: true,
                word_count: words.length,
                reading_order: words.map((word) => word.id),
                words,
                language,
            },
            nativePage(2, 3, "native-page-2"),
        ],
    };
}

async function assertOcrWordsStayInsidePage(page: import("@playwright/test").Page): Promise<void> {
    const frame = await page.getByTestId("markup-pdf-page").boundingBox();
    if (!frame) throw new Error("The PDF page frame did not have browser geometry.");
    const boxes = await page.getByTestId("markup-pdf-ocr-word").evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.left).toBeGreaterThanOrEqual(frame.x - 1);
        expect(box.top).toBeGreaterThanOrEqual(frame.y - 1);
        expect(box.right).toBeLessThanOrEqual(frame.x + frame.width + 1);
        expect(box.bottom).toBeLessThanOrEqual(frame.y + frame.height + 1);
    }
}

test.describe.serial("OCR-aware markup V2 scanned visual selection", () => {
    test("loads OCR-backed regions and synchronizes visual selections for every action", async ({ page }) => {
        await authenticateProUser(page);
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
        await page.route("**/api/v2/ocr/markup/preview", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previewPayload()) });
        });

        const pdf = await makeImageOnlyPdf();
        const results: Record<string, unknown>[] = [];
        for (const action of ACTIONS) {
            await page.goto(ROUTES[action]);
            await page.getByTestId("markup-v2-file-input").setInputFiles({ name: `scanned-${action}.pdf`, mimeType: "application/pdf", buffer: pdf });
            await expect(page.getByTestId("markup-pdf-page")).toBeVisible({ timeout: 30_000 });
            await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 30_000 });
            await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(3);
            await expect(page.getByTestId("markup-pdf-selection-guidance")).toContainText("Select text in the preview");

            const first = page.getByTestId("markup-pdf-ocr-word").nth(0);
            const last = page.getByTestId("markup-pdf-ocr-word").nth(2);
            const firstBox = await first.boundingBox();
            const lastBox = await last.boundingBox();
            if (!firstBox || !lastBox) throw new Error("OCR preview words did not have browser geometry.");
            await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2);
            await page.mouse.up();

            await expect(page.getByTestId("markup-v2-query")).toHaveValue("Scanned visual selection");
            await expect(page.getByTestId("markup-v2-selection-summary")).toContainText("Page 1");
            await expect(page.getByTestId("markup-v2-mode")).toHaveValue("ocr");
            await expect(page.getByTestId("markup-v2-submit")).toBeEnabled();
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${action}-scanned-selection-ready.png`), fullPage: true });
            results.push({ action, overlay_words: 3, selected_text: "Scanned visual selection", page: 1, mode: "ocr", submit_enabled: true });

            await page.getByTestId("markup-v2-reset").click();
            await expect(page.getByTestId("markup-v2-selected-file")).toHaveCount(0);
        }

        writeEvidence("scanned-overlay.json", { status: "PASS", results, preview_contract: "ocr_v2_markup_preview.v1", source: "mocked authorized preview projection" });
    });

    test("switches between native and OCR selection on a mixed rotated document", async ({ page }) => {
        await authenticateProUser(page);
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
        await page.route("**/api/v2/ocr/markup/preview", async (route) => {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mixedPreviewPayload()) });
        });

        await page.goto(ROUTES.highlight);
        await page.getByTestId("markup-v2-file-input").setInputFiles({ name: "mixed-rotated.pdf", mimeType: "application/pdf", buffer: await makeMixedPdf() });
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 1 of 3");
        await expect(page.getByTestId("markup-pdf-text-layer")).toHaveAttribute("aria-label", "Selectable PDF text");
        await expect(page.getByTestId("markup-pdf-ocr-layer")).toHaveCount(0);

        await page.getByRole("button", { name: "Next PDF page" }).click();
        await expect(page.getByTestId("markup-pdf-page-indicator")).toContainText("Page 2 of 3");
        await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(3);
        await assertOcrWordsStayInsidePage(page);

        const first = page.getByTestId("markup-pdf-ocr-word").nth(0);
        const last = page.getByTestId("markup-pdf-ocr-word").nth(2);
        const firstBox = await first.boundingBox();
        const lastBox = await last.boundingBox();
        if (!firstBox || !lastBox) throw new Error("The rotated OCR overlay did not expose selectable browser geometry.");
        await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2);
        await page.mouse.up();
        await expect(page.getByTestId("markup-v2-query")).toHaveValue("Rotated OCR selection");
        await expect(page.getByTestId("markup-v2-mode")).toHaveValue("ocr");

        const responsive: Record<string, unknown>[] = [];
        for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }]) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            await assertOcrWordsStayInsidePage(page);
            responsive.push({ ...viewport, no_horizontal_overflow: noHorizontalOverflow, overlay_aligned: true });
            expect(noHorizontalOverflow).toBe(true);
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mixed-rotated-ocr-selection-mobile.png"), fullPage: true });
        writeEvidence("mixed-selection.json", {
            status: "PASS",
            fixture: "synthetic mixed native/scanned PDF generated by this focused contract test",
            native_page: { page: 1, selection_layer: "PDF.js text layer", ocr_overlay: false },
            scanned_page: { page: 2, selection_layer: "authorized OCR word projection", ocr_overlay: true, selected_text: "Rotated OCR selection" },
            native_page_after: { page: 3, selection_layer: "PDF.js text layer" },
        });
        writeEvidence("rotation-cropbox.json", { status: "PASS", rotation: 90, crop_box: [0, 0, 600, 800], visible_overlay_frame: [800, 600], overlay_words_inside_frame: true, source: "mocked authorized preview contract plus PDF.js rotated page" });
        writeEvidence("responsive-validation.json", { status: "PASS", viewports: responsive, ocr_overlay_alignment: "percentage-scaled canonical coordinates remain within the preview frame" });
    });
});
