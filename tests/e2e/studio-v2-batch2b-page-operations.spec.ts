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
    // Version replacement intentionally aborts stale tile fetches. Any other
    // failed request is unexpected and remains a hard failure.
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
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
  return payload;
}

async function pageOrder(page: Page): Promise<string[]> {
  return page.locator('main [data-page-id]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-page-id') || '')
  );
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

test.describe('Studio V2 Batch 2B page operations', () => {
  test('reorders a selected page through the UI and preserves stable selection with undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const initialIds = payload.vdm.pages.map((item: { page_id: string }) => item.page_id);
    const selectedId = initialIds[1];
    await page.locator(`[data-page-id="${selectedId}"]`).click();

    await expect(page.getByRole('button', { name: 'Move page earlier' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Move page later' })).toBeEnabled();
    const result = await waitForCommand(page, () =>
      page.getByRole('button', { name: 'Move page later' }).click()
    );
    expect(result.vdm.pages.map((item: { page_id: string }) => item.page_id)).toEqual([
      initialIds[0], initialIds[2], initialIds[1], ...initialIds.slice(3),
    ]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect.poll(() => pageOrder(page)).toEqual([
      initialIds[0], initialIds[2], initialIds[1], ...initialIds.slice(3),
    ]);
    await expect(page.locator(`[data-page-id="${selectedId}"]`)).toHaveClass(/ring-2/);

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    await expect.poll(() => pageOrder(page)).toEqual(initialIds);
    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect.poll(() => pageOrder(page)).toEqual([
      initialIds[0], initialIds[2], initialIds[1], ...initialIds.slice(3),
    ]);
    await expect(page.locator(`[data-page-id="${selectedId}"]`)).toHaveClass(/ring-2/);
    assertNoBrowserIssues();
  });

  test('duplicates the selected page with server-owned identity and undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const initialIds = payload.vdm.pages.map((item: { page_id: string }) => item.page_id);
    const sourceId = initialIds[1];
    await page.locator(`[data-page-id="${sourceId}"]`).click();
    const result = await waitForCommand(page, () =>
      page.getByRole('button', { name: 'Duplicate page' }).click()
    );
    expect(result.vdm.page_count).toBe(11);
    const duplicate = result.vdm.pages.find(
      (item: { page_id: string; parent_page_id?: string; source_asset_id?: string | null; source_page_number: number }) =>
        item.parent_page_id === sourceId && item.page_id !== sourceId
    );
    expect(duplicate).toBeTruthy();
    expect(duplicate.page_id).not.toBe(sourceId);
    const source = result.vdm.pages.find((item: { page_id: string }) => item.page_id === sourceId);
    expect(duplicate.source_asset_id).toBe(source.source_asset_id);
    expect(duplicate.source_page_number).toBe(source.source_page_number);
    expect(result.vdm.pages[result.vdm.pages.findIndex((item: { page_id: string }) => item.page_id === sourceId) + 1].page_id).toBe(duplicate.page_id);
    await expect(page.getByTestId('studio-page-count')).toHaveText('11');
    await expect(page.locator(`[data-page-id="${duplicate.page_id}"] img`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-page-id="${duplicate.page_id}"]`)).toHaveClass(/ring-2/);

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-page-count')).toHaveText('10');
    await expect(page.locator(`[data-page-id="${duplicate.page_id}"]`)).toHaveCount(0);
    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-page-count')).toHaveText('11');
    await expect(page.locator(`[data-page-id="${duplicate.page_id}"] img`)).toBeVisible({ timeout: 30_000 });
    assertNoBrowserIssues();
  });

  test('adds a server-derived blank page after the selection with undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const initialIds = payload.vdm.pages.map((item: { page_id: string }) => item.page_id);
    const selectedId = initialIds[1];
    await page.locator(`[data-page-id="${selectedId}"]`).click();
    const result = await waitForCommand(page, () =>
      page.getByRole('button', { name: 'Add blank page' }).click()
    );
    expect(result.vdm.page_count).toBe(11);
    const blank = result.vdm.pages.find(
      (item: { page_id: string; is_blank: boolean }) => item.is_blank && !initialIds.includes(item.page_id)
    );
    expect(blank).toBeTruthy();
    expect(blank.page_id).not.toBe(selectedId);
    expect(blank.source_asset_id == null).toBe(true);
    expect(blank.rotation).toBe(0);
    const blankIndex = result.vdm.pages.findIndex((item: { page_id: string }) => item.page_id === blank.page_id);
    expect(blankIndex).toBe(2);
    await expect(page.getByTestId('studio-page-count')).toHaveText('11');
    await expect(page.locator(`[data-page-id="${blank.page_id}"]`)).toHaveAttribute('data-page-blank', 'true');
    await expect(page.locator(`[data-page-id="${blank.page_id}"] img`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`[data-page-id="${blank.page_id}"]`)).toHaveClass(/ring-2/);

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-page-count')).toHaveText('10');
    await expect(page.locator(`[data-page-id="${blank.page_id}"]`)).toHaveCount(0);
    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-page-count')).toHaveText('11');
    await expect(page.locator(`[data-page-id="${blank.page_id}"] img`)).toBeVisible({ timeout: 30_000 });
    assertNoBrowserIssues();
  });
});
