import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

const MAIN_FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');
const IMAGE_FIXTURE_PATH = path.resolve(__dirname, '../fixtures/sample.png');

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) consoleErrors.push(message.text()); });
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(failedRequests.filter((item) => !item.includes('net::ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(requests.some((item) => item.includes('/api/structure/watermark'))).toBe(false);
  };
}

async function uploadPDF(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST', { timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles(MAIN_FIXTURE_PATH);
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function applyWatermark(page: Page) {
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST', { timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Apply Watermark' }).click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  expect(response.status()).toBe(200);
  return { body: request.postDataJSON() as Record<string, any>, result: await response.json() };
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

test.describe('Studio V2 Batch 4A2 Watermark', () => {
  test('applies text watermark to every current page, previews it, supports DAG undo/redo, compresses, and exports final text', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadPDF(page);
    await page.getByRole('button', { name: 'Watermark PDF' }).click();
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toBeVisible();
    await page.getByLabel('Watermark text').fill('BATCH 4A2 TEXT');
    await page.getByLabel('Watermark rotation').fill('0');
    await page.getByLabel('Watermark position').selectOption('br');
    const applied = await applyWatermark(page);
    expect(applied.body.operation).toBe('add_watermark');
    expect(applied.body.parameters.page_ids).toEqual(payload.vdm.pages.map((page: { page_id: string }) => page.page_id));
    expect(applied.body).not.toHaveProperty('new_virtual_model');
    expect(applied.result.vdm.pages.every((page: { overlays: Array<{ type: string; text?: string }> }) => page.overlays.some((overlay) => overlay.type === 'watermark' && overlay.text === 'BATCH 4A2 TEXT'))).toBe(true);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');

    const materializeRequest = page.waitForRequest((request) => request.url().endsWith('/materializations') && request.method() === 'POST');
    const materializeResponse = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    const [compressRequest, compressResponse] = await Promise.all([materializeRequest, materializeResponse]);
    expect(compressResponse.status()).toBe(200);
    expect(compressRequest.postDataJSON().operation).toBe('compress');
    const exported = await exportPDF(page);
    expect(execFileSync('pdftotext', [exported, '-'], { encoding: 'utf8' })).toContain('BATCH 4A2 TEXT');
    assertNoBrowserIssues();
  });

  test('uploads an owned PNG asset, applies image watermark through typed command, previews, removes, and exports', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    await uploadPDF(page);
    await page.getByRole('button', { name: 'Watermark PDF' }).click();
    await page.getByRole('button', { name: 'Image watermark' }).click();
    const assetResponsePromise = page.waitForResponse((response) => response.url().endsWith('/assets') && response.request().method() === 'POST', { timeout: 60_000 });
    await page.getByLabel('Watermark image').setInputFiles(IMAGE_FIXTURE_PATH);
    const assetResponse = await assetResponsePromise;
    expect(assetResponse.status()).toBe(201);
    const asset = (await assetResponse.json()).asset;
    expect(asset.asset_type).toBe('watermark_image');
    expect(asset).not.toHaveProperty('r2_key');
    const applied = await applyWatermark(page);
    expect(applied.body.operation).toBe('add_watermark');
    expect(applied.body.parameters.asset_id).toBe(asset.id);
    expect(applied.body.parameters).not.toHaveProperty('asset_r2_key');
    expect(applied.result.vdm.pages.every((item: { overlays: Array<{ type: string; asset_id?: string }> }) => item.overlays.some((overlay) => overlay.type === 'watermark' && overlay.asset_id === asset.id))).toBe(true);
    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });

    const removeRequest = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Watermark PDF' }).click();
    await page.getByRole('button', { name: 'Remove Watermark' }).click();
    const removed = await (await removeRequest).json();
    expect(removed.vdm.pages.every((item: { overlays: Array<{ type: string }> }) => item.overlays.every((overlay) => overlay.type !== 'watermark'))).toBe(true);
    await exportPDF(page);
    assertNoBrowserIssues();
  });
});
