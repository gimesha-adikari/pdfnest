import { test, expect } from '@playwright/test';
import { PdfToolHelper } from './helpers/pdf-tool';
import { FIXTURES } from './helpers/fixtures';
import { assertValidPdfHeader, assertPdfPageCount, assertValidOfficeDocument, assertTextContains } from './helpers/assertions';

test.describe('PDFNest Smoke Test Suite (Representative Full-Stack Operations)', () => {

  test('1. Sync PDF Processing: Compress PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'compress-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);

    assertValidPdfHeader(result.buffer);
    await assertPdfPageCount(result.buffer, 3);
    expect(result.suggestedFileName).toMatch(/\.pdf$/i);
  });

  test('2. Async Task Processing: PDF to Text', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-text');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    await helper.clickAction();
    await helper.waitForAsyncComplete();
    const result = await helper.captureDownload();

    expect(result.buffer.length).toBeGreaterThan(10);
    const textOutput = result.buffer.toString('utf-8');
    assertTextContains(textOutput, ['PDFNEST_TEST_PAGE_1']);
  });

  test('3. Image Creation: Images to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'images-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PNG);

    assertValidPdfHeader(result.buffer);
    await assertPdfPageCount(result.buffer, 1);
  });

  test('4. Security Encryption: Protect PDF (Lock)', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'lock-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('smoke123');
    
    const confirmInput = page.locator('input[type="password"]').nth(1);
    if (await confirmInput.isVisible()) {
      await confirmInput.fill('smoke123');
    }

    await helper.clickAction(); // auto-detects "Protect PDF" button
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();

    assertValidPdfHeader(result.buffer);
  });

  test('5. Office Conversion: Word to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'word-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_DOCX);

    assertValidPdfHeader(result.buffer);
  });

});
