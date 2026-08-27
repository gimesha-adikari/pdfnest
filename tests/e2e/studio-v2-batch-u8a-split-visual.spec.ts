import { test, expect, Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFileSync } from 'child_process';

async function fixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`PAGE-${i}`, { x: 48, y: 720, size: 18, font });
  }
  return Buffer.from(await pdf.save());
}

async function openSplit(page: Page) {
  await page.goto('/studio-v2');
  const response = page.waitForResponse((r) => r.url().includes('/sessions/from-upload') && r.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'split-fixture.pdf', mimeType: 'application/pdf', buffer: await fixture() });
  expect((await response).status()).toBe(201);
  await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
  await expect(page.getByTestId('studio-split-visual-selector')).toBeVisible();
}

async function exportText(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();
  return execFileSync('pdftotext', [outputPath!, '-'], { encoding: 'utf8' });
}

test.describe('Studio V2 Batch U8A visual Split selection', () => {
  test('selects and deselects pages with visual controls', async ({ page }) => {
    await openSplit(page);
    const tiles = page.locator('[data-testid^="studio-split-page-"]');
    await tiles.nth(1).click();
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('1 pages selected');
    await tiles.nth(1).click();
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('0 pages selected');
  });

  test('supports Shift range selection', async ({ page }) => {
    await openSplit(page);
    const tiles = page.locator('[data-testid^="studio-split-page-"]');
    await tiles.nth(1).click();
    await tiles.nth(4).click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('4 pages selected');
  });

  test('Select All and Clear All share one selection state', async ({ page }) => {
    await openSplit(page);
    await page.getByRole('button', { name: 'Select All' }).click();
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('5 pages selected');
    await page.getByRole('button', { name: 'Clear All' }).click();
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('0 pages selected');
    await expect(page.getByRole('button', { name: 'Apply Split' })).toBeDisabled();
  });

  test('typed range synchronizes to visual selection', async ({ page }) => {
    await openSplit(page);
    await page.getByLabel('Pages to keep').fill('1,3-5');
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('4 pages selected');
    await expect(page.getByLabel('Pages to keep')).toHaveValue('1,3-5');
  });

  test('successful split resets visual and typed selection', async ({ page }) => {
    await openSplit(page);
    await page.locator('[data-testid^="studio-split-page-"]').nth(1).click();
    const response = page.waitForResponse((r) => r.url().includes('/materializations') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Apply Split' }).click();
    expect((await response).status()).toBe(200);
    const text = await exportText(page);
    expect(text).toContain('PAGE-2');
    expect(text).not.toContain('PAGE-1');
    expect(text).not.toContain('PAGE-3');
    await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
    await expect(page.getByTestId('studio-split-selected-count')).toHaveText('0 pages selected');
  });

  test('submits stable page IDs and does not call legacy or worker routes', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('request', (request) => { if (/\/api\/(split|v1)|worker/i.test(request.url())) forbidden.push(request.url()); });
    await openSplit(page);
    await page.locator('[data-testid^="studio-split-page-"]').nth(1).click();
    const request = page.waitForRequest((r) => r.url().includes('/materializations') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Apply Split' }).click();
    const body = JSON.parse((await request).postData() ?? '{}');
    expect(body.parameters.page_ids).toHaveLength(1);
    expect(body.parameters.page_ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(forbidden).toEqual([]);
  });
});
