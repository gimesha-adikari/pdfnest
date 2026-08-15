import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Standalone Markup Tools Preview Verification in Chromium", () => {
    const tools = [
        { name: "Highlight PDF", route: "/highlight-pdf", selector: "Highlighter Configuration", canvasTitle: "Highlighter Canvas" },
        { name: "Underline PDF", route: "/underline-pdf", selector: "Underline Configuration", canvasTitle: "Underline Canvas" },
        { name: "Strikeout PDF", route: "/strikeout-pdf", selector: "Strikeout Configuration", canvasTitle: "Strikeout Canvas" },
    ];

    const fixtures = [
        { name: "normal text PDF", file: "normal_text.pdf", expectedPages: 3 },
        { name: "scanned PDF", file: "scanned_page.pdf", expectedPages: 1 },
        { name: "mixed PDF", file: "mixed_doc.pdf", expectedPages: 3 },
        { name: "multi-page PDF", file: "large_multipage.pdf", expectedPages: 15 },
    ];

    for (const tool of tools) {
        test.describe(tool.name, () => {
            for (const fixture of fixtures) {
                test(`renders ${fixture.name} (${fixture.file}) with correct page count and canvas visibility`, async ({ page }) => {
                    const consoleErrors: string[] = [];
                    page.on("console", (msg) => {
                        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
                        if (msg.type() === "error") {
                            consoleErrors.push(msg.text());
                        }
                    });

                    // Navigate to tool landing page
                    await page.goto(tool.route);
                    await page.waitForLoadState("networkidle");

                    // Upload fixture PDF
                    const filePath = path.resolve(__dirname, "fixtures", fixture.file);
                    await page.locator("input[type='file']").first().setInputFiles(filePath);

                    // Wait for navigation to workspace
                    await page.waitForURL(`**${tool.route}/workspace**`);

                    // Wait for async PDF loading to display expected page count (ensures loadPdf completed)
                    const expectedPageCountText = `${fixture.expectedPages} Pages`;
                    await expect(page.locator(`text=${expectedPageCountText}`)).toBeVisible({ timeout: 15000 });
                    await expect(page.locator("text=0 Pages")).not.toBeVisible();

                    // Verify canvas element is mounted and rendered
                    const canvas = page.locator("canvas.block");
                    await expect(canvas).toBeVisible();

                    // Check canvas opacity and computed dimensions
                    const canvasBox = await canvas.boundingBox();
                    expect(canvasBox).not.toBeNull();
                    expect(canvasBox!.width).toBeGreaterThan(0);
                    expect(canvasBox!.height).toBeGreaterThan(0);

                    // If multi-page, test page navigation
                    if (fixture.expectedPages > 1) {
                        const nextPageBtn = page.locator("button:has(svg.lucide-chevron-right)");
                        await expect(nextPageBtn).toBeEnabled();
                        await nextPageBtn.click();
                        await expect(page.locator(`text=Page 2 of ${fixture.expectedPages}`)).toBeVisible();

                        const prevPageBtn = page.locator("button:has(svg.lucide-chevron-left)");
                        await expect(prevPageBtn).toBeEnabled();
                        await prevPageBtn.click();
                        await expect(page.locator(`text=Page 1 of ${fixture.expectedPages}`)).toBeVisible();
                    }

                    // Test drawing markup box
                    const drawingContainer = page.locator(".cursor-crosshair");
                    await expect(drawingContainer).toBeVisible();
                    const containerBox = await drawingContainer.boundingBox();
                    if (containerBox) {
                        await page.mouse.move(containerBox.x + 50, containerBox.y + 50);
                        await page.mouse.down();
                        await page.mouse.move(containerBox.x + 150, containerBox.y + 100);
                        await page.mouse.up();

                        // Verify marker box was added (Save button becomes enabled or marker box element exists)
                        const actionButton = page.locator("button:has-text('Save')");
                        await expect(actionButton).toBeEnabled();
                    }

                    // Verify no fatal detached ArrayBuffer or PDF preview errors occurred
                    const fatalErrors = consoleErrors.filter(
                        (err) =>
                            err.includes("ArrayBuffer") ||
                            err.includes("Failed to parse document context") ||
                            err.includes("Cannot read properties of detached")
                    );
                    expect(fatalErrors).toEqual([]);
                });
            }

            test(`replaces uploaded file cleanly and reloads workspace`, async ({ page }) => {
                await page.goto(tool.route);
                const file1 = path.resolve(__dirname, "fixtures", "normal_text.pdf");
                await page.locator("input[type='file']").first().setInputFiles(file1);
                await page.waitForURL(`**${tool.route}/workspace**`);

                // Verify file 1
                await expect(page.locator("text=3 Pages")).toBeVisible();

                // Clear/replace file
                const removeBtn = page.locator("button:has-text('Remove')");
                await expect(removeBtn).toBeVisible({ timeout: 10000 });
                await removeBtn.click();
                await page.waitForURL(`**${tool.route}`);

                // Upload file 2 (15 pages)
                const file2 = path.resolve(__dirname, "fixtures", "large_multipage.pdf");
                await page.locator("input[type='file']").first().setInputFiles(file2);
                await page.waitForURL(`**${tool.route}/workspace**`);

                // Verify file 2 loaded cleanly with 15 pages
                await expect(page.locator("text=15 Pages")).toBeVisible({ timeout: 15000 });
                const canvas = page.locator("canvas.block");
                await expect(canvas).toBeVisible();
            });
        });
    }
});
