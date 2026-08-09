import { test, expect } from '@playwright/test';

test.describe('PDF Studio Workbench (/studio)', () => {
  const toolSlug = 'studio';
  test('loads PDF Studio interface cleanly', async ({ page }) => {
    await page.goto('/studio');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/studio/);
    
    // Check main elements
    const pageBody = page.locator('body');
    await expect(pageBody).toBeVisible();
  });
});
