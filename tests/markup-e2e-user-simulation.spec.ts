import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { PDFDocument } from "pdf-lib";

test.describe("Wave 7 Annotation Suite — Real Browser User Simulation", () => {
    let nativePdfPath: string;
    let multipagePdfPath: string;

    test.beforeAll(async () => {
        // Create sample test PDFs in fixtures
        const fixturesDir = path.resolve(__dirname, "fixtures");
        if (!fs.existsSync(fixturesDir)) {
            fs.mkdirSync(fixturesDir, { recursive: true });
        }

        // 1-page native
        const doc1 = await PDFDocument.create();
        const p1 = doc1.addPage([600, 800]);
        p1.drawText("PDFNest Wave 7 Real Browser Test Header", { x: 50, y: 720, size: 16 });
        p1.drawText("This text is tested for client-side highlighting and underline annotations.", { x: 50, y: 680, size: 12 });
        const bytes1 = await doc1.save();
        nativePdfPath = path.join(fixturesDir, "tmp_user_sim_native.pdf");
        fs.writeFileSync(nativePdfPath, Buffer.from(bytes1));

        // 3-page multipage
        const doc2 = await PDFDocument.create();
        for (let i = 1; i <= 3; i++) {
            const p = doc2.addPage([600, 800]);
            p.drawText(`Document Page ${i} Section Header`, { x: 50, y: 720, size: 14 });
            p.drawText(`Sample body paragraph for user simulation testing on page ${i}.`, { x: 50, y: 680, size: 11 });
        }
        const bytes2 = await doc2.save();
        multipagePdfPath = path.join(fixturesDir, "tmp_user_sim_multipage.pdf");
        fs.writeFileSync(multipagePdfPath, Buffer.from(bytes2));
    });

    test.afterAll(() => {
        if (fs.existsSync(nativePdfPath)) fs.unlinkSync(nativePdfPath);
        if (fs.existsSync(multipagePdfPath)) fs.unlinkSync(multipagePdfPath);
    });

    test("1. Highlight PDF: Real user upload, color selection, box drawing, instant processing & download", async ({ page }) => {
        const backendRequests: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("/api/markup/")) {
                backendRequests.push(req.url());
            }
        });

        // 1. Visit tool page
        await page.goto("/highlight-pdf");
        await page.waitForLoadState("networkidle");

        // 2. Upload file
        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(nativePdfPath);

        // 3. Wait for workspace transition and canvas synchronization
        await page.waitForURL("**/highlight-pdf/workspace**");
        await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });
        const container = page.locator(".cursor-crosshair");
        await expect(container).toBeVisible({ timeout: 10000 });

        // 4. Select Green Color
        const greenBtn = page.locator("button[title='Green']");
        if (await greenBtn.isVisible()) {
            await greenBtn.click();
        }

        // 5. Draw box on container
        const box = await container.boundingBox();
        expect(box).not.toBeNull();

        await page.mouse.move(box!.x + 50, box!.y + 80);
        await page.mouse.down();
        await page.mouse.move(box!.x + 350, box!.y + 130, { steps: 10 });
        await page.mouse.up();

        // 6. Click "Save Highlight Markers"
        const highlightBtn = page.getByRole("button", { name: /Save Highlight Markers/i });
        await expect(highlightBtn).toBeEnabled({ timeout: 10000 });
        await highlightBtn.click();

        // 7. Verify navigation to Download page
        await page.waitForURL("**/highlight-pdf/download**", { timeout: 15000 });
        await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();

        // 8. Verify client-side execution bypassed cloud worker
        expect(backendRequests.length).toBe(0);
    });

    test("2. Underline PDF: Real user upload, manual mode switch, drawing, local processing & download", async ({ page }) => {
        const backendRequests: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("/api/markup/")) {
                backendRequests.push(req.url());
            }
        });

        await page.goto("/underline-pdf");
        await page.waitForLoadState("networkidle");

        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(multipagePdfPath);

        await page.waitForURL("**/underline-pdf/workspace**");
        await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });
        const container = page.locator(".cursor-crosshair");
        await expect(container).toBeVisible({ timeout: 10000 });

        // Switch to Manual Mode if available
        const manualBtn = page.locator("button:has-text('Manual')");
        if (await manualBtn.isVisible()) {
            await manualBtn.click();
        }

        // Draw underline box
        const box = await container.boundingBox();
        expect(box).not.toBeNull();

        await page.mouse.move(box!.x + 60, box!.y + 90);
        await page.mouse.down();
        await page.mouse.move(box!.x + 300, box!.y + 120, { steps: 10 });
        await page.mouse.up();

        const underlineBtn = page.getByRole("button", { name: /Save Underline Markers/i });
        await expect(underlineBtn).toBeEnabled({ timeout: 10000 });
        await underlineBtn.click();

        await page.waitForURL("**/underline-pdf/download**", { timeout: 15000 });
        await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();
        expect(backendRequests.length).toBe(0);
    });

    test("3. Strikeout PDF: Real user upload, drawing, local processing & download", async ({ page }) => {
        const backendRequests: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("/api/markup/")) {
                backendRequests.push(req.url());
            }
        });

        await page.goto("/strikeout-pdf");
        await page.waitForLoadState("networkidle");

        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(nativePdfPath);

        await page.waitForURL("**/strikeout-pdf/workspace**");
        await expect(page.locator("text=Synchronizing view matrix framework...")).not.toBeVisible({ timeout: 20000 });
        const container = page.locator(".cursor-crosshair");
        await expect(container).toBeVisible({ timeout: 10000 });

        const box = await container.boundingBox();
        expect(box).not.toBeNull();

        await page.mouse.move(box!.x + 50, box!.y + 100);
        await page.mouse.down();
        await page.mouse.move(box!.x + 320, box!.y + 140, { steps: 10 });
        await page.mouse.up();

        const strikeBtn = page.getByRole("button", { name: /Save Strikeouts/i });
        await expect(strikeBtn).toBeEnabled({ timeout: 10000 });
        await strikeBtn.click();

        await page.waitForURL("**/strikeout-pdf/download**", { timeout: 15000 });
        await expect(page.getByRole("button", { name: /Download/i })).toBeVisible();
        expect(backendRequests.length).toBe(0);
    });
});
