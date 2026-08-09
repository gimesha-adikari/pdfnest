import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader, assertPdfPageCount } from '../../helpers/assertions';

test.describe('Merge PDF Tool', () => {
  test('combines multiple PDF files into one PDF document', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'merge-pdf');
    await helper.navigateToTool();
    await helper.uploadFiles([FIXTURES.SAMPLE_PDF, FIXTURES.SAMPLE_PDF_2]);
    await helper.clickAction();
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();

    assertValidPdfHeader(result.buffer);
    // 3 pages + 1 page = 4 pages
    await assertPdfPageCount(result.buffer, 4);
  });
});
