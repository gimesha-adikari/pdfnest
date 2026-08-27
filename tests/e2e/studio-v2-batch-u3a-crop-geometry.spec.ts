import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'fs/promises';
import path from 'path';

const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

async function uploadRealPdf(page: Page) {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
  return payload;
}

async function applyCrop(page: Page) {
  const responsePromise = page.waitForResponse((response) => response.url().includes('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-crop').click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe('Studio V2 Batch U3A direct Crop geometry', () => {
  test('keeps numeric and visual Crop drafts synchronized and supports move, edge, and corner handles', async ({ page }) => {
    const payload = await uploadRealPdf(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    const tile = page.locator(`main [data-page-id="${pageId}"]`);
    await tile.click();

    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    const overlay = page.getByTestId(`studio-crop-overlay-${pageId}`);
    await expect(overlay).toBeVisible();
    const before = await overlay.boundingBox();
    expect(before).not.toBeNull();

    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 + 20, before!.y + before!.height / 2 + 15);
    await page.mouse.up();
    await expect(page.getByTestId('studio-crop-llx')).not.toHaveValue('100');
    await expect(page.getByTestId('studio-crop-lly')).not.toHaveValue('100');

    const rightHandle = page.getByRole('button', { name: 'Resize crop right edge' });
    const rightBox = await rightHandle.boundingBox();
    expect(rightBox).not.toBeNull();
    await page.mouse.move(rightBox!.x + rightBox!.width / 2, rightBox!.y + rightBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(rightBox!.x + rightBox!.width / 2 + 12, rightBox!.y + rightBox!.height / 2);
    await page.mouse.up();
    await expect(page.getByTestId('studio-crop-urx')).not.toHaveValue('450');

    const corner = page.getByRole('button', { name: 'Resize crop bottom right' });
    const cornerBox = await corner.boundingBox();
    expect(cornerBox).not.toBeNull();
    await page.mouse.move(cornerBox!.x + cornerBox!.width / 2, cornerBox!.y + cornerBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(cornerBox!.x - 10, cornerBox!.y - 10);
    await page.mouse.up();
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId('studio-apply-crop')).toBeEnabled();
  });

  test('submits explicit current, all, and custom page targets through the typed command', async ({ page }) => {
    const payload = await uploadRealPdf(page);
    const pageIds = payload.vdm.pages.map((entry: { page_id: string }) => entry.page_id);
    await page.locator(`main [data-page-id="${pageIds[0]}"]`).click();

    await page.getByTestId('studio-crop-target-all').click();
    const allResult = await applyCrop(page);
    expect(allResult.operation.parameters.page_ids).toEqual(pageIds);

    await page.getByTestId('studio-crop-target-custom').click();
    await page.getByTestId('studio-crop-custom-pages').fill('1, 3-4');
    const customResult = await applyCrop(page);
    expect(customResult.operation.parameters.page_ids).toEqual([pageIds[0], pageIds[2], pageIds[3]]);
  });

  test('maps the same visible crop intent to canonical CropBox coordinates at 0, 90, 180, and 270 degrees', async ({ page }) => {
    const payload = await uploadRealPdf(page);
    const pageIds = payload.vdm.pages.map((entry: { page_id: string }) => entry.page_id);
    const expectedRotations = [0, 90, 180, 270];

    for (const [index, expectedRotation] of expectedRotations.entries()) {
      const tile = page.locator(`main [data-page-id="${pageIds[index]}"]`);
      await tile.click();
      for (let turn = 0; turn < index; turn += 1) {
        const responsePromise = page.waitForResponse((response) => response.url().includes('/commands') && response.request().method() === 'POST');
        await page.getByTestId('studio-rotate-clockwise').click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
      }
      await page.getByTestId('studio-crop-llx').fill('100');
      await page.getByTestId('studio-crop-lly').fill('100');
      await page.getByTestId('studio-crop-urx').fill('450');
      await page.getByTestId('studio-crop-ury').fill('700');
      const result = await applyCrop(page);
      expect(result.vdm.pages[index].rotation).toBe(expectedRotation);
      expect(result.vdm.pages[index].crop_box).toEqual([100, 100, 450, 700]);
    }
  });

  test('keeps pointer deltas in PDF points when zoom changes', async ({ page }) => {
    const payload = await uploadRealPdf(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`main [data-page-id="${pageId}"]`).click();
    const setDraft = async () => {
      await page.getByTestId('studio-crop-llx').fill('100');
      await page.getByTestId('studio-crop-lly').fill('100');
      await page.getByTestId('studio-crop-urx').fill('450');
      await page.getByTestId('studio-crop-ury').fill('700');
    };
    const dragVisibleDistance = async (distance: number) => {
      const box = await page.getByTestId(`studio-crop-overlay-${pageId}`).boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2 + distance, box!.y + box!.height / 2);
      await page.mouse.up();
    };

    await setDraft();
    await dragVisibleDistance(18);
    const firstDelta = Number(await page.getByTestId('studio-crop-llx').inputValue()) - 100;
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await setDraft();
    await dragVisibleDistance(22);
    const secondDelta = Number(await page.getByTestId('studio-crop-llx').inputValue()) - 100;
    expect(Math.abs(firstDelta - secondDelta)).toBeLessThan(3);
  });

  test('exports the committed CropBox after Apply', async ({ page }) => {
    const payload = await uploadRealPdf(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`main [data-page-id="${pageId}"]`).click();
    await page.getByTestId('studio-crop-llx').fill('100');
    await page.getByTestId('studio-crop-lly').fill('100');
    await page.getByTestId('studio-crop-urx').fill('450');
    await page.getByTestId('studio-crop-ury').fill('700');
    const result = await applyCrop(page);
    expect(result.vdm.pages[0].crop_box).toEqual([100, 100, 450, 700]);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const pdf = await PDFDocument.load(await readFile(filePath!));
    const crop = pdf.getPages()[0].getCropBox();
    expect(crop.x).toBeCloseTo(100, 2);
    expect(crop.y).toBeCloseTo(100, 2);
    expect(crop.width).toBeCloseTo(350, 2);
    expect(crop.height).toBeCloseTo(600, 2);
  });
});
