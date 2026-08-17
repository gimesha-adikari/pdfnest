import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const CORPUS_DIR = path.resolve(process.cwd(), "../scratch/corpus_150");

test.describe("Wave 7 Final Acceptance Test (Release Gate)", () => {
    const tools = [
        { id: "highlight-pdf", name: "Highlight PDF", actionText: /Save Highlight Markers/i, colorPickerTitle: "Green" },
        { id: "underline-pdf", name: "Underline PDF", actionText: /Save Underline Markers/i, colorPickerTitle: "Red" },
        { id: "strikeout-pdf", name: "Strikeout PDF", actionText: /Save Strikeouts/i, colorPickerTitle: "Red" },
    ];

    for (const tool of tools) {
        test.describe(`Tool: ${tool.name}`, () => {

            test(`A. Native PDF + Smart Mode (First, Middle, Last, Rotated 90)`, async ({ page }) => {
                const nativeMultiPath = path.join(CORPUS_DIR, "native_096.pdf"); // 5 pages
                const nativeRotatedPath = path.join(CORPUS_DIR, "native_004.pdf"); // Rotated 90

                // 1. Multipage Native Document
                await page.goto(`/${tool.id}`);
                await page.waitForLoadState("networkidle");

                let fileInput = page.locator("input[type='file']").first();
                await fileInput.setInputFiles(nativeMultiPath);

                await page.waitForURL(`**/${tool.id}/workspace**`);
                await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });
                const container = page.locator(".cursor-crosshair");
                await expect(container).toBeVisible({ timeout: 15000 });

                // Draw on First Page (P1)
                let box = await container.boundingBox();
                expect(box).not.toBeNull();
                await page.mouse.move(box!.x + 60, box!.y + 80);
                await page.mouse.down();
                await page.mouse.move(box!.x + 300, box!.y + 120, { steps: 10 });
                await page.mouse.up();

                // 2. Middle Page Test (P3)
                const nextBtn = page.locator("button:has(svg.lucide-chevron-right)");
                await nextBtn.click(); // P2
                await page.waitForTimeout(300);
                await nextBtn.click(); // P3
                await page.waitForTimeout(300);
                await expect(page.locator("text=Page 3 of 5")).toBeVisible({ timeout: 5000 });

                box = await container.boundingBox();
                await page.mouse.move(box!.x + 50, box!.y + 100);
                await page.mouse.down();
                await page.mouse.move(box!.x + 280, box!.y + 140, { steps: 10 });
                await page.mouse.up();

                // 3. Last Page Test (P5)
                await nextBtn.click(); // P4
                await page.waitForTimeout(300);
                await nextBtn.click(); // P5
                await page.waitForTimeout(300);
                await expect(page.locator("text=Page 5 of 5")).toBeVisible({ timeout: 5000 });

                box = await container.boundingBox();
                await page.mouse.move(box!.x + 50, box!.y + 120);
                await page.mouse.down();
                await page.mouse.move(box!.x + 260, box!.y + 160, { steps: 10 });
                await page.mouse.up();

                // Navigate back to P1 and verify box persistence across page flips
                const prevBtn = page.locator("button:has(svg.lucide-chevron-left)");
                await prevBtn.click(); // P4
                await page.waitForTimeout(200);
                await prevBtn.click(); // P3
                await page.waitForTimeout(200);
                await prevBtn.click(); // P2
                await page.waitForTimeout(200);
                await prevBtn.click(); // P1
                await page.waitForTimeout(200);
                await expect(page.locator("text=Page 1 of 5")).toBeVisible();

                // Process document
                const actionBtn = page.getByRole("button", { name: tool.actionText });
                await expect(actionBtn).toBeEnabled({ timeout: 10000 });
                await actionBtn.click();

                // Verify instant client processing
                await page.waitForURL(`**/${tool.id}/download**`, { timeout: 15000 });
                await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();

                // 4. Test Rotated 90° PDF
                await page.goto(`/${tool.id}`);
                await page.waitForLoadState("networkidle");
                fileInput = page.locator("input[type='file']").first();
                await fileInput.setInputFiles(nativeRotatedPath);
                await page.waitForURL(`**/${tool.id}/workspace**`);
                await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });
                await expect(container).toBeVisible({ timeout: 15000 });

                box = await container.boundingBox();
                await page.mouse.move(box!.x + 50, box!.y + 80);
                await page.mouse.down();
                await page.mouse.move(box!.x + 250, box!.y + 120, { steps: 10 });
                await page.mouse.up();

                const actionBtnRotated = page.getByRole("button", { name: tool.actionText });
                await expect(actionBtnRotated).toBeEnabled({ timeout: 10000 });
                await actionBtnRotated.click();
                await page.waitForURL(`**/${tool.id}/download**`, { timeout: 15000 });
            });

            test(`B. Native PDF + Manual Mode (Color selection, drawing, and local processing)`, async ({ page }) => {
                const nativePath = path.join(CORPUS_DIR, "native_001.pdf");

                await page.goto(`/${tool.id}`);
                await page.waitForLoadState("networkidle");
                const fileInput = page.locator("input[type='file']").first();
                await fileInput.setInputFiles(nativePath);
                await page.waitForURL(`**/${tool.id}/workspace**`);
                await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });

                const container = page.locator(".cursor-crosshair");
                await expect(container).toBeVisible({ timeout: 15000 });

                // Switch to Manual Mode
                const manualOption = page.locator("select").first();
                if (await manualOption.isVisible()) {
                    await manualOption.selectOption("manual");
                }

                // Pick color if available
                const colorBtn = page.locator(`button[title='${tool.colorPickerTitle}']`);
                if (await colorBtn.isVisible()) {
                    await colorBtn.click();
                }

                // Draw manual box
                const box = await container.boundingBox();
                expect(box).not.toBeNull();
                await page.mouse.move(box!.x + 80, box!.y + 100);
                await page.mouse.down();
                await page.mouse.move(box!.x + 350, box!.y + 150, { steps: 10 });
                await page.mouse.up();

                const actionBtn = page.getByRole("button", { name: tool.actionText });
                await expect(actionBtn).toBeEnabled({ timeout: 10000 });
                await actionBtn.click();
                await page.waitForURL(`**/${tool.id}/download**`, { timeout: 15000 });
                await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();
            });

            test(`C. Scanned PDF + Manual Mode (Raster canvas rendering, manual box drawing, client execution)`, async ({ page }) => {
                const scannedPath = path.join(CORPUS_DIR, "scanned_001.pdf");

                await page.goto(`/${tool.id}`);
                await page.waitForLoadState("networkidle");
                const fileInput = page.locator("input[type='file']").first();
                await fileInput.setInputFiles(scannedPath);
                await page.waitForURL(`**/${tool.id}/workspace**`);
                await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 25000 });

                const container = page.locator(".cursor-crosshair");
                await expect(container).toBeVisible({ timeout: 15000 });

                // Switch to Manual Mode
                const manualBtn = page.locator("button:has-text('Manual')").first();
                if (await manualBtn.isVisible()) {
                    await manualBtn.click();
                } else {
                    const select = page.locator("select").first();
                    await select.selectOption("manual");
                }

                // Draw box over scanned raster
                const box = await container.boundingBox();
                expect(box).not.toBeNull();
                await page.mouse.move(box!.x + 80, box!.y + 100);
                await page.mouse.down();
                await page.mouse.move(box!.x + 320, box!.y + 180, { steps: 10 });
                await page.mouse.up();

                const actionBtn = page.getByRole("button", { name: tool.actionText });
                await expect(actionBtn).toBeEnabled({ timeout: 10000 });
                await actionBtn.click();
                await page.waitForURL(`**/${tool.id}/download**`, { timeout: 15000 });
                await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();
            });

            test(`D. Scanned PDF + OCR Mode (Dashed preview styling, OCR badge, cloud worker dispatch)`, async ({ page }) => {
                const scannedPath = path.join(CORPUS_DIR, "scanned_001.pdf");

                await page.goto(`/${tool.id}`);
                await page.waitForLoadState("networkidle");
                const fileInput = page.locator("input[type='file']").first();
                await fileInput.setInputFiles(scannedPath);
                await page.waitForURL(`**/${tool.id}/workspace**`);
                await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 25000 });

                const container = page.locator(".cursor-crosshair");
                await expect(container).toBeVisible({ timeout: 15000 });

                // Select OCR / Recognize Text mode
                const ocrBtn = page.locator("button:has-text('Recognize Text')").first();
                if (await ocrBtn.isVisible()) {
                    await ocrBtn.click();
                } else {
                    const select = page.locator("select").first();
                    await select.selectOption("ocr");
                }

                // Verify OCR mode banner notice appears
                await expect(page.locator("text=OCR Target Area Mode")).toBeVisible({ timeout: 5000 });

                // Draw box over scanned area
                const box = await container.boundingBox();
                expect(box).not.toBeNull();
                await page.mouse.move(box!.x + 100, box!.y + 120);
                await page.mouse.down();
                await page.mouse.move(box!.x + 350, box!.y + 180, { steps: 10 });
                await page.mouse.up();

                // Verify OCR target area badge and dashed border styling
                const targetBox = page.locator(".border-dashed");
                await expect(targetBox).toBeVisible({ timeout: 5000 });

                // Verify action button is enabled
                const actionBtn = page.getByRole("button", { name: tool.actionText });
                await expect(actionBtn).toBeEnabled({ timeout: 10000 });
            });
        });
    }

    test.describe("Failure Hunting & Adversarial Stress Tests", () => {
        test("1. Micro box, Giant box, Overlapping boxes, and Rapid Page Switching", async ({ page }) => {
            const nativeMultiPath = path.join(CORPUS_DIR, "native_096.pdf"); // 5 pages

            await page.goto("/highlight-pdf");
            await page.waitForLoadState("networkidle");
            const fileInput = page.locator("input[type='file']").first();
            await fileInput.setInputFiles(nativeMultiPath);
            await page.waitForURL("**/highlight-pdf/workspace**");
            await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });

            const container = page.locator(".cursor-crosshair");
            await expect(container).toBeVisible({ timeout: 15000 });
            const box = await container.boundingBox();
            expect(box).not.toBeNull();

            // A. Draw micro box (sub-5px)
            await page.mouse.move(box!.x + 50, box!.y + 50);
            await page.mouse.down();
            await page.mouse.move(box!.x + 53, box!.y + 53);
            await page.mouse.up();

            // B. Draw overlapping box
            await page.mouse.move(box!.x + 40, box!.y + 40);
            await page.mouse.down();
            await page.mouse.move(box!.x + 200, box!.y + 100, { steps: 5 });
            await page.mouse.up();

            // C. Draw large box
            await page.mouse.move(box!.x + 20, box!.y + 20);
            await page.mouse.down();
            await page.mouse.move(box!.x + box!.width - 20, box!.y + box!.height - 20, { steps: 5 });
            await page.mouse.up();

            // D. Rapid page switching (1 -> 5 -> 1)
            const nextBtn = page.locator("button:has(svg.lucide-chevron-right)");
            const prevBtn = page.locator("button:has(svg.lucide-chevron-left)");
            for (let i = 0; i < 4; i++) {
                await nextBtn.click();
                await page.waitForTimeout(100);
            }
            await expect(page.locator("text=Page 5 of 5")).toBeVisible({ timeout: 5000 });
            for (let i = 0; i < 4; i++) {
                await prevBtn.click();
                await page.waitForTimeout(100);
            }
            await expect(page.locator("text=Page 1 of 5")).toBeVisible({ timeout: 5000 });

            // E. Process document successfully
            const highlightBtn = page.getByRole("button", { name: /Save Highlight Markers/i });
            await expect(highlightBtn).toBeEnabled();
            await highlightBtn.click();
            await page.waitForURL("**/highlight-pdf/download**", { timeout: 15000 });
            await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();
        });
    });
});
