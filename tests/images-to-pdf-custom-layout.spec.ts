import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Images to PDF Custom Layout & Interaction Suite', () => {

  test('Verify Custom Canvas Layout, Selection Persistence, Property Editing, and Dragging', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Create 2 temporary PNG images
    const tmpPngPath1 = path.resolve(process.cwd(), 'tests/fixtures/tmp_canvas_1.png');
    const tmpPngPath2 = path.resolve(process.cwd(), 'tests/fixtures/tmp_canvas_2.png');
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(tmpPngPath1, Buffer.from(pngBase64, 'base64'));
    fs.writeFileSync(tmpPngPath2, Buffer.from(pngBase64, 'base64'));

    try {
      // 1. Mock Pro session endpoint
      await page.route('**/api/**/session', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            type: "user",
            user: {
              id: "pro-user-1",
              email: "pro@platen.test",
              role: "user",
            },
            subscription: {
              tier: "pro",
              status: "active",
              role: "user",
              billing_interval: "monthly",
              current_period_end: "2099-12-31",
              custom_credits: 1000,
              used_units_3h: 0,
              used_units_daily: 0,
              used_units_monthly: 0,
            },
          }),
        });
      });

      // 2. Navigate to tool landing page & upload 2 files
      await page.goto('/images-to-pdf');
      await page.waitForLoadState('networkidle');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([tmpPngPath1, tmpPngPath2]);

      // 3. Should transition to workspace
      await expect(page).toHaveURL(/\/images-to-pdf\/workspace/);

      // 4. Switch to Custom Canvas mode
      const customTab = page.getByRole('button', { name: /Interactive Custom Canvas/i });
      await expect(customTab).toBeVisible();
      await customTab.click();

      // 5. Verify Canvas width & non-deformation
      const canvasPage = page.locator('div[style*="595px"]');
      await expect(canvasPage).toBeVisible();
      const canvasBox = await canvasPage.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(canvasBox!.width).toBeCloseTo(595, 1);
      expect(canvasBox!.height).toBeCloseTo(842, 1);

      // 6. Verify initial state: "No object selected" in properties panel
      await expect(page.getByText('No object selected')).toBeVisible();

      // 7. Click on the first object on canvas
      const canvasItems = canvasPage.locator('.cursor-move');
      await expect(canvasItems).toHaveCount(2);

      const item1 = canvasItems.nth(0);
      const item2 = canvasItems.nth(1);

      // Click item 1
      await item1.click();

      // 8. Assert item 1 remains selected after mouse release
      await expect(item1).toHaveClass(/ring-2 ring-indigo-500/);
      await expect(page.getByText('No object selected')).not.toBeVisible();
      await expect(page.getByText('Target Canvas Page')).toBeVisible();
      await expect(page.getByText('X Position')).toBeVisible();

      // 9. Modify property (Border Thickness) and verify selection persists
      const borderSlider = page.locator('input[type="range"][max="12"]');
      await expect(borderSlider).toBeVisible();
      await borderSlider.fill("4");
      await expect(item1).toHaveClass(/ring-2 ring-indigo-500/);

      // 10. Click item 2: item 1 deselects, item 2 remains selected after release
      await item2.click();
      await expect(item2).toHaveClass(/ring-2 ring-indigo-500/);
      await expect(item1).not.toHaveClass(/ring-2 ring-indigo-500/);

      // 11. Drag item 2 and verify selection remains active upon release
      const item2Box = await item2.boundingBox();
      expect(item2Box).not.toBeNull();
      await page.mouse.move(item2Box!.x + 20, item2Box!.y + 20);
      await page.mouse.down();
      await page.mouse.move(item2Box!.x + 50, item2Box!.y + 50, { steps: 5 });
      await page.mouse.up();

      await expect(item2).toHaveClass(/ring-2 ring-indigo-500/);

      // 12. Click on empty canvas background: selection clears
      await canvasPage.click({ position: { x: 50, y: 500 } });

      await expect(page.getByText('No object selected')).toBeVisible();
      await expect(item1).not.toHaveClass(/ring-2 ring-indigo-500/);
      await expect(item2).not.toHaveClass(/ring-2 ring-indigo-500/);

      // 13. Ensure zero uncaught React runtime errors
      expect(pageErrors).toEqual([]);
    } finally {
      if (fs.existsSync(tmpPngPath1)) fs.unlinkSync(tmpPngPath1);
      if (fs.existsSync(tmpPngPath2)) fs.unlinkSync(tmpPngPath2);
    }
  });

});
