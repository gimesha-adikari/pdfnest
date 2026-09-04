import { expect, test, type Page } from "@playwright/test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { authenticateProUser } from "../helpers/auth";

const scannedFixture = process.env.MARKUP_SCANNED_FIXTURE || "/home/gimesha/pdfnest-tests/compiled-images.pdf";
const actions = ["highlight", "underline", "strikeout"] as const;

async function physicalDrag(page: Page, start: number[], end: number[], layerId: string) {
    await page.mouse.move(start[0], start[1]);
    await page.mouse.down();
    await page.mouse.move(end[0], end[1], { steps: 20 });
    await page.mouse.up();
    const selection = await page.evaluate(({ layerId, start, end }) => {
        const current = window.getSelection();
        const root = document.querySelector(`[data-testid="${layerId}"]`);
        return {
            text: current?.toString() || "",
            anchor: current?.anchorNode?.textContent,
            focus: current?.focusNode?.textContent,
            inside: Boolean(current?.anchorNode && current.focusNode && root?.contains(current.anchorNode) && root.contains(current.focusNode)),
            rangeCount: current?.rangeCount || 0,
            rects: current?.rangeCount ? Array.from(current.getRangeAt(0).getClientRects()).map(rect => rect.toJSON()) : [],
            hits: [start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], end].map(([x, y]) => {
                const element = document.elementFromPoint(x, y);
                const style = element && getComputedStyle(element);
                return { x, y, tag: element?.tagName, testId: element?.getAttribute("data-testid"), pointerEvents: style?.pointerEvents, userSelect: style?.userSelect, zIndex: style?.zIndex };
            }),
        };
    }, { layerId, start, end });
    expect(selection.inside).toBe(true);
    expect(selection.rangeCount).toBe(1);
    expect(selection.rects.some(rect => rect.width > 0 && rect.height > 0)).toBe(true);
    return { ...selection, start, end };
}

async function dragScannedTitle(page: Page, endX = 208, reverse = false) {
    await expect(page.getByTestId("markup-pdf-ocr-layer")).toBeVisible();
    await page.getByTestId("markup-pdf-ocr-word").filter({ hasText: /^Free/ }).scrollIntoViewIfNeeded();
    const frame = await page.getByTestId("markup-pdf-page").boundingBox();
    if (!frame) throw new Error("Missing original page frame");
    const pdf = await PDFDocument.load(fs.readFileSync(scannedFixture));
    const { width, height } = pdf.getPage(0).getSize();
    // Visible title coordinates in the actual scanned fixture, independent of OCR span dimensions.
    const point = (x: number) => [frame.x + x / width * frame.width, frame.y + 54 / height * frame.height];
    const start = point(138.5), end = point(endX);
    // Deselect by clicking the blank page margin; dragging already-selected text starts native drag-and-drop.
    await page.mouse.click(frame.x + 5, frame.y + 5);
    return physicalDrag(page, reverse ? end : start, reverse ? start : end, "markup-pdf-ocr-layer");
}

for (const [index, action] of actions.entries()) {
    test(`${action}: actual pointer selection on the original scanned page`, async ({ page }, testInfo) => {
        await authenticateProUser(page);
        await page.setViewportSize({ width: [1280, 900, 390][index], height: 900 });
        await page.goto(`/${action}-pdf-v2`);
        const previewResponse = page.waitForResponse(response => response.url().includes("/api/v2/ocr/markup/preview") && response.request().method() === "POST");
        await page.locator('input[type="file"]').setInputFiles(scannedFixture);
        expect((await previewResponse).status()).toBe(200);
        await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(25);
        await expect(page.getByTestId("markup-v2-query")).toHaveValue("");
        await expect(page.getByTestId("markup-v2-find-query")).toHaveValue("");
        await page.screenshot({ path: testInfo.outputPath("before-drag.png"), fullPage: true });
        const single = await dragScannedTitle(page, 159.5);
        expect(single.text.replace(/\s+/g, " ").trim()).toBe("Free");
        const expected = action === "strikeout" ? "Free PDF Tools Online" : "Free PDF Tools";
        const selection = await dragScannedTitle(page, action === "strikeout" ? 239.3 : 208, action === "underline");
        expect(selection.text.replace(/\s+/g, " ").trim()).toBe(expected);
        await expect(page.getByTestId("markup-v2-query")).toHaveValue(expected);
        await expect(page.getByTestId("markup-v2-find-query")).toHaveValue("");
        await expect(page.getByTestId("markup-v2-submit")).toBeEnabled();
        await page.screenshot({ path: testInfo.outputPath("after-real-drag.png"), fullPage: true });
        await testInfo.attach("real-pointer-selection", { body: JSON.stringify(selection, null, 2), contentType: "application/json" });
        const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes(`/markup/${action}/jobs`));
        await page.getByTestId("markup-v2-submit").click();
        expect((await submitted).status()).toBe(202);
        await expect(page.getByTestId("markup-v2-job-status")).toContainText("Complete", { timeout: 120_000 });
        await expect(page.getByTestId("markup-result-pdf-backend-preview-image")).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("result.png"), fullPage: true });
        const download = page.waitForEvent("download");
        await page.getByTestId("markup-v2-download").click();
        const outputPath = testInfo.outputPath(`${action}.pdf`);
        await (await download).saveAs(outputPath);
        const result = await PDFDocument.load(fs.readFileSync(outputPath));
        const types = result.getPages().flatMap(page => {
            const annotations = page.node.Annots();
            return annotations ? Array.from({ length: annotations.size() }, (_, index) =>
                annotations.lookup(index, PDFDict).get(PDFName.of("Subtype"))?.toString()) : [];
        });
        expect(types).toEqual([`/${{ highlight: "Highlight", underline: "Underline", strikeout: "StrikeOut" }[action]}`]);
    });
}

test("real mixed PDF: native, scanned, native and cached scanned physical selection", async ({ page }, testInfo) => {
    await authenticateProUser(page);
    const native = await PDFDocument.load(fs.readFileSync(path.resolve("tests/fixtures/mixed_doc.pdf")));
    const scanned = await PDFDocument.load(fs.readFileSync(scannedFixture));
    const mixed = await PDFDocument.create();
    for (const [source, index] of [[native, 0], [scanned, 0], [native, 2]] as const) {
        mixed.addPage((await mixed.copyPages(source, [index]))[0]);
    }
    let previewRequests = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/v2/ocr/markup/preview")) previewRequests++; });
    await page.goto("/highlight-pdf-v2");
    await page.locator('input[type="file"]').setInputFiles({ name: "mixed-real.pdf", mimeType: "application/pdf", buffer: Buffer.from(await mixed.save()) });
    const selectNative = async (expected: string) => {
        const span = page.getByTestId("markup-pdf-text-layer").locator("span").filter({ hasText: expected });
        await expect(span).toBeVisible();
        await expect(page.getByTestId("markup-pdf-ocr-layer")).toHaveCount(0);
        await span.scrollIntoViewIfNeeded();
        const rect = await span.boundingBox();
        if (!rect) throw new Error("Missing native text geometry");
        const result = await physicalDrag(page, [rect.x - 1, rect.y + rect.height / 2], [rect.x + rect.width + 1, rect.y + rect.height / 2], "markup-pdf-text-layer");
        expect(result.text.trim()).toBe(expected);
    };
    await selectNative("Page 1: Digital Text Content");
    expect(previewRequests).toBe(0);
    await page.getByRole("button", { name: "Next PDF page", exact: true }).click();
    await expect(page.getByTestId("markup-pdf-ocr-word")).toHaveCount(25);
    expect((await dragScannedTitle(page)).text.replace(/\s+/g, " ").trim()).toBe("Free PDF Tools");
    expect(previewRequests).toBe(1);
    await page.getByRole("button", { name: "Next PDF page", exact: true }).click();
    await selectNative("Page 3: Another Digital Text Page");
    expect(previewRequests).toBe(1);
    await page.getByRole("button", { name: "Previous PDF page", exact: true }).click();
    expect((await dragScannedTitle(page)).text.replace(/\s+/g, " ").trim()).toBe("Free PDF Tools");
    expect(previewRequests).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("mixed-cached-scanned-selection.png"), fullPage: true });
    const frame = await page.getByTestId("markup-pdf-page").boundingBox();
    if (!frame) throw new Error("Missing mixed scanned page frame");
    const { width, height } = scanned.getPage(0).getSize();
    const point = (x: number, y: number) => [frame.x + x / width * frame.width, frame.y + y / height * frame.height];
    await page.mouse.click(frame.x + 5, frame.y + 5);
    const multiline = await physicalDrag(page, point(138.5, 54), point(101, 81.4), "markup-pdf-ocr-layer");
    expect(multiline.text.replace(/\s+/g, " ").trim()).toBe("Free PDF Tools Online & PDFNest Site Improvement Suggestior + a PDFNest");
    expect(Math.max(...multiline.rects.map(rect => rect.y)) - Math.min(...multiline.rects.map(rect => rect.y))).toBeGreaterThan(10);
    await testInfo.attach("multiline-pointer-selection", { body: JSON.stringify(multiline, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("mixed-multiline-selection.png"), fullPage: true });
});
