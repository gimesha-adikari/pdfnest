import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);

async function uploadRealPdf(page: Page, fixturePath = FIXTURE_PATH) {
  await authenticateProUser(page);
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/studio/v1/sessions/from-upload') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const response = await uploadResponse;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText(path.basename(fixturePath), { exact: false })).toBeVisible();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
  return payload;
}

function monitor(page: Page) {
  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  return (expectedClientErrors = 0) => {
    expect(errors.filter((error) => error.includes('status of 400 (Bad Request)'))).toHaveLength(expectedClientErrors);
    expect(errors.filter((error) => !error.includes('status of 400 (Bad Request)'))).toEqual([]);
    expect(serverErrors).toEqual([]);
  };
}

async function waitForTileShape(page: Page, selector: string, rotated: boolean) {
  await expect.poll(
    () => page.locator(selector).evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
    { timeout: 30_000 }
  ).toEqual(expect.objectContaining({
    complete: true,
    ...(rotated ? { width: expect.any(Number) } : {}),
  }));
  await expect.poll(async () => {
    const shape = await page.locator(selector).evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    return rotated ? shape.width > shape.height : shape.height > shape.width;
  }, { timeout: 30_000 }).toBe(true);
}

test.describe('Studio V2 Batch 2A user-facing page controls', () => {
  test('rotates the selected page through the UI and preserves undo/redo', async ({ page }) => {
    const assertNoErrors = monitor(page);
    const beforeMetrics = await page.request.get(`${BACKEND_URL}/studio/v1/metrics`).then((response) => response.json());
    const payload = await uploadRealPdf(page);
    expect(payload.vdm.page_count).toBe(10);
    const firstPageId = payload.vdm.pages[0].page_id as string;

    await page.getByRole('button', { name: 'Organize', exact: true }).click();
    await page.locator(`[data-page-id="${firstPageId}"]`).click();
    const rotateButton = page.getByRole('button', { name: 'Rotate clockwise 90°' });
    await expect(rotateButton).toBeEnabled();

    const commandResponse = page.waitForResponse(
      (response) => response.url().includes('/commands') && response.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await rotateButton.click();
    const command = await commandResponse;
    expect(command.status()).toBe(200);
    const commandPayload = await command.json();
    expect(commandPayload.vdm.pages[0].rotation).toBe(90);
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
    await waitForTileShape(page, `main [data-page-id="${firstPageId}"] img`, true);

    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByText('Version 0', { exact: true })).toBeVisible();
    await waitForTileShape(page, `main [data-page-id="${firstPageId}"] img`, false);

    const redo = page.getByRole('button', { name: 'Redo' });
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
    await waitForTileShape(page, `main [data-page-id="${firstPageId}"] img`, true);

    const afterMetrics = await page.request.get(`${BACKEND_URL}/studio/v1/metrics`).then((response) => response.json());
    expect(afterMetrics.underlying_renders).toBeGreaterThan(beforeMetrics.underlying_renders);
    // Metrics are renderer/session-global and may include an earlier unrelated
    // request. The Rotate operation itself must not add render failures.
    expect(afterMetrics.render_errors - beforeMetrics.render_errors).toBe(0);
    expect(afterMetrics.worker_timeouts - beforeMetrics.worker_timeouts).toBe(0);
    assertNoErrors();
  });

  test('deletes the selected page, selects the next page, and rejects deleting the final page', async ({ page }) => {
    const assertNoErrors = monitor(page);
    const payload = await uploadRealPdf(page);
    const deletedPageId = payload.vdm.pages[1].page_id as string;
    const nextPageId = payload.vdm.pages[2].page_id as string;
    await page.getByRole('button', { name: 'Organize', exact: true }).click();
    await page.locator(`[data-page-id="${deletedPageId}"]`).click();

    const deleteButton = page.getByRole('button', { name: 'Delete selected page' });
    await expect(deleteButton).toBeEnabled();
    const commandResponse = page.waitForResponse(
      (response) => response.url().includes('/commands') && response.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await deleteButton.click();
    const command = await commandResponse;
    expect(command.status()).toBe(200);
    const commandPayload = await command.json();
    expect(commandPayload.vdm.page_count).toBe(9);
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
    await expect(page.locator('main [data-page-id]')).toHaveCount(9);
    await expect(page.locator(`main [data-page-id="${deletedPageId}"]`)).toHaveCount(0);
    await expect(page.locator(`main [data-page-id="${nextPageId}"]`)).toHaveClass(/ring-2/);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('main [data-page-id]')).toHaveCount(10);
    await expect(page.locator(`main [data-page-id="${deletedPageId}"]`)).toHaveCount(1);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.locator('main [data-page-id]')).toHaveCount(9);

    // The backend rejects deleting the final page; the UI surfaces that 400 without local mutation.
    const onePageFixture = path.resolve(
      __dirname,
      '../../../benchmarks/rendering/corpus/standard_a4_1p.pdf'
    );
    const onePage = await uploadRealPdf(page, onePageFixture);
    const onePageId = onePage.vdm.pages[0].page_id as string;
    await page.getByRole('button', { name: 'Organize', exact: true }).click();
    await page.locator(`[data-page-id="${onePageId}"]`).click();
    const rejectedCommand = page.waitForResponse(
      (response) => response.url().includes('/commands') && response.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await page.getByRole('button', { name: 'Delete selected page' }).click();
    expect((await rejectedCommand).status()).toBe(400);
    await expect(page.locator('div[role="alert"]').filter({ hasText: /delete|page/i })).toContainText(/delete|page/i);
    await expect(page.locator('main [data-page-id]')).toHaveCount(1);
    assertNoErrors(1);
  });
});
