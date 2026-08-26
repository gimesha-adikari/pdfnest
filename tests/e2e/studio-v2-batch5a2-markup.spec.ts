import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function createBlankPDF() {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

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
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests.filter((item) => !item.includes('net::ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requests.some((item) => item.includes('/api/markup/') || item.includes('/api/edit/') || item.includes('/api/structure/') || item.includes('/api/v1/markup/'))).toBe(false);
  };
}

async function uploadBlank(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'markup.pdf', mimeType: 'application/pdf', buffer: await createBlankPDF() });
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function selectMarkupTool(page: Page, action: 'highlight' | 'underline' | 'strikeout') {
  await page.getByRole('button', { name: 'Annotate', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Markup tools' })).toBeVisible();
  await page.getByTestId(`studio-markup-action-${action}`).click();
}

async function drawMarkup(page: Page, pageId: string) {
  const tile = page.locator(`main [data-page-id="${pageId}"]`);
  await tile.scrollIntoViewIfNeeded();
  const bounds = await tile.boundingBox();
  expect(bounds).not.toBeNull();
  const left = bounds!.x + bounds!.width * 0.12;
  const top = bounds!.y + bounds!.height * 0.16;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.28);
  await page.mouse.up();
  await expect(page.getByTestId('studio-markup-region-1')).toBeVisible();
  return tile;
}

async function applyMarkup(page: Page, pageId: string, action: 'highlight' | 'underline' | 'strikeout', expectedVersion = 'Version 1') {
  await page.locator(`[data-page-id="${pageId}"]`).click();
  await selectMarkupTool(page, action);
  const tile = await drawMarkup(page, pageId);
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/jobs') && request.method() === 'POST');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/jobs') && response.request().method() === 'POST');
  await page.getByTestId('studio-markup-apply').click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  expect(response.status()).toBe(202);
  const requestBody = request.postDataJSON() as Record<string, any>;
  const responseBody = await response.json();
  expect(requestBody.operation).toBe(`markup_${action}`);
  expect(requestBody.parameters.mode).toBe('manual');
  expect(requestBody.parameters.boxes).toHaveLength(1);
  expect(requestBody).not.toHaveProperty('new_virtual_model');
  expect(responseBody.job).not.toHaveProperty('result');
  expect(responseBody.job).not.toHaveProperty('artifact_key');
  await expect(page.getByTestId('studio-markup-job-status')).toContainText('Markup applied', { timeout: 120_000 });
  await expect(page.getByTestId('studio-version')).toHaveText(expectedVersion);
  return { tile, requestBody, responseBody };
}

async function exportPDF(page: Page) {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST', { timeout: 120_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await responsePromise).status()).toBe(200);
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  return downloadedPath!;
}

function colorBounds(pdfPath: string, predicate: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-markup-'));
  const pngPath = path.join(directory, 'page');
  execFileSync('pdftoppm', ['-png', '-r', '72', '-f', '1', '-l', '1', '-singlefile', pdfPath, pngPath]);
  const script = `from PIL import Image; im=Image.open(${JSON.stringify(`${pngPath}.png`)}).convert('RGB'); p=[]\nfor y in range(im.height):\n  for x in range(im.width):\n    r,g,b=im.getpixel((x,y))\n    if ${predicate}: p.append((x,y))\nprint((min(x for x,y in p), min(y for x,y in p), max(x for x,y in p), max(y for x,y in p), len(p)) if p else None)`;
  const output = execFileSync('python3', ['-c', script], { encoding: 'utf8' });
  fs.rmSync(directory, { recursive: true, force: true });
  const match = /^\((\d+), (\d+), (\d+), (\d+), (\d+)\)$/.exec(output.trim());
  expect(match).not.toBeNull();
  return { minX: Number(match![1]), minY: Number(match![2]), maxX: Number(match![3]), maxY: Number(match![4]), count: Number(match![5]) };
}

test.describe('Studio V2 Batch 5A2 Markup', () => {
  test('applies Highlight through the UI, preserves rotated/cropped geometry, exports, and replays with Undo/Redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let workerSubmissions = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') workerSubmissions += 1; });
    const payload = await uploadBlank(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${pageId}"]`).click();
    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/commands') && response.status() === 200),
      page.getByTestId('studio-apply-crop').click(),
    ]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await page.getByTestId('studio-rotate-clockwise').click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    const applied = await applyMarkup(page, pageId, 'highlight', 'Version 3');
    expect(applied.requestBody.parameters.boxes[0].page).toBe(1);
    expect(applied.requestBody.parameters.boxes[0].width).toBeGreaterThan(0);
    expect(applied.requestBody.parameters.boxes[0].height).toBeGreaterThan(0);
    const exported = await exportPDF(page);
    const highlightBounds = colorBounds(exported, 'r>220 and g>220 and b<220');
    expect(highlightBounds.count).toBeGreaterThan(0);
    expect(highlightBounds.minX).toBeGreaterThan(150);
    expect(highlightBounds.maxX).toBeGreaterThan(400);
    expect(highlightBounds.minY).toBeGreaterThan(140);
    expect(highlightBounds.maxY).toBeLessThan(220);
    expect(workerSubmissions).toBe(1);
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    expect(workerSubmissions).toBe(1);
    assertNoBrowserIssues();
  });

  test('applies Underline as a real async Studio job and exports a visible native-PDF result', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let workerSubmissions = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') workerSubmissions += 1; });
    const payload = await uploadBlank(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${pageId}"]`).click();
    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/commands') && response.status() === 200),
      page.getByTestId('studio-apply-crop').click(),
    ]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    const applied = await applyMarkup(page, pageId, 'underline', 'Version 2');
    expect(applied.responseBody.job.job_type).toBe('markup_underline');
    const exported = await exportPDF(page);
    expect(colorBounds(exported, 'r>150 and g<150 and b<180').count).toBeGreaterThan(0);
    expect(workerSubmissions).toBe(1);
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    expect(workerSubmissions).toBe(1);
    assertNoBrowserIssues();
  });

  test('applies Strikeout through the shared markup surface without legacy browser API calls', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let workerSubmissions = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') workerSubmissions += 1; });
    const payload = await uploadBlank(page);
    const applied = await applyMarkup(page, payload.vdm.pages[0].page_id, 'strikeout', 'Version 1');
    expect(applied.responseBody.job.job_type).toBe('markup_strikeout');
    expect(applied.requestBody.parameters.mode).toBe('manual');
    await expect(page.getByTestId('studio-markup-apply')).toBeDisabled();
    const exported = await exportPDF(page);
    expect(colorBounds(exported, 'r>150 and g<150 and b<180').count).toBeGreaterThan(0);
    expect(workerSubmissions).toBe(1);
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    expect(workerSubmissions).toBe(1);
    assertNoBrowserIssues();
  });
});
