import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('Phase 10.2.7 Real Visual Compositing Audit', () => {

  test('Compositing Audit: verify rendering stack, occlusion bounds, neighboring text, and toolbar placement', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for canvas page and interactive input overlay to appear
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30000 });

    const textInputs = page.locator('input[type="text"]');
    const inputCount = await textInputs.count();
    expect(inputCount).toBeGreaterThan(0);

    const firstInput = textInputs.first();

    // 1. Inactive State: Verify text input has transparent background
    const bgStyleInactive = await firstInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleInactive);

    // 2. Active State: Click element to activate focus
    await firstInput.focus();
    await page.waitForTimeout(500);

    // 3. Measure Active Input Bounding Rectangle
    const activeBox = await firstInput.boundingBox();
    expect(activeBox).toBeTruthy();

    const bgStyleActive = await firstInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgb(255, 255, 255)', '#ffffff']).toContain(bgStyleActive);

    // 4. Verify neighboring inputs remain transparent (unoccluded)
    if (inputCount > 1) {
      const secondInput = textInputs.nth(1);
      const bgStyleSecond = await secondInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleSecond);
    }

    // 5. Verify Toolbar is positioned outside active text box
    const toolbar = page.locator('div:has-text("Helvetica")').first();
    if (await toolbar.isVisible()) {
      const toolbarBox = await toolbar.boundingBox();
      expect(toolbarBox).toBeTruthy();
      if (toolbarBox && activeBox) {
        // Toolbar should not cover the active input text rect
        const overlaps = !(
          toolbarBox.x + toolbarBox.width < activeBox.x ||
          toolbarBox.x > activeBox.x + activeBox.width ||
          toolbarBox.y + toolbarBox.height < activeBox.y ||
          toolbarBox.y > activeBox.y + activeBox.height
        );
        expect(overlaps).toBe(false);
      }
    }
  });

});
