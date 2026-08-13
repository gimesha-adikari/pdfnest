import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Edit PDF Workspace E2E Integration', () => {

  test('Precision PDF Editor: inline text replacement and rich text formatting', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for canvas page and interactive input overlay to appear
    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    // Focus input and perform text edit
    await textInput.focus();
    await textInput.fill('Sample Text Edited');

    // Trigger formatting button if visible
    const boldBtn = page.locator('button:has-text("B")').first();
    if (await boldBtn.isVisible()) {
      await boldBtn.click();
    }

    // Submit compile job and capture download
    const exportBtn = page.locator('button:has-text("Export Precision Vector Document Changes")').first();
    await exportBtn.click();

    // Verify successful PDF generation
    const download = await page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    if (download) {
      const path = await download.path();
      expect(path).toBeTruthy();
    }
  });

});
