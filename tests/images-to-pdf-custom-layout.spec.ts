import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Images to PDF Custom Layout & Interaction Suite', () => {

  test('Verify Unauthenticated Guest can use Custom Canvas, Edit Properties, Add Pages, and Compile PDF with 0 paywalls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const backendRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/conversion/to-pdf') || url.includes('/api/conversion/custom-to-pdf')) {
        backendRequests.push(url);
      }
    });

    // Create 2 temporary PNG images
    const tmpPngPath1 = path.resolve(process.cwd(), 'tests/fixtures/tmp_canvas_1.png');
    const tmpPngPath2 = path.resolve(process.cwd(), 'tests/fixtures/tmp_canvas_2.png');
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(tmpPngPath1, Buffer.from(pngBase64, 'base64'));
    fs.writeFileSync(tmpPngPath2, Buffer.from(pngBase64, 'base64'));

    try {
      // 1. Navigate to tool landing page as a completely unauthenticated guest (NO auth mock)
      await page.goto('/images-to-pdf');
      await page.waitForLoadState('networkidle');

      // 2. Upload image files
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles([tmpPngPath1, tmpPngPath2]);

      // 3. Should transition to workspace
      await expect(page).toHaveURL(/\/images-to-pdf\/workspace/);

      // 4. Verify Interactive Custom Canvas tab is enabled and has NO Pro badge
      const customTab = page.getByRole('button', { name: /Interactive Custom Canvas/i });
      await expect(customTab).toBeVisible();
      await expect(customTab).not.toHaveClass(/opacity-75/);
      await expect(customTab.getByText(/Pro/i)).not.toBeVisible();

      // Click the tab
      await customTab.click();

      // 5. Verify NO upgrade or login modal appears
      await expect(page.getByText('Unlock Custom Canvas')).not.toBeVisible();
      await expect(page.getByText('Sign in to Customize')).not.toBeVisible();
      await expect(page.getByText('Upgrade to Pro Tier')).not.toBeVisible();

      // 6. Verify Canvas dimensions and toolbar
      const canvasPage = page.locator('div[style*="595px"]').first();
      await expect(canvasPage).toBeVisible();
      const canvasBox = await canvasPage.boundingBox();
      expect(canvasBox).not.toBeNull();
      expect(canvasBox!.width).toBeCloseTo(595, 1);
      expect(canvasBox!.height).toBeCloseTo(842, 1);

      // 7. Verify "Add Page" toolbar button works for guests
      const addPageBtn = page.getByRole('button', { name: /Add Page/i });
      await expect(addPageBtn).toBeVisible();
      await addPageBtn.click();
      await expect(page.getByText('Page Canvas #2')).toBeVisible();

      // 8. Select an object on canvas and verify selection persists after release
      const canvasItems = canvasPage.locator('.cursor-move');
      await expect(canvasItems).toHaveCount(2);

      const item1 = canvasItems.nth(0);
      const item2 = canvasItems.nth(1);

      await item1.click();
      await expect(item1).toHaveClass(/ring-2 ring-indigo-500/);
      await expect(page.getByText('Target Canvas Page')).toBeVisible();
      await expect(page.getByText('X Position')).toBeVisible();

      // 9. Reallocate item 2 to Page 2
      await item2.click();
      await expect(item2).toHaveClass(/ring-2 ring-indigo-500/);

      const pageSelect = page.locator('select').filter({ hasText: /Page #1/ });
      await expect(pageSelect).toBeVisible();
      await pageSelect.selectOption({ label: 'Page #2' });

      // 10. Click empty canvas and verify deselection
      await canvasPage.click({ position: { x: 50, y: 500 } });
      await expect(page.getByText('No object selected')).toBeVisible();

      // 11. Click "Compile 2 Images into PDF" as guest
      const compileBtn = page.getByRole('button', { name: /Compile 2 Images into PDF/i });
      await expect(compileBtn).toBeVisible();
      await compileBtn.click();

      // 12. Should complete in Auto mode locally and navigate to download
      await expect(page).toHaveURL(/\/images-to-pdf\/download/, { timeout: 15000 });
      await expect(page.getByText('Task completed successfully!')).toBeVisible();
      await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

      // 0 backend conversion requests in client Auto mode
      expect(backendRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      if (fs.existsSync(tmpPngPath1)) fs.unlinkSync(tmpPngPath1);
      if (fs.existsSync(tmpPngPath2)) fs.unlinkSync(tmpPngPath2);
    }
  });

});
