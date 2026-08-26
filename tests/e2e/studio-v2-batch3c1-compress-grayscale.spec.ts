import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

const COMPRESS_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);
const COLOR_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/fixtures/image_heavy.pdf'
);

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const requestURLs: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('request', (request) => requestURLs.push(request.url()));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const unexpectedFailedRequests = failedRequests.filter((request) => {
      const isKnownAbort = request.includes('net::ERR_ABORTED');
      const isTileOrDownload = request.includes('/tile?') || request.includes('/exports/');
      return !(isKnownAbort && isTileOrDownload);
    });
    expect(unexpectedFailedRequests).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requestURLs.some((url) => url.includes('/api/optimize/'))).toBe(false);
  };
}

async function uploadRealPdf(page: Page, fixturePath: string) {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function waitForCommand(page: Page, click: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/commands') && response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

async function materializeFromUI(
  page: Page,
  buttonName: string,
  expectedOperation: 'compress' | 'grayscale',
) {
  const requestPromise = page.waitForRequest(
    (request) => request.url().endsWith('/materializations') && request.method() === 'POST',
    { timeout: 120_000 }
  );
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
    { timeout: 120_000 }
  );
  await page.getByRole('button', { name: buttonName }).click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  expect(response.status()).toBe(200);
  const requestBody = request.postDataJSON() as Record<string, unknown>;
  expect(requestBody.operation).toBe(expectedOperation);
  expect(requestBody).not.toHaveProperty('new_virtual_model');
  return response.json();
}

async function undoOrRedo(page: Page, action: 'undo' | 'redo') {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(`/${action}`) && response.status() === 200,
      { timeout: 30_000 }
    ),
    page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo' }).click(),
  ]);
}

async function exportPDF(page: Page) {
  const exportResponse = page.waitForResponse(
    (response) => response.url().endsWith('/export') && response.request().method() === 'POST',
    { timeout: 120_000 }
  );
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const response = await exportResponse;
  expect(response.status()).toBe(200);
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return filePath!;
}

function rasterColorStats(pdfPath: string) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'platen-studio-color-'));
  const outputBase = path.join(tempDir, 'page');
  try {
    execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-png', '-r', '20', pdfPath, outputBase]);
    const stats = execFileSync(
      'python3',
      [
        '-c',
        'from PIL import Image; import sys; p=Image.open(sys.argv[1]).convert("RGB"); px=list(p.getdata()); print(sum(1 for r,g,b in px if max(r,g,b)-min(r,g,b)>2))',
        `${outputBase}.png`,
      ],
      { encoding: 'utf8' }
    );
    return { coloredPixels: Number(stats.trim()) };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test.describe('Studio V2 Batch 3C1 Compress and Grayscale', () => {
  test('compresses the current rotated Studio state with a selected level', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page, COMPRESS_FIXTURE_PATH);
    const firstPageID = payload.vdm.pages[0].page_id as string;

    await page.locator(`[data-page-id="${firstPageID}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Rotate clockwise 90°' }).click());
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');

    await page.getByLabel('Compression level').selectOption('medium');
    const result = await materializeFromUI(page, 'Compress PDF', 'compress');
    expect(result.operation.operation_name).toBe('compress');
    expect(result.operation.parameters).toEqual({ level: 'medium' });
    expect(result.version.version_number).toBe(2);
    expect(result.version.is_materialized).toBe(true);
    expect(result.asset.asset_type).toBe('materialized');
    expect(result.vdm.page_count).toBe(10);
    expect(result.vdm.pages.every((item: { source_asset_id: string }) => item.source_asset_id === result.asset.id)).toBe(true);
    expect(result.vdm.pages[0].rotation).toBe(0);
    expect(result.vdm.pages[0].dimensions.width).toBeGreaterThan(result.vdm.pages[0].dimensions.height);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    await expect(page.locator(`[data-page-id="${result.vdm.pages[0].page_id}"]`)).toHaveClass(/ring-2/);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    await undoOrRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    const undoPDF = await exportPDF(page);
    const undoDocument = await PDFDocument.load(readFileSync(undoPDF));
    expect(undoDocument.getPageCount()).toBe(10);
    expect(undoDocument.getPages()[0].getRotation().angle).toBe(90);

    await undoOrRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    const redoPDF = await exportPDF(page);
    const redoDocument = await PDFDocument.load(readFileSync(redoPDF));
    expect(redoDocument.getPageCount()).toBe(10);
    expect(redoDocument.getPages()[0].getRotation().angle).toBe(90);
    assertNoBrowserIssues();
  });

  test('converts a color fixture to grayscale and restores it through undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    expect(rasterColorStats(COLOR_FIXTURE_PATH).coloredPixels).toBeGreaterThan(0);
    const payload = await uploadRealPdf(page, COLOR_FIXTURE_PATH);
    const firstPageID = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${firstPageID}"]`).click();

    const result = await materializeFromUI(page, 'Convert to Grayscale', 'grayscale');
    expect(result.operation.operation_name).toBe('grayscale');
    expect(result.operation.parameters).toEqual({});
    expect(result.version.version_number).toBe(1);
    expect(result.version.is_materialized).toBe(true);
    expect(result.asset.asset_type).toBe('materialized');
    expect(result.vdm.page_count).toBe(payload.vdm.page_count);
    expect(result.vdm.pages.every((item: { source_asset_id: string }) => item.source_asset_id === result.asset.id)).toBe(true);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.locator(`[data-page-id="${result.vdm.pages[0].page_id}"]`)).toHaveClass(/ring-2/);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    const grayscalePDF = await exportPDF(page);
    expect(rasterColorStats(grayscalePDF).coloredPixels).toBe(0);

    await undoOrRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    const colorPDF = await exportPDF(page);
    expect(rasterColorStats(colorPDF).coloredPixels).toBeGreaterThan(0);

    await undoOrRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    const redoGrayscalePDF = await exportPDF(page);
    expect(rasterColorStats(redoGrayscalePDF).coloredPixels).toBe(0);
    assertNoBrowserIssues();
  });
});
