import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('Edit PDF Active Editing Surface Verification', () => {

  test('Editing Surface Audit: verify solid white editing surface when active and transparent when inactive', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for canvas page and interactive input overlay to appear
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 30000 });

    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    // 1. Inactive State: Verify text input background is transparent
    const bgStyleInactive = await textInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleInactive);

    // 2. Active State: Click element to activate focus
    await textInput.focus();
    await page.waitForTimeout(500);

    // Verify background becomes solid white (#ffffff)
    const bgStyleActive = await textInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgb(255, 255, 255)', '#ffffff']).toContain(bgStyleActive);

    // 3. Edit text in active input
    await textInput.fill('Active Surface Test');
    await page.waitForTimeout(300);

    const val = await textInput.inputValue();
    expect(val).toBe('Active Surface Test');

    // 4. Deselect: Click canvas container to blur focus
    await canvas.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);

    // Verify background reverts to transparent
    const bgStyleDeselected = await textInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bgStyleDeselected);
  });

});
