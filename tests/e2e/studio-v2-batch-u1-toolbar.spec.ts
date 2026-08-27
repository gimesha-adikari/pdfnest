import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_1p.pdf');

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
    expect(requests.some((item) => /\/api\/(structure|optimize|markup)\//.test(item))).toBe(false);
  };
}

async function openStudio(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
}

test.describe('Studio V2 Batch U1 toolbar/popover/token UX', () => {
  test('switches and dismisses anchored tool popovers and preserves compression level', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    await openStudio(page);

    await expect(page.locator('header')).toHaveCSS('overflow-x', 'visible');
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();

    await page.getByRole('button', { name: 'Watermark PDF' }).click();
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'Page Numbers' }).click();
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Page Numbers' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Page Numbers' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Page Numbers' })).toBeFocused();

    await page.getByRole('button', { name: 'Watermark PDF' }).click();
    await page.locator('main img[alt="Page 1"]').click();
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await page.getByLabel('Compression level').selectOption('high');
    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/materializations') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Apply Compress' }).click();
    const request = await requestPromise;
    expect(request.postDataJSON().parameters).toEqual({ level: 'high' });

    await expect(page.getByRole('button', { name: 'Merge and Split PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Watermark PDF' })).toBeVisible();
    await expect(page.getByTestId('studio-page-numbers-button')).toBeVisible();
    assertNoBrowserIssues();
  });

  test('keeps all document actions reachable from the narrow-width More menu', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    await openStudio(page, 800);
    await expect(page.getByRole('button', { name: 'More document tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'More document tools' }).click();
    await expect(page.getByRole('dialog', { name: 'More document tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Watermark' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Page Numbers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redact' })).toBeVisible();
    assertNoBrowserIssues();
  });
});
