import { test, expect } from "@playwright/test";
import { authenticateProUser } from "../helpers/auth";

test.describe("Standalone Editor V2 Default Engine Integration", () => {
  test("Normal /edit-pdf flow without query parameters uses Editor V2 and enables word-level editing", async ({ page }) => {
    await authenticateProUser(page);
    const docPath = "/home/gimesha/Downloads/doc.pdf";

    // 1. Start at exact public route /edit-pdf (NO ?ocr_v2=1)
    console.log("[E2E] Navigating to http://localhost:3000/edit-pdf...");
    await page.goto("/edit-pdf");
    expect(page.url()).toBe("http://localhost:3000/edit-pdf");

    // 3. Upload document
    console.log("[E2E] Uploading doc.pdf...");
    await page.locator("input[type=file]").first().setInputFiles(docPath);

    // 4. Confirm clean workspace URL
    console.log("[E2E] Waiting for navigation to /edit-pdf/workspace...");
    await page.waitForURL("**/edit-pdf/workspace");
    const currentUrl = new URL(page.url());
    console.log("[E2E] Reached URL:", page.url());
    expect(currentUrl.pathname).toBe("/edit-pdf/workspace");
    expect(currentUrl.search).toBe(""); // Clean URL with no query parameters!

    // 5. Wait for layout extraction to finish and SharedEditor to mount
    console.log("[E2E] Waiting for Editor V2 overlay layer...");
    await page.locator('[data-testid="editor-overlay-layer"]').waitFor({ timeout: 120000 });

    // 6. DOM assertions
    const legacyTextareas = await page.locator('[data-testid="editor-overlay-layer"] textarea').count();
    const wordHitTargets = await page.locator('[data-testid="word-hit-target"]').count();
    console.log(`[E2E] DOM counts: legacyTextareas=${legacyTextareas}, wordHitTargets=${wordHitTargets}`);

    expect(legacyTextareas).toBe(0);
    expect(wordHitTargets).toBeGreaterThan(0);

    // 7. Verify the user's exact area: "28th of March 2025"
    // Find the word target for "March"
    const marchWordTarget = page.locator('[data-testid="word-hit-target"][aria-label="Edit word March"]');
    await expect(marchWordTarget).toBeVisible();

    console.log("[E2E] Clicking word 'March'...");
    await marchWordTarget.click();

    // 8. Assert WordInlineEditor mounts and WordBackgroundMask mounts
    const inlineEditor = page.locator('[data-testid="word-inline-editor"]');
    const backgroundMask = page.locator('[data-testid="word-background-mask"]');

    await expect(inlineEditor).toBeVisible();
    await expect(backgroundMask).toBeVisible();
    console.log("[E2E] WordInlineEditor and WordBackgroundMask mounted successfully!");

    // 9. Edit the word
    console.log("[E2E] Editing word to 'April' and pressing Enter...");
    await inlineEditor.fill("April");
    await inlineEditor.press("Enter");

    // Deselect word by clicking empty area on canvas to transition to static replacement text
    await page.locator('[data-testid="editor-overlay-layer"]').click({ position: { x: 10, y: 10 } });

    // 10. Assert replacement text rendered and background mask persists
    const replacementText = page.locator('[data-testid="word-replacement-text"]', { hasText: "April" });
    await expect(replacementText).toBeVisible();
    await expect(backgroundMask).toBeVisible();
    console.log("[E2E] Replacement text 'April' rendered with persistent background mask!");

    // 11. Zoom verification: 100% -> 150% -> 200% -> Fit Width -> 100%
    console.log("[E2E] Testing zoom levels...");
    const zoomSelect = page.locator('select[aria-label="Zoom percentage"]');

    // 150%
    await zoomSelect.selectOption("1.5");
    await expect(replacementText).toBeVisible();
    await expect(backgroundMask).toBeVisible();
    console.log("[E2E] 150% zoom verified.");

    // 200%
    await zoomSelect.selectOption("2");
    await expect(replacementText).toBeVisible();
    await expect(backgroundMask).toBeVisible();
    console.log("[E2E] 200% zoom verified.");

    // Fit Width
    const fitWidthBtn = page.locator('button[aria-label="Fit width"]');
    await fitWidthBtn.click();
    await expect(replacementText).toBeVisible();
    await expect(backgroundMask).toBeVisible();
    console.log("[E2E] Fit Width verified.");

    // 100% -> 200% -> 100% transition after edit
    await zoomSelect.selectOption("1");
    await expect(replacementText).toBeVisible();
    await zoomSelect.selectOption("2");
    await expect(replacementText).toBeVisible();
    await zoomSelect.selectOption("1");
    await expect(replacementText).toBeVisible();
    console.log("[E2E] 100% -> 200% -> 100% transition verified successfully!");
  });
});
