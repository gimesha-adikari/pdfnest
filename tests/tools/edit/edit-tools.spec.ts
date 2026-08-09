import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Edit Category Tools', () => {

  test('Watermark PDF: adds watermark to PDF pages', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'watermark-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Add Page Numbers: inserts page numbers into PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'add-page-numbers');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Edit Metadata: modifies document metadata properties', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-metadata');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Add Text: places custom text annotations on PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'add-text');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    
    const addBoxBtn = page.locator('button:has-text("Add Box")').first();
    if (await addBoxBtn.isVisible()) {
      await addBoxBtn.click();
    }
    const textInput = page.locator('input[type="text"]').first();
    if (await textInput.isVisible()) {
      await textInput.fill('Sample Text');
    }

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Highlight PDF: adds highlight annotations to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'highlight-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const modeSelect = page.locator('select').first();
    if (await modeSelect.isVisible()) {
      await modeSelect.selectOption('manual');
    }

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 150);
      await page.mouse.up();
    }

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Underline PDF: adds underline annotations to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'underline-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const modeSelect = page.locator('select').first();
    if (await modeSelect.isVisible()) {
      await modeSelect.selectOption('manual');
    }

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 150);
      await page.mouse.up();
    }

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Strikeout PDF: adds strikeout annotations to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'strikeout-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const modeSelect = page.locator('select').first();
    if (await modeSelect.isVisible()) {
      await modeSelect.selectOption('manual');
    }

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 150);
      await page.mouse.up();
    }

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Sign PDF: adds electronic signature to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'sign-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const canvases = page.locator('canvas');
    const sigCanvas = canvases.last();
    await sigCanvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await sigCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + 50);
      await page.mouse.up();
    }

    await page.waitForTimeout(1000);
    const addStampBtn = page.locator('button:has-text("Add Signature to Page")').first();
    await addStampBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addStampBtn.click();

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('PDF Editor: full canvas editing workspace', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const exportBtn = page.locator('button:has-text("Export Precision Vector Document Changes")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 15000 });
    await expect(exportBtn).toBeEnabled({ timeout: 15000 });
    await exportBtn.click();

    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

});
