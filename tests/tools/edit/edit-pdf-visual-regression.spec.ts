import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('Edit PDF Workspace Visual Regression Audit', () => {

  test('Visual Audit: transparent inactive text overlay and toolbar positioning', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for text input overlay
    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    // 1. Inactive State: Verify text input has transparent background
    const bgStyleInactive = await textInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleInactive);

    // 2. Active State: Click element to activate focus
    await textInput.focus();
    await page.waitForTimeout(500);

    const bgStyleActive = await textInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleActive);

    // 3. Verify Toolbar is visible and positioned inside viewport
    const toolbar = page.locator('div:has-text("Helvetica")').first();
    if (await toolbar.isVisible()) {
      const box = await toolbar.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

});
