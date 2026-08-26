import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import path from 'path';

const MAIN_FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests.filter((item) => !item.includes('net::ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requests.some((item) => item.includes('/api/structure/add-page-numbers'))).toBe(false);
  };
}

async function uploadPDF(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST', { timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles(file);
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function applyPageNumbers(page: Page) {
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST', { timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST', { timeout: 30_000 });
  await page.getByTestId('studio-apply-page-numbers').click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(200);
  return { body: request.postDataJSON() as Record<string, any>, result: JSON.parse(responseText) };
}

async function exportPDF(page: Page) {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST', { timeout: 120_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  return file!;
}

async function createBlankPDF(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

test.describe('Studio V2 Batch 4A3 Page Numbers', () => {
  test('applies document-level numbering, previews it, preserves selection, and follows reorder order', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadPDF(page, MAIN_FIXTURE_PATH);
    const firstPageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${firstPageId}"]`).click();
    const beforePreview = await page.locator('main img[alt="Page 1"]').screenshot();
    await expect(page.locator(`[data-page-id="${firstPageId}"]`)).toHaveClass(/ring-2/);

    await page.getByTestId('studio-page-numbers-button').click();
    await expect(page.getByRole('dialog', { name: 'Page Numbers' })).toBeVisible();
    await page.getByTestId('studio-page-numbers-font').selectOption('Times-Roman');
    await page.getByTestId('studio-page-numbers-size').fill('12');
    await page.getByTestId('studio-page-numbers-position').selectOption('bc');
    const applied = await applyPageNumbers(page);
    expect(applied.body.operation).toBe('update_page_numbering');
    expect(applied.body.parameters).toEqual({ enabled: true, font_family: 'Times-Roman', font_size: 12, position: 'bc' });
    expect(applied.body).not.toHaveProperty('new_virtual_model');
    expect(applied.result.vdm.page_numbering).toMatchObject({ enabled: true, format: '%p', position: 'bc', font_size: 12, font_family: 'Times-Roman', start_at: 1 });
    expect(applied.result.vdm.pages.map((item: { page_id: string }) => item.page_id)).toEqual(payload.vdm.pages.map((item: { page_id: string }) => item.page_id));
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
    const afterPreview = await page.locator('main img[alt="Page 1"]').screenshot();
    expect(Buffer.compare(beforePreview, afterPreview)).not.toBe(0);
    await expect(page.locator(`[data-page-id="${firstPageId}"]`)).toHaveClass(/ring-2/);

    const pageTwoId = payload.vdm.pages[1].page_id as string;
    await page.locator(`[data-page-id="${pageTwoId}"]`).click();
    const reorderResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Move page later' }).click();
    const reordered = await (await reorderResponse).json();
    expect(reordered.vdm.page_numbering).toMatchObject({ enabled: true, format: '%p' });
    expect(reordered.vdm.pages.map((item: { page_id: string }) => item.page_id)).toEqual([payload.vdm.pages[0].page_id, payload.vdm.pages[2].page_id, payload.vdm.pages[1].page_id, ...payload.vdm.pages.slice(3).map((item: { page_id: string }) => item.page_id)]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');

    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    assertNoBrowserIssues();
  });

  test('exports numbers once through Compress, reuses the materialized version on redo, and avoids double numbering', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let materializeCalls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/materializations') && request.method() === 'POST') materializeCalls += 1;
    });
    const payload = await uploadPDF(page, { name: 'blank-3-pages.pdf', mimeType: 'application/pdf', buffer: await createBlankPDF(3) });
    await page.getByTestId('studio-page-numbers-button').click();
    await applyPageNumbers(page);

    const materializeResponse = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    const compressed = await (await materializeResponse).json();
    expect(compressed.operation.operation_name).toBe('compress');
    expect(compressed.version.is_materialized).toBe(true);
    expect(compressed.vdm.page_numbering).toBeUndefined();
    expect(compressed.vdm.page_count).toBe(3);
    expect(materializeCalls).toBe(1);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');

    const compressedExport = await exportPDF(page);
    const compressedText = execFileSync('pdftotext', [compressedExport, '-'], { encoding: 'utf8' });
    for (const number of ['1', '2', '3']) expect((compressedText.match(new RegExp(`\\b${number}\\b`, 'g')) || []).length).toBe(1);

    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    expect(materializeCalls).toBe(1);
    await expect(page.getByTestId('studio-page-numbers-button')).toBeVisible();
    expect(payload.vdm.page_count).toBe(3);
    assertNoBrowserIssues();
  });

  test('disables numbering explicitly, exports without generated labels, and restores it with undo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    await uploadPDF(page, { name: 'blank-3-pages.pdf', mimeType: 'application/pdf', buffer: await createBlankPDF(3) });
    await page.getByTestId('studio-page-numbers-button').click();
    await applyPageNumbers(page);
    await page.getByTestId('studio-page-numbers-button').click();
    const removeRequest = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByTestId('studio-remove-page-numbers').click();
    const removed = await (await removeRequest).json();
    expect(removed.vdm.page_numbering.enabled).toBe(false);
    const unnumberedExport = await exportPDF(page);
    const unnumberedText = execFileSync('pdftotext', [unnumberedExport, '-'], { encoding: 'utf8' });
    expect((unnumberedText.match(/\b[123]\b/g) || []).length).toBe(0);

    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.getByTestId('studio-page-numbers-button')).toBeVisible();
    assertNoBrowserIssues();
  });
});
