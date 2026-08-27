import { test, expect, Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

type Action = 'highlight' | 'underline' | 'strikeout';

async function nativeTextPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Alpha Bravo Charlie', { x: 72, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  page.drawText('Delta Echo Foxtrot', { x: 72, y: 640, size: 24, font, color: rgb(0, 0, 0) });
  return Buffer.from(await pdf.save());
}

function scannedTextPng(): Buffer {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-u4-ocr-'));
  const pngPath = path.join(directory, 'scan.png');
  try {
    execFileSync('python3', ['-c', [
      'from PIL import Image, ImageDraw, ImageFont',
      'import sys',
      'im=Image.new("RGB", (1200, 1600), "white")',
      'd=ImageDraw.Draw(im)',
      'font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 54)',
      'd.text((150, 260), "Scanned Bravo", font=font, fill="black")',
      'im.save(sys.argv[1])',
    ].join(';'), pngPath]);
    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function scannedPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const image = await pdf.embedPng(scannedTextPng());
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, buffer: Buffer, name: string) {
  await authenticateProUser(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const sessionResponse = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  const analysisResponse = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/') && response.url().endsWith('/markup-analysis') && response.request().method() === 'GET', { timeout: 120_000 });
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
  const response = await sessionResponse;
  expect(response.status()).toBe(201);
  expect((await analysisResponse).status()).toBe(200);
  const payload = await response.json();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function drawRegion(page: Page, pageId: string) {
  const tile = page.locator(`main [data-page-id="${pageId}"]`);
  await tile.scrollIntoViewIfNeeded();
  const bounds = await tile.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.08, bounds!.y + bounds!.height * 0.08);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.82, bounds!.y + bounds!.height * 0.24, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('studio-markup-region-1')).toBeVisible();
}

async function selectMarkup(page: Page, action: Action, mode: 'manual' | 'smart' | 'ocr') {
  await page.getByRole('button', { name: 'Annotate', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Markup tools' })).toBeVisible();
  await page.getByTestId(`studio-markup-action-${action}`).click();
  await page.getByTestId(`studio-markup-mode-${mode}`).click();
}

async function applyAndExport(page: Page, action: Action, mode: 'manual' | 'smart' | 'ocr', pageId: string, color: string) {
  await selectMarkup(page, action, mode);
  await page.getByTestId('studio-markup-color').click();
  await page.getByRole('button', { name: new RegExp(color, 'i') }).click();
  await drawRegion(page, pageId);
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/jobs') && request.method() === 'POST');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/jobs') && response.request().method() === 'POST');
  await page.getByTestId('studio-markup-apply').click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  expect(response.status()).toBe(202);
  expect(request.postDataJSON().parameters.mode).toBe(mode);
  await expect(page.getByTestId('studio-markup-job-status')).toContainText('Markup applied', { timeout: 120_000 });
  const downloadPromise = page.waitForEvent('download');
  const exportResponse = page.waitForResponse((candidate) => candidate.url().endsWith('/export') && candidate.request().method() === 'POST');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await exportResponse).status()).toBe(200);
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  return { request: request.postDataJSON(), output: downloadedPath! };
}

function coloredPixelCount(pdfPath: string, action: Action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-u4-render-'));
  const prefix = path.join(directory, 'page');
  try {
    execFileSync('pdftoppm', ['-png', '-r', '72', '-f', '1', '-l', '1', '-singlefile', pdfPath, prefix]);
    const predicate = action === 'highlight' ? 'b>120 and b>r*1.25 and b>g*1.1' : action === 'underline' ? 'g>80 and g>r*1.15 and g>b*1.05' : 'r>100 and b>80 and r>g*1.25';
    return Number(execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(`${prefix}.png`)}).convert('RGB'); print(sum(1 for r,g,b in im.getdata() if ${predicate}))`], { encoding: 'utf8' }).trim());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function watchLegacyNetwork(page: Page) {
  const bad: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(structure|markup|edit|v1\/markup)\//.test(request.url())) bad.push(`${request.method()} ${request.url()}`);
  });
  return () => expect(bad).toEqual([]);
}

test.describe('Studio V2 Batch U4 markup modes', () => {
  test('keeps Manual exact behavior and makes draft history local, reversible, and keyboard-safe', async ({ page }) => {
    const assertNoLegacyNetwork = watchLegacyNetwork(page);
    const payload = await upload(page, await nativeTextPdf(), 'u4-manual.pdf');
    const pageId = payload.vdm.pages[0].page_id as string;
    await selectMarkup(page, 'highlight', 'manual');
    await drawRegion(page, pageId);
    await page.getByTestId('studio-markup-undo').click();
    await expect(page.getByTestId('studio-markup-region-1')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+Z');
    await expect(page.getByTestId('studio-markup-region-1')).toBeVisible();
    await page.getByTestId('studio-markup-mode-smart').click();
    await expect(page.getByRole('status')).toContainText('Clear or apply pending regions');
    await page.getByTestId('studio-markup-color').click();
    await page.getByLabel(/Blue/).click();
    await page.getByTestId('studio-markup-clear').click();
    await expect(page.getByTestId('studio-markup-region-1')).toHaveCount(0);
    await page.getByTestId('studio-markup-undo').click();
    await expect(page.getByTestId('studio-markup-region-1')).toBeVisible();
    await page.getByTestId('studio-markup-redo').click();
    await expect(page.getByTestId('studio-markup-region-1')).toHaveCount(0);
    assertNoLegacyNetwork();
  });

  for (const [action, color] of [['highlight', 'Blue'], ['underline', 'Green'], ['strikeout', 'Purple']] as const) {
    test(`runs ${action} through Smart native-text mode and exports text-aware output`, async ({ page }) => {
      const assertNoLegacyNetwork = watchLegacyNetwork(page);
      const payload = await upload(page, await nativeTextPdf(), `u4-smart-${action}.pdf`);
      const pageId = payload.vdm.pages[0].page_id as string;
      const result = await applyAndExport(page, action, 'smart', pageId, color);
      expect(result.request.parameters.boxes[0].color).not.toBe('#FFFF00');
      expect(coloredPixelCount(result.output, action)).toBeGreaterThan(0);
      assertNoLegacyNetwork();
    });
  }

  for (const action of ['highlight', 'underline', 'strikeout'] as Action[]) {
    test(`wires explicit OCR mode for ${action} and preserves final output`, async ({ page }) => {
      const assertNoLegacyNetwork = watchLegacyNetwork(page);
      const payload = await upload(page, await scannedPdf(), `u4-ocr-${action}.pdf`);
      const pageId = payload.vdm.pages[0].page_id as string;
      await selectMarkup(page, action, 'ocr');
      await expect(page.getByTestId('studio-markup-guidance')).toContainText(/Smart|OCR/);
      const color = action === 'highlight' ? 'Blue' : action === 'underline' ? 'Green' : 'Purple';
      const result = await applyAndExport(page, action, 'ocr', pageId, color);
      expect(result.request.parameters.mode).toBe('ocr');
      expect(coloredPixelCount(result.output, action)).toBeGreaterThan(0);
      assertNoLegacyNetwork();
    });
  }

  test('uses OCR fallback from Smart on a scanned page through the Studio route', async ({ page }) => {
    const assertNoLegacyNetwork = watchLegacyNetwork(page);
    const payload = await upload(page, await scannedPdf(), 'u4-smart-ocr-fallback.pdf');
    const pageId = payload.vdm.pages[0].page_id as string;
    await selectMarkup(page, 'highlight', 'smart');
    await expect(page.getByTestId('studio-markup-guidance')).toContainText(/native PDF text first|OCR/);
    const result = await applyAndExport(page, 'highlight', 'smart', pageId, 'Blue');
    expect(result.request.parameters.mode).toBe('smart');
    expect(coloredPixelCount(result.output, 'highlight')).toBeGreaterThan(0);
    assertNoLegacyNetwork();
  });
});
