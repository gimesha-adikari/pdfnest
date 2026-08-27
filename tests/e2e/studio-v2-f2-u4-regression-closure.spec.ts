import { test, expect, Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { authenticateProUser } from '../helpers/auth';

async function nativeTextPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Alpha Bravo Charlie', { x: 72, y: 700, size: 24, font, color: rgb(0, 0, 0) });
  page.drawText('Delta Echo Foxtrot', { x: 72, y: 640, size: 24, font, color: rgb(0, 0, 0) });
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, buffer: Buffer, name: string) {
  await authenticateProUser(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const session = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  const analysis = page.waitForResponse((response) => response.url().endsWith('/markup-analysis') && response.request().method() === 'GET');
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
  expect((await session).status()).toBe(201);
  expect((await analysis).status()).toBe(200);
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
}

async function selectAndDraw(page: Page, mode: 'manual' | 'smart') {
  await page.getByRole('button', { name: 'Annotate', exact: true }).click();
  await page.getByTestId('studio-markup-action-highlight').click();
  await page.getByTestId(`studio-markup-mode-${mode}`).click();
  await page.getByTestId('studio-markup-color').click();
  await page.getByRole('button', { name: 'Blue, #0000FF' }).click();
  const tile = page.locator('main [data-page-id]').first();
  await tile.scrollIntoViewIfNeeded();
  const bounds = await tile.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.08, bounds!.y + bounds!.height * 0.08);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.82, bounds!.y + bounds!.height * 0.24, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('studio-markup-region-1')).toBeVisible();
}

test.describe('Studio V2 F2 U4 regression closure', () => {
  test('Smart Apply sends one first request and rejects an immediate duplicate', async ({ page }) => {
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) browserErrors.push(message.text()); });
    await upload(page, await nativeTextPdf(), 'f2-smart-request-count.pdf');
    await selectAndDraw(page, 'smart');
    const apply = page.getByTestId('studio-markup-apply');
    let requests = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') requests += 1; });
    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/jobs') && request.method() === 'POST');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/jobs') && response.request().method() === 'POST');
    await apply.evaluate((element) => {
      (element as HTMLButtonElement).click();
      (element as HTMLButtonElement).click();
    });
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    expect(response.status()).toBe(202);
    expect(requests).toBe(1);
    expect(request.postDataJSON().parameters.mode).toBe('smart');
    await expect(page.getByTestId('studio-markup-job-status')).toContainText('Markup applied', { timeout: 120_000 });
    const downloadPromise = page.waitForEvent('download');
    const exportResponse = page.waitForResponse((item) => item.url().endsWith('/export') && item.request().method() === 'POST');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    expect((await exportResponse).status()).toBe(200);
    expect(await (await downloadPromise).path()).toBeTruthy();
    expect(browserErrors).toEqual([]);
  });

  test('Markup Apply releases after failure and permits one intentional retry', async ({ page }) => {
    await upload(page, await nativeTextPdf(), 'f2-markup-retry.pdf');
    await selectAndDraw(page, 'manual');
    const apply = page.getByTestId('studio-markup-apply');
    let requests = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') requests += 1; });
    await page.route('**/studio/v1/sessions/*/jobs', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forced F2 markup failure' }),
    }));
    const failed = page.waitForResponse((response) => response.url().endsWith('/jobs') && response.request().method() === 'POST');
    await apply.click();
    expect((await failed).status()).toBe(500);
    expect(requests).toBe(1);
    await expect(apply).toBeEnabled();
    await page.unroute('**/studio/v1/sessions/*/jobs');
    const retried = page.waitForResponse((response) => response.url().endsWith('/jobs') && response.request().method() === 'POST');
    await apply.click();
    expect((await retried).status()).toBe(202);
    expect(requests).toBe(2);
    await expect(page.getByTestId('studio-markup-job-status')).toContainText('Markup applied', { timeout: 120_000 });
  });
});
