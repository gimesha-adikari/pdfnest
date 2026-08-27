import { test, expect, Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { execFileSync } from 'child_process';

async function redactionFixture(rotated = false) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  if (rotated) page.setRotation(degrees(90));
  page.drawText('PUBLIC SECRET PUBLIC', { x: 72, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  page.drawText('ALPHA BETA GAMMA', { x: 72, y: 620, size: 24, font, color: rgb(0, 0, 0) });
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, buffer: Buffer, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function openAreaRedact(page: Page) {
  await page.getByRole('button', { name: 'Redact PDF', exact: true }).click();
  await page.getByTestId('studio-redaction-area-mode').click();
  await expect(page.getByTestId('studio-redaction-area-guidance')).toBeVisible();
}

async function drawArea(page: Page, pageId: string, top = 0.05, bottom = 0.2) {
  const tile = page.locator(`main [data-page-id="${pageId}"]`);
  await tile.scrollIntoViewIfNeeded();
  const bounds = await tile.boundingBox();
  expect(bounds).not.toBeNull();
  const startY = Math.max(bounds!.y + 56, bounds!.y + bounds!.height * top);
  const endY = Math.max(bounds!.y + 56, bounds!.y + bounds!.height * bottom);
  await page.mouse.move(bounds!.x + bounds!.width * 0.05, startY);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.82, endY, { steps: 5 });
  await page.mouse.up();
}

async function exportText(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  return execFileSync('pdftotext', [filePath!, '-'], { encoding: 'utf8' });
}

function watchLegacyNetwork(page: Page) {
  const bad: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(structure|markup|edit|v1\/redact)(?:\/|$)/.test(request.url())) bad.push(`${request.method()} ${request.url()}`);
  });
  return () => expect(bad).toEqual([]);
}

test.describe('Studio V2 Batch U5 permanent manual redaction', () => {
  test('draws an Area region and permanently removes covered text after export', async ({ page }) => {
    const assertNoLegacyNetwork = watchLegacyNetwork(page);
    const payload = await upload(page, await redactionFixture(), 'u5-area.pdf');
    await openAreaRedact(page);
    await drawArea(page, payload.vdm.pages[0].page_id);
    await expect(page.getByTestId('studio-redaction-region-list')).toContainText('1 pending area');
    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/materializations') && request.method() === 'POST');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply permanent redaction' }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(200);
    expect(request.postDataJSON().parameters.boxes).toHaveLength(1);
    expect(request.postDataJSON().parameters.boxes[0].page_id).toBe(payload.vdm.pages[0].page_id);
    expect(await exportText(page)).not.toContain('SECRET');
    assertNoLegacyNetwork();
  });

  test('supports multiple page-associated regions and removing one before Apply', async ({ page }) => {
    const payload = await upload(page, await redactionFixture(), 'u5-multiple.pdf');
    await openAreaRedact(page);
    await drawArea(page, payload.vdm.pages[0].page_id, 0.05, 0.18);
    await drawArea(page, payload.vdm.pages[0].page_id, 0.2, 0.32);
    await expect(page.getByTestId('studio-redaction-region-list')).toContainText('2 pending areas');
    await page.getByRole('button', { name: 'Remove pending redaction area 1' }).click();
    await expect(page.getByTestId('studio-redaction-region-list')).toContainText('1 pending area');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply permanent redaction' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
  });

  test('preserves the existing keyword Redact path and permanent text removal', async ({ page }) => {
    await upload(page, await redactionFixture(), 'u5-keyword.pdf');
    await page.getByRole('button', { name: 'Redact PDF', exact: true }).click();
    await page.getByTestId('studio-redaction-keywords').fill('SECRET');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply permanent redaction' }).click();
    expect((await responsePromise).status()).toBe(200);
    const text = await exportText(page);
    expect(text).not.toContain('SECRET');
    expect(text).toContain('PUBLIC');
  });

  test('submits keyword and area redactions together through one Studio materialization', async ({ page }) => {
    const payload = await upload(page, await redactionFixture(), 'u5-combined.pdf');
    await openAreaRedact(page);
    await page.getByTestId('studio-redaction-keywords').fill('ALPHA');
    await drawArea(page, payload.vdm.pages[0].page_id, 0.05, 0.2);
    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/materializations') && request.method() === 'POST');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply permanent redaction' }).click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(200);
    expect(request.postDataJSON().parameters.keywords).toEqual(['ALPHA']);
    expect(request.postDataJSON().parameters.boxes).toHaveLength(1);
    const text = await exportText(page);
    expect(text).not.toContain('ALPHA');
    expect(text).not.toContain('SECRET');
  });

  test('retains visible selection mapping at non-zero rotation and records normalized geometry', async ({ page }) => {
    const payload = await upload(page, await redactionFixture(true), 'u5-rotated.pdf');
    await openAreaRedact(page);
    await drawArea(page, payload.vdm.pages[0].page_id, 0.05, 0.35);
    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/materializations') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Apply permanent redaction' }).click();
    const request = await requestPromise;
    const box = request.postDataJSON().parameters.boxes[0];
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(1);
  });
});
