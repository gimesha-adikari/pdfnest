import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

async function openCompress(page: Page) {
  await page.goto('/studio-v2');
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_PATH);
  expect((await uploadResponse).status()).toBe(201);
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Compress PDF' }).click();
  await expect(page.getByTestId('studio-compress-panel')).toBeVisible();
}

async function applyCompress(page: Page, level: 'low' | 'medium' | 'high' = 'medium') {
  await page.getByLabel('Compression level').selectOption(level);
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: 'Apply Compress' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe('Studio V2 Batch U8B truthful Compress feedback', () => {
  test('shows truthful lifecycle text and no fake percentage or cancel control while running', async ({ page }) => {
    await openCompress(page);
    await page.route('**/materializations', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });
    const request = applyCompress(page, 'medium');
    await expect(page.getByTestId('studio-compress-status')).toContainText(/Preparing current document|Compressing current document/);
    await expect(page.getByTestId('studio-compress-status')).not.toContainText(/%/);
    await expect(page.getByRole('button', { name: /Cancel compression|Cancel Compress/i })).toHaveCount(0);
    await request;
  });

  test('sends the selected low, medium, and high profiles through the typed materialization request', async ({ page }) => {
    for (const level of ['low', 'medium', 'high'] as const) {
      await openCompress(page);
      await page.getByLabel('Compression level').selectOption(level);
      const requestPromise = page.waitForRequest(
        (request) => request.url().endsWith('/materializations') && request.method() === 'POST',
        { timeout: 120_000 },
      );
      const responsePromise = page.waitForResponse(
        (response) => response.url().endsWith('/materializations') && response.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.getByRole('button', { name: 'Apply Compress' }).click();
      const request = await requestPromise;
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      expect(request.postDataJSON().parameters.level).toBe(level);
    }
  });

  test('keeps the successful popover open and renders backend byte metrics', async ({ page }) => {
    await openCompress(page);
    const result = await applyCompress(page, 'high');
    expect(result.metrics.input_bytes).toBeGreaterThanOrEqual(0);
    expect(result.metrics.output_bytes).toBeGreaterThan(0);
    expect(result.metrics.saved_bytes).toBe(Math.max(result.metrics.input_bytes - result.metrics.output_bytes, 0));
    expect(result.metrics.reduction_percent).toBe(
      result.metrics.input_bytes > 0 ? (result.metrics.saved_bytes / result.metrics.input_bytes) * 100 : 0,
    );
    await expect(page.getByTestId('studio-compress-panel')).toBeVisible();
    await expect(page.getByTestId('studio-compress-metrics')).toBeVisible();
    await expect(page.getByTestId('studio-compress-input-bytes')).toBeVisible();
    await expect(page.getByTestId('studio-compress-output-bytes')).toBeVisible();
    await expect(page.getByTestId('studio-compress-reduction-percent')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = await downloadPromise;
    const outputPath = await download.path();
    expect(outputPath).not.toBeNull();
    const output = await PDFDocument.load(fs.readFileSync(outputPath!));
    expect(output.getPageCount()).toBe(10);
  });

  test('retains an honest failure state and offers retry without claiming success', async ({ page }) => {
    await openCompress(page);
    await page.route('**/materializations', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'compression unavailable' }) }));
    await page.getByRole('button', { name: 'Apply Compress' }).click();
    await expect(page.getByTestId('studio-compress-status')).toContainText('Compression failed');
    await expect(page.getByTestId('studio-compress-error')).toContainText('compression unavailable');
    await expect(page.getByRole('button', { name: 'Retry Compress' })).toBeVisible();
    await expect(page.getByTestId('studio-compress-metrics')).toHaveCount(0);
  });

  test('does not call legacy optimize or worker mutation routes', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/(optimize|compress)|worker/i.test(request.url())) forbidden.push(request.url());
    });
    await openCompress(page);
    await applyCompress(page, 'medium');
    expect(forbidden).toEqual([]);
  });
});
