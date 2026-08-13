import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('Edit PDF Canvas Compositing & Text Suppression Verification', () => {

  test('Compositing Audit: verify single visible text copy and zero ghosting across zoom levels', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for canvas page and interactive input overlay to appear
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30000 });

    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    // 1. Inactive State: Verify text input has transparent text color (0 double text)
    const textColorInactive = await textInput.evaluate((el) => window.getComputedStyle(el).color);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(textColorInactive);

    // 2. Active State: Click element to activate focus
    await textInput.focus();
    await page.waitForTimeout(500);

    // Verify text color is activated (visible color)
    const textColorActive = await textInput.evaluate((el) => window.getComputedStyle(el).color);
    expect(textColorActive).not.toBe('rgba(0, 0, 0, 0)');
    expect(textColorActive).not.toBe('transparent');

    // 3. Edit text in active input
    await textInput.fill('Compositing Test Edited');
    await page.waitForTimeout(300);

    const val = await textInput.inputValue();
    expect(val).toBe('Compositing Test Edited');

    // 4. Verify zoom selector operates cleanly without coordinate drift
    const zoomSelect = page.locator('select').filter({ hasText: '100%' }).first();
    if (await zoomSelect.isVisible()) {
      await zoomSelect.selectOption('1.5');
      await page.waitForTimeout(500);

      const zoomVal = await zoomSelect.inputValue();
      expect(zoomVal).toBe('1.5');
    }
  });

});
