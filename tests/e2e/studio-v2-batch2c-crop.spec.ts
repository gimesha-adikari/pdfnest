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
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
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

test.describe('Studio V2 Batch 2C crop', () => {
  test('crops a real page through the UI, changes the preview, and supports undo/redo', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadRealPdf(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    const tile = page.locator(`main [data-page-id="${pageId}"]`);

    await tile.click();
    await expect(page.getByTestId('studio-apply-crop')).toBeEnabled();
    await expect(tile).toHaveAttribute('data-page-visible-width-pt', '595.28');
    await expect(tile).toHaveAttribute('data-page-visible-height-pt', '841.89');
    const originalImage = page.locator(`main [data-page-id="${pageId}"] img`);
    await expect(originalImage).toBeVisible({ timeout: 30_000 });
    const originalNatural = await originalImage.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
    }));
    expect(originalNatural.height).toBeGreaterThan(originalNatural.width);

    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    const result = await waitForCommand(page, () => page.getByTestId('studio-apply-crop').click());
    expect(result.operation.operation_name).toBe('crop_page');
    expect(result.vdm.pages[0].crop_box).toEqual([100, 100, 450, 700]);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(tile).toHaveClass(/ring-2/);
    await expect(tile).toHaveAttribute('data-page-visible-width-pt', '350');
    await expect(tile).toHaveAttribute('data-page-visible-height-pt', '600');
    const croppedImage = page.locator(`main [data-page-id="${pageId}"] img`);
    await expect(croppedImage).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => croppedImage.evaluate((img: HTMLImageElement) => {
      const shape = {
      width: img.naturalWidth,
      height: img.naturalHeight,
      };
      return shape.width > 0 && shape.height > 0 && Math.abs(shape.height / shape.width - 600 / 350) < 0.02;
    }), { timeout: 30_000 }).toBe(true);

    await waitForUndoRedo(page, 'undo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
    await expect(tile).toHaveAttribute('data-page-visible-width-pt', '595.28');
    await expect(tile).toHaveAttribute('data-page-visible-height-pt', '841.89');
    await expect(page.locator(`main [data-page-id="${pageId}"] img`)).toBeVisible({ timeout: 30_000 });

    await waitForUndoRedo(page, 'redo');
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    await expect(tile).toHaveAttribute('data-page-visible-width-pt', '350');
    await expect(tile).toHaveAttribute('data-page-visible-height-pt', '600');
    await expect(page.locator(`main [data-page-id="${pageId}"] img`)).toBeVisible({ timeout: 30_000 });
    assertNoBrowserIssues();
  });
});
