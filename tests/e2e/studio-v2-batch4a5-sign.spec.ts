import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
    expect(consoleErrors).toEqual([]);
    expect(failedRequests.filter((item) => !item.includes('net::ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requests.some((item) => item.includes('/api/structure/sign'))).toBe(false);
  };
}

async function createBlankPDF(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

const signaturePNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function uploadBlank(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'blank-3-pages.pdf', mimeType: 'application/pdf', buffer: await createBlankPDF(3) });
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function applySignature(page: Page, pageId: string) {
  await page.locator(`[data-page-id="${pageId}"]`).click();
  const assetResponse = page.waitForResponse((response) => response.url().endsWith('/assets') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.locator('input[type="file"]').last().setInputFiles({ name: 'signature.png', mimeType: 'image/png', buffer: signaturePNG });
  await page.getByTestId('studio-signature-x').fill('72');
  await page.getByTestId('studio-signature-y').fill('90');
  await page.getByTestId('studio-signature-width').fill('180');
  await page.getByTestId('studio-signature-height').fill('60');
  const commandRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const commandResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-signature').click();
  const [assetHTTP, [request, response]] = await Promise.all([assetResponse, Promise.all([commandRequest, commandResponse])]);
  const asset = await assetHTTP.json();
  expect(asset.asset.asset_type).toBe('signature_image');
  expect(asset.asset).not.toHaveProperty('r2_key');
  const body = request.postDataJSON() as Record<string, any>;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(body.operation).toBe('add_signature_overlay');
  expect(body.parameters).toMatchObject({ page_id: pageId, asset_id: asset.asset.id, x: 72, y: 90, width: 180, height: 60 });
  expect(body).not.toHaveProperty('new_virtual_model');
  const overlay = result.vdm.pages.find((item: { page_id: string }) => item.page_id === pageId).overlays.find((item: { type: string }) => item.type === 'signature');
  expect(overlay.id).toBeTruthy();
  expect(overlay.asset_id).toBe(asset.asset.id);
  return { overlay, asset, result };
}

async function exportPDF(page: Page) {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST', { timeout: 120_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await responsePromise).status()).toBe(200);
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  return file!;
}

function countRedPixels(pdfPath: string, pageNumber: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sign-'));
  const png = path.join(dir, 'page');
  execFileSync('pdftoppm', ['-png', '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile', pdfPath, png]);
  const output = execFileSync('python3', ['-c', "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGB'); print(sum(1 for r,g,b in im.getdata() if r>200 and g<200 and b<200))", `${png}.png`], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return Number(output.trim());
}

test.describe('Studio V2 Batch 4A5 Sign', () => {
  test('creates an owned signature overlay, previews, updates, removes, and restores it', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadBlank(page);
    const before = await page.locator('main img[alt="Page 1"]').screenshot();
    const added = await applySignature(page, payload.vdm.pages[0].page_id);
    const after = await page.locator('main img[alt="Page 1"]').screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);

    await page.getByTestId(`studio-signature-overlay-${added.overlay.id}`).click();
    await page.getByTestId('studio-signature-x').fill('100');
    const updateRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
    const updateResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByTestId('studio-apply-signature').click();
    const [request, response] = await Promise.all([updateRequest, updateResponse]);
    expect(request.postDataJSON().operation).toBe('update_signature_overlay');
    expect(request.postDataJSON().parameters.overlay_id).toBe(added.overlay.id);
    expect((await response.json()).vdm.pages[0].overlays.find((item: { id: string }) => item.id === added.overlay.id).rect[0]).toBe(100);

    await page.getByTestId('studio-remove-signature').click();
    await expect(page.getByTestId(`studio-signature-overlay-${added.overlay.id}`)).toHaveCount(0);
    await Promise.all([page.waitForResponse((res) => res.url().endsWith('/undo') && res.status() === 200), page.locator('button[title="Undo"]').click()]);
    await expect(page.getByTestId(`studio-signature-overlay-${added.overlay.id}`)).toBeVisible();
    await Promise.all([page.waitForResponse((res) => res.url().endsWith('/redo') && res.status() === 200), page.locator('button[title="Redo"]').click()]);
    await expect(page.getByTestId(`studio-signature-overlay-${added.overlay.id}`)).toHaveCount(0);
    assertNoBrowserIssues();
  });

  test('signs a blank page, exports visibly, and preserves the signature through Compress exactly once', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let materializeCalls = 0;
    page.on('request', (request) => { if (request.url().endsWith('/materializations') && request.method() === 'POST') materializeCalls += 1; });
    const payload = await uploadBlank(page);
    const added = await applySignature(page, payload.vdm.pages[2].page_id);
    await expect(page.locator('main img[alt="Page 3"]')).toBeVisible({ timeout: 60_000 });
    const materializeResponse = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    const compressed = await (await materializeResponse).json();
    expect(compressed.version.is_materialized).toBe(true);
    expect(compressed.vdm.pages.every((item: { overlays: unknown[] }) => item.overlays.length === 0)).toBe(true);
    expect(materializeCalls).toBe(1);
    const exported = await exportPDF(page);
    expect(countRedPixels(exported, 3)).toBeGreaterThan(0);
    await Promise.all([page.waitForResponse((res) => res.url().endsWith('/undo') && res.status() === 200), page.locator('button[title="Undo"]').click()]);
    await Promise.all([page.waitForResponse((res) => res.url().endsWith('/redo') && res.status() === 200), page.locator('button[title="Redo"]').click()]);
    expect(materializeCalls).toBe(1);
    expect(added.overlay.id).toBeTruthy();
    assertNoBrowserIssues();
  });
});
