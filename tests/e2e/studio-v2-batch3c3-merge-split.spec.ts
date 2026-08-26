import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const MAIN_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);
const SECONDARY_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/fixtures/small_text.pdf'
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
    expect(requestURLs.some((url) => url.includes('/api/structure/merge'))).toBe(false);
    expect(requestURLs.some((url) => url.includes('/api/structure/split'))).toBe(false);
  };
}

async function uploadRealPdf(page: Page, fixturePath: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
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

function extractText(pdfPath: string) {
  return execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
}

test.describe('Studio V2 Batch 3C3 Merge and Split', () => {
  test('merges an owned secondary PDF after current-state rotation and reuses the immutable result on redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let materializationRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/materializations') && request.method() === 'POST') {
        materializationRequests += 1;
      }
    });

    const payload = await uploadRealPdf(page, MAIN_FIXTURE_PATH);
    const firstPageID = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${firstPageID}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Rotate clockwise 90°' }).click());
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');

    await expect(page.getByRole('button', { name: 'Merge and Split PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
    await expect(page.getByRole('dialog', { name: 'Merge and Split PDF' })).toBeVisible();
    const uploadAssetResponse = page.waitForResponse(
      (response) => response.url().includes('/studio/v1/sessions/') && response.url().endsWith('/assets') && response.request().method() === 'POST',
      { timeout: 60_000 }
    );
    await page.getByLabel('Secondary PDF').setInputFiles(SECONDARY_FIXTURE_PATH);
    const assetResponse = await uploadAssetResponse;
    expect(assetResponse.status()).toBe(201);
    const assetPayload = await assetResponse.json();
    await expect(page.getByTestId('studio-merge-filename')).toHaveText('small_text.pdf');

    const requestPromise = page.waitForRequest(
      (request) => request.url().endsWith('/materializations') && request.method() === 'POST',
      { timeout: 120_000 }
    );
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
      { timeout: 120_000 }
    );
    await page.getByRole('button', { name: 'Merge PDF' }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(200);
    const requestBody = request.postDataJSON() as Record<string, any>;
    expect(requestBody.operation).toBe('merge');
    expect(requestBody.parameters).toEqual({ source_asset_ids: [assetPayload.asset.id] });
    expect(requestBody).not.toHaveProperty('new_virtual_model');
    const result = await response.json();
    expect(result.version.version_number).toBe(2);
    expect(result.version.is_materialized).toBe(true);
    expect(result.asset.asset_type).toBe('materialized');
    expect(result.vdm.page_count).toBe(15);
    expect(result.vdm.pages.every((item: { source_asset_id: string }) => item.source_asset_id === result.asset.id)).toBe(true);
    expect(result.vdm.pages[0].dimensions.width).toBeGreaterThan(result.vdm.pages[0].dimensions.height);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    await expect(page.locator(`[data-page-id="${result.vdm.pages[0].page_id}"]`)).toHaveClass(/ring-2/);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    await undoOrRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await undoOrRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    expect(materializationRequests).toBe(1);

    const mergedPDF = await exportPDF(page);
    const mergedDocument = await PDFDocument.load(readFileSync(mergedPDF));
    expect(mergedDocument.getPageCount()).toBe(15);
    expect(mergedDocument.getPages()[0].getRotation().angle).toBe(90);
    expect(extractText(mergedPDF)).toContain('Page 1 of 5');
    expect(await page.getByRole('button', { name: 'Export PDF' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Compress PDF' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Convert to Grayscale' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Repair PDF' }).isVisible()).toBe(true);
    expect(await page.getByRole('button', { name: 'Redact PDF' }).isVisible()).toBe(true);
    assertNoBrowserIssues();
  });

  test('splits current reordered and rotated pages using validated stable IDs and reuses the immutable result on redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let materializationRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/materializations') && request.method() === 'POST') {
        materializationRequests += 1;
      }
    });

    const payload = await uploadRealPdf(page, MAIN_FIXTURE_PATH);
    const firstPageID = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${firstPageID}"]`).click();
    const reordered = await waitForCommand(page, () => page.getByRole('button', { name: 'Move page later' }).click());
    const reorderedFirstPageID = reordered.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${reorderedFirstPageID}"]`).click();
    const rotated = await waitForCommand(page, () => page.getByRole('button', { name: 'Rotate clockwise 90°' }).click());
    const expectedPageIDs = [0, 2, 4].map((index) => rotated.vdm.pages[index].page_id);

    await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
    await page.getByLabel('Pages to keep').fill('0');
    await page.getByRole('button', { name: 'Apply Split' }).click();
    await expect(page.getByText('Pages must be between 1 and 10.')).toBeVisible();
    await page.getByLabel('Pages to keep').fill('1,3,5');
    const requestPromise = page.waitForRequest(
      (request) => request.url().endsWith('/materializations') && request.method() === 'POST',
      { timeout: 120_000 }
    );
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
      { timeout: 120_000 }
    );
    await page.getByRole('button', { name: 'Apply Split' }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(200);
    const requestBody = request.postDataJSON() as Record<string, any>;
    expect(requestBody.operation).toBe('split');
    expect(requestBody.parameters).toEqual({ page_ids: expectedPageIDs });
    expect(requestBody).not.toHaveProperty('new_virtual_model');
    const result = await response.json();
    expect(result.version.version_number).toBe(3);
    expect(result.version.is_materialized).toBe(true);
    expect(result.vdm.page_count).toBe(3);
    expect(result.vdm.pages.every((item: { source_asset_id: string }) => item.source_asset_id === result.asset.id)).toBe(true);
    expect(result.vdm.pages[0].dimensions.width).toBeGreaterThan(result.vdm.pages[0].dimensions.height);
    expect(result.vdm.pages.every((page: { page_id: string }) => !expectedPageIDs.includes(page.page_id))).toBe(true);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 3');
    await expect(page.locator(`[data-page-id="${result.vdm.pages[0].page_id}"]`)).toHaveClass(/ring-2/);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    await undoOrRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    await expect(page.locator(`[data-page-id="${reorderedFirstPageID}"]`)).toHaveClass(/ring-2/);
    await undoOrRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 3');
    expect(materializationRequests).toBe(1);

    const splitPDF = await exportPDF(page);
    const splitDocument = await PDFDocument.load(readFileSync(splitPDF));
    expect(splitDocument.getPageCount()).toBe(3);
    expect(splitDocument.getPages()[0].getRotation().angle).toBe(90);
    assertNoBrowserIssues();
  });
});
