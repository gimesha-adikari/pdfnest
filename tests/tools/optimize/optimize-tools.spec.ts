import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader, assertPdfPageCount } from '../../helpers/assertions';

test.describe('Optimize Category Tools', () => {

  test('Compress PDF: optimizes PDF size while preserving pages', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'compress-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
    await assertPdfPageCount(result.buffer, 3);
  });

  test('Grayscale PDF: converts PDF color palette to grayscale', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'grayscale-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
    await assertPdfPageCount(result.buffer, 3);
  });

  test('Repair PDF: fixes corrupted or damaged PDF structures', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'repair-pdf');
    const result = await helper.runSyncTool(FIXTURES.SAMPLE_PDF);
    assertValidPdfHeader(result.buffer);
  });

});
