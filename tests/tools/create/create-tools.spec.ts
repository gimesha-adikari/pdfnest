import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Create Category Tools (Other Formats -> PDF)', () => {

  test('Images to PDF: compiles graphic images into PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'images-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PNG);
    assertValidPdfHeader(result.buffer);
  });

  test('Image to Searchable PDF (OCR): runs OCR on images to create searchable PDF', async ({ page }) => {
    test.setTimeout(180_000);
    const helper = new PdfToolHelper(page, 'image-to-searchable-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PNG);
    await helper.clickAction('Create Searchable PDF');
    await helper.waitForAsyncComplete(150_000);
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Word to PDF: converts DOCX to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'word-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_DOCX);
    assertValidPdfHeader(result.buffer);
  });

  test('Excel to PDF: converts XLSX to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'excel-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_XLSX);
    assertValidPdfHeader(result.buffer);
  });

  test('PowerPoint to PDF: converts PPTX to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'powerpoint-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PPTX);
    assertValidPdfHeader(result.buffer);
  });

  test('Markdown to PDF: converts Markdown document to PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'markdown-to-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_MD);
    await helper.clickAction();
    await helper.waitForAsyncComplete(120_000);
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

  test('Code to PDF: converts source code files to formatted PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'code-to-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PY);
    assertValidPdfHeader(result.buffer);
  });

  test('URL to PDF: captures web page rendering into PDF document', async ({ page }) => {
    test.setTimeout(180_000);
    const helper = new PdfToolHelper(page, 'url-to-pdf');
    await helper.navigateToTool();
    await helper.submitUrl('https://example.com');
    await page.waitForTimeout(2000);
    await helper.waitForAsyncComplete(150_000);
    const result = await helper.captureDownload();
    assertValidPdfHeader(result.buffer);
  });

});
