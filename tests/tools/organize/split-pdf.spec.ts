import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Split PDF Tool', () => {
  test('extracts specific pages from a PDF document', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'split-pdf');
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
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});
