import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import os from "os";
import path from "path";

async function createTestPdf(name: string): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-to-md-test-"));
    const filePath = path.join(tmpDir, name);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(`Sample content for ${name}`, { x: 50, y: 350 });
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filePath, Buffer.from(pdfBytes));
    return filePath;
}

test.describe("PDF to Markdown V2 - New document reset and navigation", () => {
    let pdfA: string;
    let pdfB: string;

    test.beforeAll(async () => {
        pdfA = await createTestPdf("first-document.pdf");
        pdfB = await createTestPdf("second-document.pdf");
    });

    test.afterAll(() => {
        try { fs.unlinkSync(pdfA); } catch {}
        try { fs.unlinkSync(pdfB); } catch {}
    });

    test("clicking New document performs a full reset and navigates to /pdf-to-markdown-v2", async ({ page }) => {
        // 1. Start at entry route
        await page.goto("/pdf-to-markdown-v2");
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2$/);
        await expect(page.locator('input[type="file"]').first()).toBeAttached();

        // 2. Upload a test PDF
        await page.locator('input[type="file"]').first().setInputFiles(pdfA);

        // 3. Verify URL navigates to workspace
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2\/workspace$/);

        // 4. Verify selected PDF is visible
        await expect(page.getByText("first-document.pdf")).toBeVisible();
        await expect(page.getByRole("button", { name: "New document" })).toBeVisible();

        // 5. Click "New document"
        await page.getByRole("button", { name: "New document" }).click();

        // 6. Verify URL becomes exactly /pdf-to-markdown-v2
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2$/);
        expect(page.url().endsWith("/pdf-to-markdown-v2")).toBe(true);
        expect(page.url().includes("/workspace")).toBe(false);

        // 7. Verify upload/start UI is visible
        await expect(page.locator('input[type="file"]').first()).toBeAttached();

        // 8. Verify old PDF name is not present
        await expect(page.getByText("first-document.pdf")).toHaveCount(0);

        // 9. Verify old job/result/error UI is not present
        await expect(page.getByText("Your Markdown result")).toHaveCount(0);
        await expect(page.getByText("Processing could not finish")).toHaveCount(0);

        // 10. Refresh the browser on the upload page: verify it stays on /pdf-to-markdown-v2
        await page.reload();
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2$/);
        await expect(page.locator('input[type="file"]').first()).toBeAttached();
        await expect(page.getByText("first-document.pdf")).toHaveCount(0);

        // 11. Upload a second PDF and verify navigation to workspace works again
        await page.locator('input[type="file"]').first().setInputFiles(pdfB);
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2\/workspace$/);
        await expect(page.getByText("second-document.pdf")).toBeVisible();
        await expect(page.getByText("first-document.pdf")).toHaveCount(0);
    });

    test("handles browser back and forward navigation without stale state", async ({ page }) => {
        // Upload flow
        await page.goto("/pdf-to-markdown-v2");
        await page.locator('input[type="file"]').first().setInputFiles(pdfA);
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2\/workspace$/);
        await expect(page.getByText("first-document.pdf")).toBeVisible();

        // Click New document -> returns to /pdf-to-markdown-v2
        await page.getByRole("button", { name: "New document" }).click();
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2$/);

        // User hits browser Back -> lands on /pdf-to-markdown-v2/workspace
        await page.goBack();
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2\/workspace$/);

        // Workspace must NOT display the old file or result
        await expect(page.getByText("first-document.pdf")).toHaveCount(0);
        await expect(page.getByText("Your Markdown result")).toHaveCount(0);
        // Shows clear prompt to choose a PDF
        await expect(page.getByText("Choose a PDF to convert to Markdown")).toBeVisible();
        const choosePdfBtn = page.getByRole("link", { name: "Choose PDF" });
        await expect(choosePdfBtn).toBeVisible();

        // Clicking "Choose PDF" takes user back to entry route
        await choosePdfBtn.click();
        await expect(page).toHaveURL(/\/pdf-to-markdown-v2$/);
        await expect(page.locator('input[type="file"]').first()).toBeAttached();
    });

    test("shared component resets and navigates to /document-extraction-v2 without cross-route pollution", async ({ page }) => {
        // Start at Document Extraction V2 entry route
        await page.goto("/document-extraction-v2");
        await expect(page).toHaveURL(/\/document-extraction-v2$/);

        // Upload PDF
        await page.locator('input[type="file"]').first().setInputFiles(pdfA);
        await expect(page).toHaveURL(/\/document-extraction-v2\/workspace$/);
        await expect(page.getByText("first-document.pdf")).toBeVisible();

        // Click New document
        await page.getByRole("button", { name: "New document" }).click();

        // Must return to ITS OWN entry route (/document-extraction-v2), NOT /pdf-to-markdown-v2
        await expect(page).toHaveURL(/\/document-extraction-v2$/);
        expect(page.url().endsWith("/document-extraction-v2")).toBe(true);
        await expect(page.locator('input[type="file"]').first()).toBeAttached();
        await expect(page.getByText("first-document.pdf")).toHaveCount(0);
    });
});
