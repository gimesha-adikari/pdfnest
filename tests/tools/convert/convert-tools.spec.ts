import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader, assertValidZip, assertValidOfficeDocument, assertTextContains } from '../../helpers/assertions';

test.describe('Convert Category Tools (PDF -> Other Formats)', () => {

  test('PDF to Text: extracts raw text from PDF document (async)', async ({ page }) => {
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

  test('PDF to Images: converts PDF pages to image zip / files', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-images');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    // Output could be a ZIP archive or single image
    expect(result.buffer.length).toBeGreaterThan(100);
  });

  test('PDF to Word: converts PDF to editable Word DOCX', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-word');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidOfficeDocument(result.buffer);
  });

  test('PDF to Excel: converts PDF tables to Excel XLSX', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-excel');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidOfficeDocument(result.buffer);
  });

  test('PDF to PowerPoint: converts PDF pages to PPTX slides', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-powerpoint');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidOfficeDocument(result.buffer);
  });

});
