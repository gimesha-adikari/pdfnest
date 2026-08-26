import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'child_process';
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
    expect(failedRequests.filter((item) => !item.includes('ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requests.some((item) => /\/api\/(edit|v1\/editor)\//.test(item))).toBe(false);
  };
}

async function upload(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve(__dirname, '../fixtures/normal_text.pdf'));
  expect((await uploadResponse).status()).toBe(201);
  await expect(page.getByTestId('studio-enter-edit-pdf')).toBeVisible();
}

test.describe('Studio V2 Batch 5B2 Edit PDF', () => {
  test('extracts current Studio state, edits text, compiles, and returns to Studio', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let studioJobSubmissions = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') studioJobSubmissions += 1; });
    await upload(page);
    await page.locator('main [data-page-id]').first().click();
    await page.getByTestId('studio-rotate-clockwise').click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await page.getByTestId('studio-enter-edit-pdf').click();
    await expect(page.getByTestId('studio-edit-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ready to edit')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: /Sample Text Document - Page 1/ }).first()).toBeVisible();
    await page.getByRole('button', { name: /Sample Text Document - Page 1/ }).first().click();
    await page.getByTestId('studio-edit-text').fill('STUDIO V2 FINAL EDIT');
    expect(studioJobSubmissions).toBe(1);
    await page.getByRole('button', { name: 'Compile' }).click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2', { timeout: 120_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const text = execFileSync('pdftotext', [downloadedPath!, '-'], { encoding: 'utf8' });
    expect(text).toContain('STUDIO V2 FINAL EDIT');
    expect(text).not.toContain('Sample Text Document - Page 1');
    const pageInfo = execFileSync('pdfinfo', ['-f', '1', '-l', '1', downloadedPath!], { encoding: 'utf8' });
    expect(pageInfo).toMatch(/Page\s+1 size:\s+595 x 842 pts/);
    expect(pageInfo).toMatch(/Page\s+1 rot:\s+90/);
    expect(studioJobSubmissions).toBe(2);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 2');
    expect(studioJobSubmissions).toBe(2);
    assertNoBrowserIssues();
  });

  test('discards an edited browser draft without creating a Studio version', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let studioJobSubmissions = 0;
    page.on('request', (request) => { if (request.url().endsWith('/jobs') && request.method() === 'POST') studioJobSubmissions += 1; });
    page.on('dialog', (dialog) => void dialog.accept());
    await upload(page);
    await page.getByTestId('studio-enter-edit-pdf').click();
    await expect(page.getByText('Ready to edit')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('studio-edit-text').fill('DISCARDED DRAFT');
    await page.getByTestId('studio-edit-back-discard').click();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    expect(studioJobSubmissions).toBe(1);
    assertNoBrowserIssues();
  });
});
