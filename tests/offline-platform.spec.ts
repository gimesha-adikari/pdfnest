import { test, expect } from "@playwright/test";
import { TOTAL_TOOL_COUNT } from "@/lib/toolsData";

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

    test("1. When backend is offline, discovery surfaces retain the complete public catalog", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/tools");

        // Wait for page to settle
        await page.waitForLoadState("networkidle");

        const badge = page.locator("main section div").filter({ hasText: /Document Utilities/i });
        await expect(badge).toBeVisible();
        await expect(badge).toContainText(`${TOTAL_TOOL_COUNT} Document Utilities`);

        // Discovery is deliberately independent of execution availability.
        const toolCards = page.locator("main a[href^='/']");
        const count = await toolCards.count();
        expect(count).toBe(TOTAL_TOOL_COUNT);

        // Backend-required pages remain crawlable and discoverable during an outage.
        await expect(page.locator("main a[href='/word-to-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/excel-to-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/redact-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/image-to-searchable-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/edit-pdf']")).toBeVisible();

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
        await expect(page.locator("main a[href='/pdf-to-text']")).toBeVisible();
        await expect(page.locator("main a[href='/compress-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/edit-metadata']")).toBeVisible();
        await expect(page.locator("main a[href='/highlight-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/underline-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/strikeout-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/sign-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/repair-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/code-to-pdf']")).toBeVisible();
        await expect(page.locator("main a[href='/studio-v2']")).toBeVisible();
    });

    test("2. Footer links remain unchanged during outage", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const footer = page.locator("footer");
        await expect(footer).toBeVisible();

        await expect(footer.locator("a[href='/edit-pdf']")).toBeVisible();
        await expect(footer.locator("a[href='/merge-pdf']")).toBeVisible();
        await expect(footer.locator("a[href='/pdf-to-word']")).toBeVisible();
    });

    test("3. Direct backend-only routes retain SEO content while replacing only the execution surface", async ({ page }) => {
        await simulateBackendOffline(page);

        // Visit /word-to-pdf directly (which is BACKEND_ONLY)
        await page.goto("/word-to-pdf");
        await page.waitForLoadState("networkidle");

        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();
        await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
        await expect(page.getByTestId("backend-unavailable-execution-panel")).toBeVisible();

        // Must NOT render file upload dropzone
        await expect(page.locator("input[type='file']")).toHaveCount(0);
        await expect(page.locator("text=Drop your PDF here")).toHaveCount(0);

        await expect(page.getByRole("button", { name: "Retry Connection" })).toBeVisible();
    });

    test("4. Direct URLs to Excel to PDF and Word to PDF also show the offline guard", async ({ page }) => {
        await simulateBackendOffline(page);

        await page.goto("/excel-to-pdf");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByTestId("backend-unavailable-execution-panel")).toBeVisible();
        await expect(page.locator("input[type='file']")).toHaveCount(0);

        await page.goto("/word-to-pdf");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByTestId("backend-unavailable-execution-panel")).toBeVisible();
        await expect(page.locator("input[type='file']")).toHaveCount(0);
    });

    test("5. About page retains its public catalog count when offline", async ({ page }) => {
        await simulateBackendOffline(page);
        await page.goto("/about");
        await page.waitForLoadState("networkidle");

        await expect(page.locator(`text=${TOTAL_TOOL_COUNT}+`)).toBeVisible();
        await expect(page.locator("text=PDF Tools Available")).toBeVisible();
    });

    test("6. Local tools (Merge, Rotate, Split, Compress) load functional workspaces without backend", async ({ page }) => {
        await simulateBackendOffline(page);

        // Visit /rotate-pdf
        await page.goto("/rotate-pdf");
        await page.waitForLoadState("networkidle");

        // Should NOT show service unavailable
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);

        // Should show upload dropzone
        await expect(page.locator("input[type='file']")).toBeVisible();

        // Visit /compress-pdf
        await page.goto("/compress-pdf");
        await page.waitForLoadState("networkidle");
        await expect(page.locator("text=Service Temporarily Unavailable")).toHaveCount(0);
        await expect(page.locator("input[type='file']")).toBeVisible();
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
