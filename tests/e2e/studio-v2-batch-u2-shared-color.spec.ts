import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function uploadBlank(page: Page) {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'u2-color.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  await page.locator(`[data-page-id="${payload.vdm.pages[0].page_id}"]`).click();
}

function monitorBrowser(page: Page) {
  const errors: string[] = [];
  const legacyCalls: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
  page.on('request', (request) => { if (/\/api\/(markup|structure|edit|v1)\//.test(request.url())) legacyCalls.push(request.url()); });
  return () => {
    expect(errors).toEqual([]);
    expect(legacyCalls).toEqual([]);
  };
}

test.describe('Studio V2 Batch U2 shared color control', () => {
  test('supports presets, validated custom hex, keyboard close, and anchored positioning', async ({ page }) => {
    const assertBrowserHealthy = monitorBrowser(page);
    await uploadBlank(page);
    const trigger = page.getByTestId('studio-add-text-color');
    await trigger.click();
    const picker = page.getByRole('dialog', { name: 'Add Text color options' });
    await expect(picker).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const pickerBox = await picker.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(pickerBox).not.toBeNull();
    expect(Math.abs(pickerBox!.x - triggerBox!.x)).toBeLessThan(400);
    expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox!.y).toBeGreaterThanOrEqual(0);

    await page.getByRole('button', { name: 'Green, #008000' }).click();
    await expect(trigger).toContainText('#008000');
    await page.getByLabel('Add Text color custom hex').fill('#12GG44');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Use a valid hex color such as #33AAFF.')).toBeVisible();
    await expect(trigger).toContainText('#008000');
    await page.getByLabel('Add Text color custom hex').fill('#3af');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(trigger).toContainText('#33AAFF');
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(trigger).toBeFocused();
    assertBrowserHealthy();
  });
});
