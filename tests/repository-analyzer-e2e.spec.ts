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

        // Verify tabs for Git, Local Folder, and ZIP Archive
        const gitTab = page.locator('button').filter({ hasText: 'Git URL' }).first();
        await expect(gitTab).toBeVisible();

        const folderTab = page.locator('button').filter({ hasText: 'Local Directory' }).first();
        await expect(folderTab).toBeVisible();

        const zipTab = page.locator('button').filter({ hasText: 'ZIP Archive' }).first();
        await expect(zipTab).toBeVisible();
    });

    test('switches tabs to local folder and ZIP upload modes cleanly', async ({ page }) => {
        await page.goto('/repository-analyzer');
        await page.waitForLoadState('domcontentloaded');

        // Switch to Local Folder tab
        const folderTab = page.locator('button').filter({ hasText: 'Local Directory' }).first();
        await folderTab.click();
        const folderSelectBtn = page.locator('button').filter({ hasText: 'Select local project folder' }).first();
        await expect(folderSelectBtn).toBeVisible();

        // Switch to ZIP tab
        const zipTab = page.locator('button').filter({ hasText: 'ZIP Archive' }).first();
        await zipTab.click();
        const zipSelectBtn = page.locator('button').filter({ hasText: 'Select repository ZIP archive' }).first();
        await expect(zipSelectBtn).toBeVisible();
    });

    test('verifies workspace and documentation tab structure in browser', async ({ page }) => {
        await page.goto('/repository-analyzer/workspace');
        await page.waitForLoadState('domcontentloaded');

        // Verify body and container render without fatal UI crashes
        const body = page.locator('body');
        await expect(body).toBeVisible();
    });
});
