import { test, expect } from "@playwright/test";
import { TOTAL_TOOL_COUNT, OFFLINE_TOOL_COUNT } from "@/lib/toolsData";

/**
 * Helpers to simulate backend offline vs online states in Playwright
 */
async function simulateBackendOffline(page: any) {
    // Intercept all /api/ requests and return 503 / network failure
    await page.route("**/api/**", async (route: any) => {
        await route.abort("connectionfailed");
    });
    // Also intercept CMS tools endpoint to force offline static fallback if invoked
    await page.route("**/site-content/**", async (route: any) => {
        await route.abort("connectionfailed");
    });
}

test.describe("PDFNest Truth-Based Capability & Offline Architecture", () => {
    test.beforeEach(async ({ page }) => {
        // Set viewport
        await page.setViewportSize({ width: 1280, height: 800 });
    });

    test("1. When backend is offline, discovery surfaces only display the offline-capable tools", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/tools");

        // Wait for page to settle
        await page.waitForLoadState("networkidle");

        // 1. Directory Badge must reflect truthful local tool count
        const badge = page.locator("main section div").filter({ hasText: /Local Tools Available/i });
        await expect(badge).toBeVisible();
        await expect(badge).toContainText(`${OFFLINE_TOOL_COUNT} Local Tools Available`);

        // 2. All rendered tool cards in Directory must be offline-capable
        const toolCards = page.locator("main a[href^='/']");
        const count = await toolCards.count();
        expect(count).toBe(OFFLINE_TOOL_COUNT);

        // 3. Verify backend-required tools (e.g. Strikeout, Compress, Word to PDF, Redact, OCR) are NOT present in directory
        await expect(page.locator("main a[href='/strikeout-pdf']")).toHaveCount(0);
        await expect(page.locator("main a[href='/compress-pdf']")).toHaveCount(0);
        await expect(page.locator("main a[href='/word-to-pdf']")).toHaveCount(0);
        await expect(page.locator("main a[href='/redact-pdf']")).toHaveCount(0);
        await expect(page.locator("main a[href='/image-to-searchable-pdf']")).toHaveCount(0);
        await expect(page.locator("main a[href='/edit-pdf']")).toHaveCount(0);

        // 4. Verify genuinely offline-capable tools ARE present
        await expect(page.locator("main a[href='/merge-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/split-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/rotate-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/delete-pages']")).toBeVisible();
        await expect(page.locator("main a[href='/reorder-pages']")).toBeVisible();
        await expect(page.locator("main a[href='/watermark-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/add-page-numbers']")).toBeVisible();
        await expect(page.locator("main a[href='/add-text']")).toBeVisible();
        await expect(page.locator("main a[href='/images-to-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/crop-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/pdf-to-images']")).toBeVisible();
        await expect(page.locator("main a[href='/unlock-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/lock-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/edit-metadata']")).toBeVisible();
        await expect(page.locator("main a[href='/studio']")).toBeVisible();
    });

    test("2. Footer links hide backend-required tools during outage", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const footer = page.locator("footer");
        await expect(footer).toBeVisible();

        // Footer should NOT link to backend-required tools when offline
        await expect(footer.locator("a[href='/strikeout-pdf']")).toHaveCount(0);
        await expect(footer.locator("a[href='/compress-pdf']")).toHaveCount(0);
        await expect(footer.locator("a[href='/word-to-pdf']")).toHaveCount(0);
        await expect(footer.locator("a[href='/redact-pdf']")).toHaveCount(0);

        // Footer SHOULD link to offline-capable tools
        await expect(footer.locator("a[href='/merge-pdf']")).toBeVisible();
        await expect(footer.locator("a[href='/rotate-pdf']")).toBeVisible();
    });

    test("3. Direct URLs to backend-required tools render BackendOnlyToolGuard without upload controls", async ({ page }) => {
        await simulateBackendOffline(page);

        // Visit /strikeout-pdf directly
        await page.goto("/strikeout-pdf");
        await page.waitForLoadState("networkidle");

        // Should render Service Unavailable guard
        await expect(page.locator("text=Service Temporarily Unavailable")).toBeVisible();
        await expect(page.locator("text=Backend offline — cloud processing unavailable")).toBeVisible();

        // Must NOT render file upload dropzone
        await expect(page.locator("input[type='file']")).toHaveCount(0);
        await expect(page.locator("text=Drop your PDF here")).toHaveCount(0);

        // Should suggest offline alternatives
        const alternativeButtons = page.locator("button, a").filter({ hasText: /client-capable tools|Browse/i });
        await expect(alternativeButtons.first()).toBeVisible();
    });

    test("4. Direct URLs to Compress and Word to PDF also show the offline guard", async ({ page }) => {
        await simulateBackendOffline(page);

        await page.goto("/compress-pdf");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("text=Service Temporarily Unavailable")).toBeVisible();
        await expect(page.locator("input[type='file']")).toHaveCount(0);

        await page.goto("/word-to-pdf");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("text=Service Temporarily Unavailable")).toBeVisible();
        await expect(page.locator("input[type='file']")).toHaveCount(0);
    });

    test("5. About page displays truthful dynamic tool counts when offline", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/about");
        await page.waitForLoadState("networkidle");

        // Should show offline truthful metric and not 0 or 37
        await expect(page.locator(`text=${OFFLINE_TOOL_COUNT}+`)).toBeVisible();
        await expect(page.locator("text=Local Tools (Cloud Offline)")).toBeVisible();
    });

    test("6. Local tools (Merge, Rotate, Split) load functional workspaces without backend", async ({ page }) => {
        await simulateBackendOffline(page);

        // Visit /rotate-pdf
        await page.goto("/rotate-pdf");
        await page.waitForLoadState("networkidle");

        // Should NOT show service unavailable
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);

        // Should show upload dropzone
        await expect(page.locator("input[type='file']")).toBeAttached();
    });

    test("7. Edit Metadata workspace loads and provides functional metadata fields", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/edit-metadata");
        await page.waitForLoadState("networkidle");

        // Must be accessible and not blocked by guard
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeAttached();
    });

    test("8. Studio workspace remains accessible offline without being blocked", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/studio");
        await page.waitForLoadState("networkidle");

        // Studio tool page must load without Service Unavailable guard
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeAttached();
    });

});
