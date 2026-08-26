import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const unexpectedFailedRequests = failedRequests.filter(
      (request) => !request.includes('/tile?') || !request.includes('net::ERR_ABORTED')
    );
    expect(unexpectedFailedRequests).toEqual([]);
    expect(badResponses).toEqual([]);
  };
}

async function uploadRealPdf(page: Page) {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/studio/v1/sessions/from-upload') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.getByTestId('studio-apply-metadata')).toBeVisible();
  return payload;
}

async function waitForCommand(page: Page, click: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/commands') && response.request().method() === 'POST',
    { timeout: 15_000 }
  );
  await click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

async function waitForUndoRedo(page: Page, action: 'undo' | 'redo') {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(`/${action}`) && response.status() === 200,
      { timeout: 15_000 }
    ),
    page.getByRole('button', { name: action === 'undo' ? 'Undo' : 'Redo' }).click(),
  ]);
}

test.describe('Studio V2 Batch 2D metadata', () => {
  test('edits authoritative metadata, reloads it, and supports undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    await uploadRealPdf(page);

    await page.getByTestId('studio-metadata-title').fill('Batch 2D title');
    await page.getByTestId('studio-metadata-author').fill('Studio QA');
    await page.getByTestId('studio-metadata-subject').fill('Metadata state contract');
    await page.getByTestId('studio-metadata-keywords').fill('studio, metadata, v2');

    const result = await waitForCommand(page, () => page.getByTestId('studio-apply-metadata').click());
    expect(result.operation.operation_name).toBe('update_metadata');
    expect(result.vdm.metadata).toEqual({
      Title: 'Batch 2D title',
      Author: 'Studio QA',
      Subject: 'Metadata state contract',
      Keywords: 'studio, metadata, v2',
    });
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.getByTestId('studio-metadata-title')).toHaveValue('Batch 2D title');

    await page.reload();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.getByTestId('studio-metadata-title')).toHaveValue('Batch 2D title');
    await expect(page.getByTestId('studio-metadata-author')).toHaveValue('Studio QA');
    await expect(page.getByTestId('studio-metadata-subject')).toHaveValue('Metadata state contract');
    await expect(page.getByTestId('studio-metadata-keywords')).toHaveValue('studio, metadata, v2');

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    await expect(page.getByTestId('studio-metadata-title')).toHaveValue('');
    await expect(page.getByTestId('studio-metadata-author')).toHaveValue('');

    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(page.getByTestId('studio-metadata-title')).toHaveValue('Batch 2D title');
    await expect(page.getByTestId('studio-metadata-keywords')).toHaveValue('studio, metadata, v2');
    assertNoBrowserIssues();
  });
});
