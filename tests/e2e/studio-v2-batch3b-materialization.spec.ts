import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const unexpectedFailedRequests = failedRequests.filter(
      (request) =>
        (!request.includes('/tile?') && !request.includes('/exports/')) ||
        !request.includes('net::ERR_ABORTED')
    );
    expect(unexpectedFailedRequests).toEqual([]);
    expect(badResponses).toEqual([]);
  };
}

async function uploadRealPdf(page: Page) {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
  return payload;
}

async function waitForCommand(page: Page, click: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/commands') && response.request().method() === 'POST',
    { timeout: 15_000 }
  );
  await click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

async function waitForUndoRedo(page: Page, action: 'undo' | 'redo') {
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/${action}`) && response.status() === 200),
    page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo' }).click(),
  ]);
}

async function exportPDF(page: Page) {
  const exportResponse = page.waitForResponse(
    (response) => response.url().endsWith('/export') && response.request().method() === 'POST',
    { timeout: 60_000 }
  );
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const response = await exportResponse;
  expect(response.status()).toBe(200);
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return PDFDocument.load(await readFile(filePath!));
}

test.describe('Studio V2 Batch 3B materialization', () => {
  test('compresses the current Studio state, updates preview, and preserves export undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const firstPageID = payload.vdm.pages[0].page_id as string;

    await page.locator(`[data-page-id="${firstPageID}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Rotate clockwise 90°' }).click());
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');

    const materializeResponse = page.waitForResponse(
      (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
      { timeout: 120_000 }
    );
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await page.getByRole('button', { name: 'Apply Compress' }).click();
    const response = await materializeResponse;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.operation.operation_name).toBe('compress');
    expect(result.version.is_materialized).toBe(true);
    expect(result.version.snapshot_id).toBeTruthy();
    expect(result.vdm.page_count).toBe(10);
    expect(result.vdm.pages.every((item: { source_asset_id: string }) => item.source_asset_id === result.asset.id)).toBe(true);
    expect(result.vdm.pages[0].rotation).toBe(0);
    expect(result.vdm.pages[0].dimensions.width).toBeGreaterThan(result.vdm.pages[0].dimensions.height);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    const undoPDF = await exportPDF(page);
    expect(undoPDF.getPageCount()).toBe(10);
    expect(undoPDF.getPages()[0].getRotation().angle).toBe(90);

    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    const redoPDF = await exportPDF(page);
    expect(redoPDF.getPageCount()).toBe(10);
    expect(redoPDF.getPages()[0].getRotation().angle).toBe(90);
    assertNoBrowserIssues();
  });
});
