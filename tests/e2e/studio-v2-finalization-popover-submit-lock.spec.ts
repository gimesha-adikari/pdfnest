import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

async function uploadStudioDocument(page: Page) {
  await authenticateProUser(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_PATH);
  expect((await upload).status()).toBe(201);
  await expect(page.locator('main [data-page-id]').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(page.getByTestId('studio-version')).toHaveText('Version 0');
}

async function assertAnchoredPopover(page: Page, triggerName: string, dialogName: string) {
  const trigger = page.getByRole('button', { name: triggerName });
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  const triggerBottom = triggerBox!.y + triggerBox!.height;
  const isBelow = Math.abs(dialogBox!.y - (triggerBottom + 8)) <= 24;
  const isAbove = Math.abs((dialogBox!.y + dialogBox!.height) - (triggerBox!.y - 8)) <= 24;
  expect(isBelow || isAbove).toBe(true);
  expect(dialogBox!.x < triggerBox!.x + triggerBox!.width).toBe(true);
  expect(dialogBox!.x + dialogBox!.width > triggerBox!.x).toBe(true);
  return { trigger, dialog, triggerBox: triggerBox!, dialogBox: dialogBox! };
}

async function dispatchTwoClicksSynchronously(locator: ReturnType<Page['getByRole']>) {
  await locator.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
}

async function openCompressPanel(page: Page) {
  const direct = page.getByRole('button', { name: 'Compress PDF' });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  await page.getByRole('button', { name: 'More document tools' }).click();
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
}

test.describe('Studio V2 F1 finalization hotfix', () => {
  test('anchors Merge/Split and Watermark to their visible toolbar triggers and preserves attachment through zoom/scroll', async ({ page }) => {
    await uploadStudioDocument(page);

    const merge = await assertAnchoredPopover(page, 'Merge and Split PDF', 'Merge and Split PDF');
    await page.keyboard.press('Escape');
    await expect(merge.dialog).toHaveCount(0);
    await expect(merge.trigger).toBeFocused();

    await assertAnchoredPopover(page, 'Watermark PDF', 'Watermark PDF');
    const offset = await page.evaluate(() => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Watermark PDF"]')!;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Watermark PDF"]')!;
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      return { x: dialogRect.x - triggerRect.x, y: dialogRect.y - triggerRect.y };
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toHaveCount(0);
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    for (let index = 0; index < 9; index += 1) await zoomIn.click();
    await assertAnchoredPopover(page, 'Watermark PDF', 'Watermark PDF');
    await page.locator('main .overflow-auto').first().evaluate((element) => { element.scrollTop = 240; });
    await expect.poll(async () => page.evaluate(() => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Watermark PDF"]')!;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Watermark PDF"]')!;
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      return { x: dialogRect.x - triggerRect.x, y: dialogRect.y - triggerRect.y };
    })).toEqual(offset);
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(async () => page.evaluate(() => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Watermark PDF"]')!;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Watermark PDF"]')!;
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      return {
        below: Math.abs(dialogRect.y - (triggerRect.bottom + 8)) <= 24,
        inside: dialogRect.left >= 12 && dialogRect.right <= window.innerWidth - 12,
      };
    })).toEqual({ below: true, inside: true });
    await page.getByRole('button', { name: 'Page Numbers' }).click();
    await expect(page.getByRole('dialog', { name: 'Watermark PDF' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Page Numbers' })).toBeFocused();
  });

  test('keeps large panels inside the viewport and anchors mobile More surfaces to More', async ({ page }) => {
    await uploadStudioDocument(page);
    await page.setViewportSize({ width: 1100, height: 900 });
    const merge = await assertAnchoredPopover(page, 'Merge and Split PDF', 'Merge and Split PDF');
    const mergeBox = await merge.dialog.boundingBox();
    expect(mergeBox).not.toBeNull();
    expect(mergeBox!.x).toBeGreaterThanOrEqual(12);
    expect(mergeBox!.x + mergeBox!.width).toBeLessThanOrEqual(1088);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 800, height: 900 });
    const more = page.getByRole('button', { name: 'More document tools' });
    const moreBox = await more.boundingBox();
    expect(moreBox).not.toBeNull();
    await more.click();
    const moreDialog = page.getByRole('dialog', { name: 'More document tools' });
    await expect(moreDialog).toBeVisible();
    await moreDialog.getByRole('button', { name: 'Watermark', exact: true }).click();
    const watermarkDialog = page.getByRole('dialog', { name: 'Watermark PDF' });
    await expect(watermarkDialog).toBeVisible();
    const watermarkBox = await watermarkDialog.boundingBox();
    expect(watermarkBox).not.toBeNull();
    expect(Math.abs(watermarkBox!.y - (moreBox!.y + moreBox!.height + 8)) <= 24).toBe(true);
    expect(watermarkBox!.x).toBeGreaterThanOrEqual(12);
    expect(watermarkBox!.x + watermarkBox!.width).toBeLessThanOrEqual(788);
  });

  test('counts exactly one materialization request for synchronous duplicate Compress activation', async ({ page }) => {
    await uploadStudioDocument(page);
    await openCompressPanel(page);
    const apply = page.getByRole('button', { name: /Apply Compress|Retry Compress/ });
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/materializations') && request.method() === 'POST') requests += 1;
    });
    const response = page.waitForResponse((item) => item.url().endsWith('/materializations') && item.request().method() === 'POST');
    await dispatchTwoClicksSynchronously(apply);
    expect((await response).status()).toBe(200);
    expect(requests).toBe(1);
  });

  test('counts exactly one command request for rapid keyboard Rotate activation', async ({ page }) => {
    await uploadStudioDocument(page);
    await page.getByRole('button', { name: 'Organize', exact: true }).click();
    const pageTile = page.locator('main [data-page-id]').first();
    await pageTile.click();
    const rotate = page.getByRole('button', { name: 'Rotate clockwise 90°' });
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/commands') && request.method() === 'POST') requests += 1;
    });
    const response = page.waitForResponse((item) => item.url().includes('/commands') && item.request().method() === 'POST');
    await Promise.all([rotate.press('Enter'), rotate.press('Enter')]);
    expect((await response).status()).toBe(200);
    expect(requests).toBe(1);
    await expect(rotate).toBeEnabled();
    const nextResponse = page.waitForResponse((item) => item.url().includes('/commands') && item.request().method() === 'POST');
    await rotate.click();
    expect((await nextResponse).status()).toBe(200);
    expect(requests).toBe(2);
  });

  test('counts exactly one markup job request for synchronous duplicate Apply activation', async ({ page }) => {
    await uploadStudioDocument(page);
    await page.locator('main [data-page-id]').first().click();
    await page.getByRole('button', { name: 'Annotate', exact: true }).click();
    await page.getByTestId('studio-markup-action-highlight').click();
    const tile = page.locator('main [data-page-id]').first();
    await tile.scrollIntoViewIfNeeded();
    const bounds = await tile.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.12, bounds!.y + bounds!.height * 0.16);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.58, bounds!.y + bounds!.height * 0.28);
    await page.mouse.up();
    const apply = page.getByTestId('studio-markup-apply');
    await expect(apply).toBeEnabled();
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/jobs') && request.method() === 'POST') requests += 1;
    });
    const response = page.waitForResponse((item) => item.url().endsWith('/jobs') && item.request().method() === 'POST');
    await dispatchTwoClicksSynchronously(apply);
    expect((await response).status()).toBe(202);
    expect(requests).toBe(1);
  });

  test('releases the materialization guard after failure and permits one intentional retry', async ({ page }) => {
    await uploadStudioDocument(page);
    await openCompressPanel(page);
    const apply = page.getByRole('button', { name: /Apply Compress|Retry Compress/ });
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/materializations') && request.method() === 'POST') requests += 1;
    });
    await page.route('**/studio/v1/sessions/*/materializations', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forced F1R failure' }),
    }));
    const failed = page.waitForResponse((item) => item.url().endsWith('/materializations') && item.request().method() === 'POST');
    await apply.click();
    expect((await failed).status()).toBe(500);
    expect(requests).toBe(1);
    await expect(apply).toBeEnabled();
    await page.unroute('**/studio/v1/sessions/*/materializations');
    const retry = page.waitForResponse((item) => item.url().endsWith('/materializations') && item.request().method() === 'POST');
    await apply.click();
    expect((await retry).status()).toBe(200);
    expect(requests).toBe(2);
  });
});
