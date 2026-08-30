import {test, expect, type Page} from "@playwright/test";
import {PDFDocument} from "pdf-lib";
import {execFileSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import {PdfToolHelper} from "../helpers/pdf-tool";

const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/phase9-remaining-consumers-local/e2e");
const PYTHON = process.env.E2E_PYTHON || "python3";

function rasterTextPng(text: string): Buffer {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase9-scan-"));
    const imagePath = path.join(directory, "scan.png");
    try {
        execFileSync(PYTHON, ["-c", [
            "from PIL import Image, ImageDraw, ImageFont",
            "import sys",
            "im=Image.new('RGB', (1600, 500), 'white')",
            "d=ImageDraw.Draw(im)",
            "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 64)",
            "d.text((80, 190), sys.argv[2], font=font, fill='black')",
            "im.save(sys.argv[1])",
        ].join(";"), imagePath, text]);
        return fs.readFileSync(imagePath);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
}

async function scannedPdf(text: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([800, 250]);
    const image = await pdf.embedPng(rasterTextPng(text));
    page.drawImage(image, {x: 0, y: 0, width: 800, height: 250});
    return Buffer.from(await pdf.save());
}

async function nativePdf(text: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([800, 250]);
    page.drawText(text, {x: 72, y: 160, size: 30});
    return Buffer.from(await pdf.save());
}

async function mixedPdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const nativePage = pdf.addPage([800, 250]);
    nativePage.drawText("Native page first", {x: 72, y: 160, size: 30});
    const scannedPage = pdf.addPage([800, 250]);
    const image = await pdf.embedPng(rasterTextPng("Scanned page second"));
    scannedPage.drawImage(image, {x: 0, y: 0, width: 800, height: 250});
    return Buffer.from(await pdf.save());
}

function inspectDocx(filePath: string): Record<string, unknown> {
    const script = [
        "import json, sys, zipfile, xml.etree.ElementTree as ET",
        "from pathlib import Path",
        "p=Path(sys.argv[1])",
        "z=zipfile.ZipFile(p); names=set(z.namelist()); xml=z.read('word/document.xml'); z.close(); root=ET.fromstring(xml)",
        " ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}",
        " texts=[''.join(t.itertext()) for t in root.findall('.//w:p', ns)]",
        " print(json.dumps({'zip': True, 'document_xml': 'word/document.xml' in names, 'paragraphs': len(texts), 'tables': len(root.findall('.//w:tbl', ns)), 'text_chars': len(' '.join(texts)), 'has_raw_ocr_metadata': any('tesseract' in n.lower() or 'ocr_v2' in n.lower() for n in names)}))",
    ].join("; ");
    return JSON.parse(execFileSync(PYTHON, ["-c", script, filePath], {encoding: "utf8"}));
}

async function convertWord(page: Page, pdf: Buffer, name: string): Promise<Record<string, unknown>> {
    const helper = new PdfToolHelper(page, "pdf-to-word");
    await helper.navigateToTool();
    await page.locator("input[type=file]").first().setInputFiles({name, mimeType: "application/pdf", buffer: pdf});
    await expect(page).toHaveURL(/\/pdf-to-word\/workspace/);
    await helper.clickAction();
    await helper.waitForSyncDownload(120_000);
    const result = await helper.captureDownload();
    expect(result.buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase9-docx-"));
    const outputPath = path.join(directory, result.suggestedFileName);
    fs.writeFileSync(outputPath, result.buffer);
    try {
        const inspection = inspectDocx(outputPath);
        expect(inspection).toMatchObject({zip: true, document_xml: true, has_raw_ocr_metadata: false});
        return inspection;
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
}

async function extractTextCloud(page: Page, pdf: Buffer, name: string): Promise<string> {
    const helper = new PdfToolHelper(page, "pdf-to-text");
    await helper.navigateToTool();
    await page.locator("input[type=file]").first().setInputFiles({name, mimeType: "application/pdf", buffer: pdf});
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);
    await page.getByRole("button", {name: "Cloud"}).click();
    await page.locator("button[aria-haspopup='listbox']").click();
    await page.getByRole("button", {name: /English/}).last().click();
    await helper.clickAction();
    await helper.waitForAsyncComplete(120_000);
    const result = await helper.captureDownload();
    return result.buffer.toString("utf8");
}

test.describe.serial("Phase 9 remaining OCR consumers local full-stack", () => {
    test("PDF-to-Word native, scanned, and mixed routes are independently valid", async ({page}) => {
        const nativeInspection = await convertWord(page, await nativePdf("Native Word contract"), "native-phase9.pdf");
        const scannedInspection = await convertWord(page, await scannedPdf("Scanned Word contract"), "scanned-phase9.pdf");
        const mixedInspection = await convertWord(page, await mixedPdf(), "mixed-phase9.pdf");
        expect(nativeInspection.paragraphs).toBeGreaterThan(0);
        expect(scannedInspection.paragraphs).toBeGreaterThan(0);
        expect(mixedInspection.paragraphs).toBeGreaterThan(0);
        fs.mkdirSync(OUTPUT_DIR, {recursive: true});
        fs.writeFileSync(path.join(OUTPUT_DIR, "word-evidence.json"), `${JSON.stringify({native: nativeInspection, scanned: scannedInspection, mixed: mixedInspection}, null, 2)}\n`);
    });

    test("PDF-to-Text cloud compatibility route handles native, scanned, and mixed pages", async ({page}) => {
        const native = await extractTextCloud(page, await nativePdf("Native Text contract"), "native-text-phase9.pdf");
        expect(native).toContain("Native Text contract");
        const scanned = await extractTextCloud(page, await scannedPdf("Scanned Text contract"), "scanned-text-phase9.pdf");
        expect(scanned).toContain("Scanned");
        expect(scanned).toContain("Text");
        const mixed = await extractTextCloud(page, await mixedPdf(), "mixed-text-phase9.pdf");
        expect(mixed.indexOf("Native page first")).toBeGreaterThanOrEqual(0);
        expect(mixed.indexOf("Scanned page second")).toBeGreaterThan(mixed.indexOf("Native page first"));
    });
});
