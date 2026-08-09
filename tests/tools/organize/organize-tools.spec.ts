import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Organize Category Tools', () => {

  test('Rotate PDF: rotates pages and outputs valid PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'rotate-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const rotateAllBtn = page.locator('button:has-text("Rotate All 90°")').first();
    await rotateAllBtn.waitFor({ state: 'visible', timeout: 15000 });
    await rotateAllBtn.click();

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Delete Pages: removes selected pages from PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'delete-pages');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await page.waitForTimeout(2000);
    const pageCard = page.locator('button:has-text("Pg 1")').first();
    await pageCard.waitFor({ state: 'visible', timeout: 15000 });
    await pageCard.click();

    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Reorder Pages: changes sequence of pages in PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'reorder-pages');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Crop PDF: crops page boundaries and returns PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'crop-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Duplicate Pages: clones selected pages in PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'duplicate-pages');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

  test('Insert Blank Pages: appends empty pages to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'insert-blank-pages');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

});
