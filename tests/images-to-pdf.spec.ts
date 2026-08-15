import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Images to PDF Browser Integration Suite', () => {

  test('Upload image, render workspace, compile locally in Auto mode with 0 backend requests', async ({ page }) => {
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

    // Create a temporary PNG image fixture
    const tmpPngPath = path.resolve(process.cwd(), 'tests/fixtures/tmp_browser_test.png');
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(tmpPngPath, Buffer.from(pngBase64, 'base64'));

    try {
      // 1. Navigate to tool landing page
      await page.goto('/images-to-pdf');
      await page.waitForLoadState('networkidle');

      // 2. Upload image file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tmpPngPath);

      // 3. Should transition to workspace
      await expect(page).toHaveURL(/\/images-to-pdf\/workspace/);

      // 4. Verify workspace UI elements & ProcessingModeSelector
      await expect(page.locator('h1')).toContainText('Convert Images to PDF');
      await expect(page.getByText('Standard Matrix Stack')).toBeVisible();
      await expect(page.getByText('Compiled Queue')).toBeVisible();
      await expect(page.getByText('Execution Venue')).toBeVisible();

      // 5. Click the compile action button
      const compileBtn = page.getByRole('button', { name: /Compile 1 Image into PDF/i });
      await expect(compileBtn).toBeVisible();
      await compileBtn.click();

      // 6. Should complete and transition to download page
      await expect(page).toHaveURL(/\/images-to-pdf\/download/, { timeout: 15000 });

      // 7. Verify download page title & 0 backend network requests
      await expect(page.getByText('Task completed successfully!')).toBeVisible();
      await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();
      expect(backendRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      if (fs.existsSync(tmpPngPath)) {
        fs.unlinkSync(tmpPngPath);
      }
    }
  });

});
