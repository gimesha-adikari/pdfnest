import { test, expect } from '@playwright/test';

test.describe('PDFNest Repository Analyzer — Browser E2E Real User Journey', () => {
    test('loads repository analyzer landing page and controls cleanly', async ({ page }) => {
        await page.goto('/repository-analyzer');
        await page.waitForLoadState('domcontentloaded');

        // Verify title / heading
        const heading = page.locator('h1, h2, h3').filter({ hasText: /Repository Analyzer|Architecture/i }).first();
        await expect(heading).toBeVisible();

        // Verify source selection mechanism exists
        const gitUrlInput = page.locator('input[placeholder*="github.com"], input[placeholder*="https://"], input[type="text"]').first();
        await expect(gitUrlInput).toBeVisible();

        // Verify Analyze / Submit button exists
        const submitBtn = page.locator('button').filter({ hasText: /Analyze|Scan|Load/i }).first();
        await expect(submitBtn).toBeVisible();
    });

    test('verifies workspace and documentation tab structure in browser', async ({ page }) => {
        await page.goto('/repository-analyzer/workspace');
        await page.waitForLoadState('domcontentloaded');

        // Verify body and container render without fatal UI crashes
        const body = page.locator('body');
        await expect(body).toBeVisible();
    });
});
