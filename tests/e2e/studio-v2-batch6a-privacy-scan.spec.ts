import { test, expect, Page } from '@playwright/test';
import path from 'path';

const forbiddenKeys = new Set([
  'artifact_key',
  'source_key',
  'payload_key',
  'source_tracker',
  'upright_tracker',
  'worker_shared_secret',
  'x-worker-signature',
  'x-worker-timestamp',
  'x-worker-nonce',
]);

function scanKeys(value: unknown, location = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => scanKeys(item, `${location}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbiddenKeys.has(key.toLowerCase()) ? [`${location}.${key}`] : []),
    ...scanKeys(child, `${location}.${key}`),
  ]);
}

function monitor(page: Page) {
  const jsonScans: Promise<string[]>[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const legacyRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('request', (request) => {
    if (/\/api\/(?:structure|optimize|security|markup|edit)\/|\/api\/v1\//.test(request.url())) legacyRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    if (response.url().includes('/api/studio/v1/')) {
      jsonScans.push((async () => {
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('application/json')) return [];
        try { return scanKeys(await response.json(), response.url()); } catch { return []; }
      })());
    }
  });
  return async () => {
    const leakedKeys = (await Promise.all(jsonScans)).flat();
    expect(leakedKeys).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests.filter((request) => !request.includes('ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(legacyRequests).toEqual([]);
  };
}

test('Studio responses keep session, asset, job, editor-state, and export internals private', async ({ page }) => {
  const assertClean = monitor(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve(__dirname, '../fixtures/normal_text.pdf'));
  await expect(page.getByTestId('studio-enter-edit-pdf')).toBeVisible();
  await page.getByTestId('studio-enter-edit-pdf').click();
  await expect(page.getByText('Ready to edit')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('studio-edit-text').fill('BATCH 6A PRIVACY SCAN');
  await page.getByRole('button', { name: 'Compile' }).click();
  await expect(page.getByTestId('studio-version')).toHaveText('Version 1', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await assertClean();
});
