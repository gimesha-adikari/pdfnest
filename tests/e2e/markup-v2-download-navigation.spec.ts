import { test, expect, type Page, type Route } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import os from "os";
import path from "path";

type MarkupAction = "highlight" | "underline" | "strikeout";

interface ToolConfig {
    action: MarkupAction;
    toolId: string;
    suffix: string;
    submitText: string;
}

const TOOLS: ToolConfig[] = [
    {
        action: "highlight",
        toolId: "highlight-pdf-v2",
        suffix: "highlighted",
        submitText: "Highlight text",
    },
    {
        action: "underline",
        toolId: "underline-pdf-v2",
        suffix: "underlined",
        submitText: "Underline text",
    },
    {
        action: "strikeout",
        toolId: "strikeout-pdf-v2",
        suffix: "strikeout",
        submitText: "Strike out text",
    },
];

async function createSamplePdf(name: string, content = "Sample text to mark"): Promise<{ filePath: string; bytes: Buffer }> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "markup-v2-test-"));
    const filePath = path.join(tmpDir, name);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(content, { x: 50, y: 700, size: 24 });
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    fs.writeFileSync(filePath, buffer);
    return { filePath, bytes: buffer };
}

async function setupMockApi(page: Page, action: MarkupAction, resultPdfBytes: Buffer) {
    // 1. Session mock for authenticated user
    await page.route("**/auth/session", async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                authenticated: true,
                type: "user",
                user: { id: "test-user-id", email: "test@example.com", role: "user" },
                subscription: { tier: "pro", role: "pro", status: "active" },
            }),
        });
    });

    // 2. Capabilities mock
    await page.route("**/api/v2/ocr/markup/capabilities", async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                languages: [{ code: "eng", name: "English" }],
                modes: ["smart", "ocr", "native"],
            }),
        });
    });

    // 3. Markup preview mock
    await page.route("**/api/v2/ocr/markup/preview", async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                schema_version: "1.0",
                profile: "MARKUP_V2",
                status: "ready",
                page_count: 1,
                pages: [],
            }),
        });
    });

    // 4. Markup job submission mock
    await page.route(`**/api/v2/ocr/markup/${action}/jobs`, async (route: Route) => {
        if (route.request().method() === "POST") {
            await route.fulfill({
                status: 202,
                contentType: "application/json",
                body: JSON.stringify({
                    job_id: `mock-job-${action}-123`,
                    status: "QUEUED",
                }),
            });
        } else {
            await route.continue();
        }
    });

    // 5. Job status polling and result download mock
    await page.route(`**/api/v2/ocr/markup/jobs/**`, async (route: Route) => {
        const url = route.request().url();
        if (url.endsWith("/result")) {
            await route.fulfill({
                status: 200,
                contentType: "application/pdf",
                body: resultPdfBytes,
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    job_id: `mock-job-${action}-123`,
                    status: "SUCCEEDED",
                    progress: {
                        total_pages: 1,
                        completed_pages: 1,
                        percent: 100,
                    },
                }),
            });
        }
    });
}

test.describe("OCR V2 Markup Tools - Download Page Navigation and Reset Flow", () => {
    let testPdfPath: string;
    let testPdfBytes: Buffer;

    test.beforeAll(async () => {
        const sample = await createSamplePdf("test-contract.pdf", "Sample text to mark");
        testPdfPath = sample.filePath;
        testPdfBytes = sample.bytes;
    });

    test.afterAll(() => {
        try { fs.unlinkSync(testPdfPath); } catch {}
    });

    for (const tool of TOOLS) {
        test(`${tool.toolId}: completes markup job, automatically navigates to /${tool.toolId}/download, downloads result, and resets on Process Another`, async ({ page }) => {
            await setupMockApi(page, tool.action, testPdfBytes);

            // 1. Visit tool entry route
            await page.goto(`/${tool.toolId}`);
            await expect(page).toHaveURL(new RegExp(`/${tool.toolId}$`));

            // 2. Upload PDF
            const fileInput = page.locator('input[type="file"]').first();
            await expect(fileInput).toBeAttached();
            await fileInput.setInputFiles(testPdfPath);

            // 3. Verify automatic navigation into workspace
            await expect(page).toHaveURL(new RegExp(`/${tool.toolId}/workspace$`));
            await expect(page.getByTestId("markup-v2-selected-file")).toContainText("test-contract.pdf");

            // 4. Enter a search query for text markup
            await page.getByTestId("markup-v2-query").fill("Sample text");
            await expect(page.getByTestId("markup-v2-submit")).toBeEnabled();
            await expect(page.getByTestId("markup-v2-submit")).toContainText(tool.submitText);

            // 5. Submit markup job
            await page.getByTestId("markup-v2-submit").click();

            // 6. Verify workspace automatically navigates to canonical download page
            await expect(page).toHaveURL(new RegExp(`/${tool.toolId}/download$`));

            // 7. Verify the old workspace inline result card is NOT present
            await expect(page.getByTestId("markup-v2-result")).toHaveCount(0);

            // 8. Verify canonical download page content is present
            await expect(page.getByText("Task completed successfully!")).toBeVisible();
            await expect(page.getByText("Your document is ready.")).toBeVisible();
            const downloadBtn = page.getByRole("button", { name: /Download File/i });
            await expect(downloadBtn).toBeVisible();

            // 9. Verify downloading from download page
            const downloadPromise = page.waitForEvent("download");
            await downloadBtn.click();
            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe(`test-contract-${tool.suffix}.pdf`);

            // 10. Click "Process Another" to return to base tool
            const processAnotherBtn = page.getByRole("button", { name: /Process Another/i });
            await expect(processAnotherBtn).toBeVisible();
            await processAnotherBtn.click();

            // 11. Verify URL returns to base route and upload UI is shown
            await expect(page).toHaveURL(new RegExp(`/${tool.toolId}$`));
            expect(page.url().includes("/workspace")).toBe(false);
            expect(page.url().includes("/download")).toBe(false);
            await expect(page.locator('input[type="file"]').first()).toBeAttached();
            await expect(page.getByTestId("markup-v2-selected-file")).toHaveCount(0);
        });

        test(`${tool.toolId}: direct visit to /${tool.toolId}/download without downloadData redirects to /${tool.toolId}`, async ({ page }) => {
            await page.goto(`/${tool.toolId}/download`);
            await expect(page).toHaveURL(new RegExp(`/${tool.toolId}$`));
        });
    }
});
