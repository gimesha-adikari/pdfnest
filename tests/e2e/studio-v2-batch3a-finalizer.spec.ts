import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
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
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
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

async function undoOrRedo(page: Page, action: 'undo' | 'redo') {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(`/${action}`) && response.status() === 200,
      { timeout: 15_000 }
    ),
    page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo' }).click(),
  ]);
}

async function exportDownload(page: Page) {
  const exportResponse = page.waitForResponse(
    (response) => response.url().endsWith('/export') && response.request().method() === 'POST',
    { timeout: 60_000 }
  );
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const response = await exportResponse;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('standard_a4_10p-studio.pdf');
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return { payload, filePath: filePath! };
}

async function exportedPDF(filePath: string) {
  const pdf = await PDFDocument.load(await readFile(filePath));
  const text = execFileSync('pdftotext', [filePath, '-'], { encoding: 'utf8' });
  return { pdf, textPages: text.split('\f') };
}

test.describe('Studio V2 Batch 3A finalizer', () => {
  test('exports the authoritative VDM into a readable semantic PDF and honors undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const pageIds = payload.vdm.pages.map((item: { page_id: string }) => item.page_id) as string[];

    await page.locator(`[data-page-id="${pageIds[1]}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Move page later' }).click());
    await waitForCommand(page, () => page.getByRole('button', { name: 'Rotate clockwise 90°' }).click());

    await page.locator(`[data-page-id="${pageIds[4]}"]`).click();
    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    await waitForCommand(page, () => page.getByTestId('studio-apply-crop').click());

    await page.locator(`[data-page-id="${pageIds[3]}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Delete selected page' }).click());

    await page.locator(`[data-page-id="${pageIds[2]}"]`).click();
    await waitForCommand(page, () => page.getByRole('button', { name: 'Duplicate page' }).click());
    await waitForCommand(page, () => page.getByRole('button', { name: 'Add blank page' }).click());

    await page.getByTestId('studio-metadata-title').fill('Batch 3A finality');
    await page.getByTestId('studio-metadata-author').fill('Studio E2E');
    await page.getByTestId('studio-metadata-subject').fill('VDM native materialization');
    await page.getByTestId('studio-metadata-keywords').fill('finalizer, export, studio');
    await waitForCommand(page, () => page.getByTestId('studio-apply-metadata').click());

    const finalExport = await exportDownload(page);
    expect(finalExport.payload.export.version_id).toBeTruthy();
    const { pdf, textPages } = await exportedPDF(finalExport.filePath);
    expect(pdf.getPageCount()).toBe(11);
    expect(pdf.getTitle()).toBe('Batch 3A finality');
    expect(pdf.getAuthor()).toBe('Studio E2E');
    expect(pdf.getSubject()).toBe('VDM native materialization');
    expect(pdf.getKeywords()).toContain('finalizer');

    const pages = pdf.getPages();
    expect(textPages[0]).toContain('Page 1 of 10');
    expect(textPages[1]).toContain('Page 3 of 10');
    expect(textPages[2]).toContain('Page 3 of 10');
    expect(textPages[3].trim()).toBe('');
    expect(textPages[4]).toContain('Page 2 of 10');
    expect(textPages.join('\n')).not.toContain('Page 4 of 10');
    expect(pages[4].getRotation().angle).toBe(90);
    const crop = pages[5].getCropBox();
    expect(crop.x).toBeCloseTo(100, 2);
    expect(crop.y).toBeCloseTo(100, 2);
    expect(crop.width).toBeCloseTo(350, 2);
    expect(crop.height).toBeCloseTo(600, 2);

    // Roll back only to the rotate operation: export must follow the active
    // node, not the highest version/history tip. Undo once more removes it.
    for (let index = 0; index < 5; index += 1) await undoOrRedo(page, 'undo');
    await undoOrRedo(page, 'undo');
    const undoExport = await exportDownload(page);
    const undone = await exportedPDF(undoExport.filePath);
    expect(undone.pdf.getPages()[2].getRotation().angle).toBe(0);

    await undoOrRedo(page, 'redo');
    const redoExport = await exportDownload(page);
    const redone = await exportedPDF(redoExport.filePath);
    expect(redone.pdf.getPages()[2].getRotation().angle).toBe(90);
    assertNoBrowserIssues();
  });
});
