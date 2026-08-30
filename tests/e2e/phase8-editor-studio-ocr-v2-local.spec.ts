import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { authenticateProUser } from "../helpers/auth";

const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/phase8-editor-studio-local");

function scannedPageBuffer(): Buffer {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase8-scan-"));
  const imagePath = path.join(directory, "scan.png");
  try {
    execFileSync("python3", ["-c", [
      "from PIL import Image, ImageDraw, ImageFont",
      "import sys",
      "im=Image.new('RGB', (1200, 1600), 'white')",
      "d=ImageDraw.Draw(im)",
      "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 54)",
      "d.text((120, 220), 'Phase Eight Alpha Bravo', font=font, fill='black')",
      "d.text((120, 340), 'Canonical OCR V2 editor', font=font, fill='black')",
      "im.save(sys.argv[1])",
    ].join(";"), imagePath]);
    return fs.readFileSync(imagePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function scannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const image = await pdf.embedPng(scannedPageBuffer());
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  return Buffer.from(await pdf.save());
}

async function nativePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.drawText("Native Phase Eight Alpha Bravo", { x: 72, y: 680, size: 30 });
  page.drawText("Trustworthy native editor text", { x: 72, y: 620, size: 24 });
  return Buffer.from(await pdf.save());
}

async function waitForDownload(page: Page, buttonText: RegExp): Promise<string> {
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: buttonText }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  return downloadPath!;
}

function inspectPdf(pdfPath: string): Record<string, unknown> {
  const script = [
    "import fitz, json, sys",
    "doc=fitz.open(sys.argv[1]); page=doc[0]",
    "anns=[{'type': a.type[1], 'rect':[a.rect.x0,a.rect.y0,a.rect.x1,a.rect.y1]} for a in (page.annots() or [])]",
    "text=page.get_text('text'); print(json.dumps({'header':open(sys.argv[1],'rb').read(5).decode('ascii'),'pages':doc.page_count,'rect':[page.rect.width,page.rect.height],'text_char_count':len(text),'has_text':bool(text.strip()),'annotations':anns,'images':len(page.get_images(full=True))}))",
  ].join("; ");
  const python = process.env.E2E_PYTHON || "python3";
  return JSON.parse(execFileSync(python, ["-c", script, pdfPath], { encoding: "utf8" }));
}

async function uploadStudio(page: Page, pdf: Buffer) {
  await page.goto("/studio-v2");
  await expect(page.getByRole("heading", { name: "Open a PDF in Studio" })).toBeVisible();
  const uploadResponse = page.waitForResponse((response) => response.url().includes("/studio/v1/sessions/from-upload") && response.request().method() === "POST");
  await page.locator("input[type=file]").first().setInputFiles({ name: "phase8-scanned.pdf", mimeType: "application/pdf", buffer: pdf });
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  await expect(page.getByTestId("studio-enter-edit-pdf")).toBeVisible({ timeout: 60_000 });
}

test.describe.serial("Phase 8 OCR V2 editor and Studio local full-stack", () => {
  test("General Editor opt-in OCR V2 extracts, searches, edits, and downloads", async ({ page }) => {
    await authenticateProUser(page);
    const pdf = await scannedPdf();
    await page.goto("/edit-pdf?ocr_v2=1");
    await page.locator("input[type=file]").first().setInputFiles({ name: "phase8-scanned.pdf", mimeType: "application/pdf", buffer: pdf });
    await expect(page).toHaveURL(/\/edit-pdf\/workspace/);
    await expect(page).toHaveURL(/\/edit-pdf\/workspace\?ocr_v2=1/);
    await expect(page.getByTestId("editor-ocr-v2-mode")).toBeVisible();
    await expect(page.getByTestId("editor-search")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("editor-search").fill("Phase Eight Alpha Bravo");
    await expect(page.getByTestId("editor-search-count")).toHaveText("1 matches");
    await page.getByRole("button", { name: "Select first" }).click();
    const editorInput = page.locator('input[aria-label="Edit selected PDF text"]').first();
    await expect(editorInput).toBeVisible();
    await editorInput.fill("Phase Eight OCR V2 edited");
    const compileRequest = page.waitForRequest((request) => request.url().endsWith("/api/edit/compile") && request.method() === "POST");
    const compileResponse = page.waitForResponse((response) => response.url().endsWith("/api/edit/compile") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Export Precision Vector Document Changes/ }).click();
    const compilePayload = JSON.parse((await compileRequest).postData() || "{}");
    const compileResult = await compileResponse;
    console.log(`[PHASE8] editor compile source tracker present: ${Boolean(compilePayload.source_tracker)}`);
    if (!compileResult.ok()) throw new Error(`Editor compile failed: ${await compileResult.text()}`);
    await expect(page).toHaveURL(/\/edit-pdf\/download/, { timeout: 120_000 });
    const downloadedPath = await waitForDownload(page, /Download File/);
    const text = execFileSync("pdftotext", [downloadedPath, "-"], { encoding: "utf8" });
    expect(text).toContain("Phase Eight OCR V2 edited");
    expect(inspectPdf(downloadedPath)).toMatchObject({ header: "%PDF-", pages: 1 });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.copyFileSync(downloadedPath, path.join(OUTPUT_DIR, "general-editor-v2.pdf"));
  });

  test("Studio V2 editor and OCR-aware markup use the V2 worker path", async ({ page }) => {
    await authenticateProUser(page);
    const pdf = await scannedPdf();
    const submittedOperations: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/jobs") && request.method() === "POST") {
        const body = request.postDataJSON() as { operation?: string; parameters?: { mode?: string; ocr_v2?: boolean } };
        if (body.operation) submittedOperations.push(`${body.operation}:${body.parameters?.mode || ""}`);
      }
    });
    await uploadStudio(page, pdf);
    await page.getByTestId("studio-enter-edit-pdf").click();
    await expect(page.getByTestId("studio-edit-workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ready to edit")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("studio-editor-search").fill("Phase Eight Alpha Bravo");
    await expect(page.getByTestId("studio-editor-search-count")).toHaveText("1 matches");
    await page.getByRole("button", { name: "Select first match" }).click();
    await page.getByTestId("studio-edit-text").fill("Studio OCR V2 edited");
    await page.getByRole("button", { name: "Compile" }).click();
    const versionLabel = page.getByText("Version 1", { exact: true }).first();
    await expect(versionLabel).toBeVisible({ timeout: 120_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "phase8-scanned.pdf" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Version 1", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
    expect(submittedOperations).toContain("editor_extract:");
    expect(submittedOperations).toContain("editor_compile:");

    await page.getByRole("button", { name: "Annotate", exact: true }).click();
    await page.getByTestId("studio-markup-action-highlight").click();
    await page.getByTestId("studio-markup-mode-ocr").click();
    const tile = page.locator("main [data-page-id]").first();
    await tile.scrollIntoViewIfNeeded();
    const bounds = await tile.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.12, bounds!.y + bounds!.height * 0.16);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.65, bounds!.y + bounds!.height * 0.31);
    await page.mouse.up();
    await expect(page.getByTestId("studio-markup-region-1")).toBeVisible();
    const markupRequest = page.waitForRequest((request) => request.url().endsWith("/jobs") && request.method() === "POST" && request.postDataJSON()?.operation === "markup_highlight");
    await page.getByTestId("studio-markup-apply").click();
    const request = await markupRequest;
    expect(request.postDataJSON().parameters.mode).toBe("ocr");
    await expect(page.getByTestId("studio-markup-job-status")).toContainText("Markup applied", { timeout: 120_000 });
    expect(submittedOperations).toContain("markup_highlight:ocr");
    const downloadPath = await waitForDownload(page, /Export PDF/);
    const inspection = inspectPdf(downloadPath);
    expect(inspection).toMatchObject({ header: "%PDF-", pages: 1 });
    expect((inspection.annotations as Array<{ type: string }>).some((annotation) => annotation.type === "Highlight")).toBe(true);
    expect(execFileSync("pdftotext", [downloadPath, "-"], { encoding: "utf8" })).toContain("Studio OCR V2 edited");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.copyFileSync(downloadPath, path.join(OUTPUT_DIR, "studio-v2-ocr-markup.pdf"));
    fs.writeFileSync(path.join(OUTPUT_DIR, "e2e-evidence.json"), `${JSON.stringify({ submittedOperations, general_editor: "PASS", studio_editor: "PASS", studio_ocr_markup: inspection }, null, 2)}\n`);
  });

  test("General Editor native text route remains usable in OCR V2 mode", async ({ page }) => {
    await authenticateProUser(page);
    await page.goto("/edit-pdf?ocr_v2=1");
    await page.locator("input[type=file]").first().setInputFiles({ name: "phase8-native.pdf", mimeType: "application/pdf", buffer: await nativePdf() });
    await expect(page).toHaveURL(/\/edit-pdf\/workspace\?ocr_v2=1/);
    await expect(page.getByTestId("editor-search")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("editor-search").fill("Native Phase Eight Alpha Bravo");
    await expect(page.getByTestId("editor-search-count")).toHaveText("1 matches");
    await page.getByRole("button", { name: "Select first" }).click();
    const editorInput = page.locator('input[aria-label="Edit selected PDF text"]').first();
    await expect(editorInput).toBeVisible();
    await editorInput.fill("Native Phase Eight edited");
    const compileResponse = page.waitForResponse((response) => response.url().endsWith("/api/edit/compile") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Export Precision Vector Document Changes/ }).click();
    expect((await compileResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/edit-pdf\/download/, { timeout: 120_000 });
    const downloadedPath = await waitForDownload(page, /Download File/);
    expect(execFileSync("pdftotext", [downloadedPath, "-"], { encoding: "utf8" })).toContain("Native Phase Eight edited");
    expect(inspectPdf(downloadedPath)).toMatchObject({ header: "%PDF-", pages: 1 });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.copyFileSync(downloadedPath, path.join(OUTPUT_DIR, "general-editor-native-v2.pdf"));
  });
});
