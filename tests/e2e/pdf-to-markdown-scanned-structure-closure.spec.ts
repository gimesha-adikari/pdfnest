import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const APPROVED_SCANNED_PDF = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/pdf-to-markdown-scanned-structure-quality-closure/browser");
type Job = { job_id: string; status: string; progress: { completed_pages: number; total_pages: number; failed_pages?: number[]; percent: number }; result_available: boolean; error?: { code: string; message: string } };

async function submitAndReadResult(page: Page, filePath: string, expectedPages: number) {
    const consoleMessages: string[] = [];
    page.on("console", message => {
        if (message.type() === "error") consoleMessages.push(message.text());
    });
    // Each closure case is independent; do not let the previous durable-job
    // resume record race with the next upload in the same browser context.
    await page.goto("/pdf-to-markdown-v2/workspace");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/pdf-to-markdown-v2/workspace");
    await expect(page.getByRole("heading", { name: "Convert PDF to Markdown" })).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(filePath);
    await expect(page.getByText(path.basename(filePath), { exact: true })).toBeVisible();
    const postPromise = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/pdf-to-markdown-v2/jobs"));
    await page.getByRole("button", { name: "Convert to Markdown" }).click();
    const post = await postPromise;
    expect(post.status()).toBe(202);
    const created = await post.json() as Job;
    const statuses: string[] = [];
    const status429: number[] = [];
    const deadline = Date.now() + 180_000;
    let job: Job | null = null;
    while (Date.now() < deadline) {
        const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/pdf-to-markdown-v2/jobs/${created.job_id}`);
        if (response.status() === 429) status429.push(response.status());
        expect(response.ok(), `status HTTP ${response.status()}`).toBeTruthy();
        job = await response.json() as Job;
        if (statuses[statuses.length - 1] !== job.status) statuses.push(job.status);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) break;
        await new Promise(resolve => setTimeout(resolve, 700));
    }
    expect(job).not.toBeNull();
    expect(job!.status, JSON.stringify(job)).toBe("SUCCEEDED");
    expect(job!.progress.total_pages).toBe(expectedPages);
    expect(job!.progress.completed_pages).toBe(expectedPages);
    expect(job!.progress.failed_pages || []).toEqual([]);
    expect(job!.result_available).toBe(true);
    const resultResponse = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/pdf-to-markdown-v2/jobs/${created.job_id}/result`);
    expect(resultResponse.status()).toBe(200);
    const result = await resultResponse.json() as { schema_version: string; pages: Array<Record<string, unknown>>; warnings: string[]; validation: { valid: boolean }; markdown: string };
    expect(result.schema_version).toBe("ocr_v2_structured_document.v1");
    expect(result.validation.valid).toBe(true);
    expect(result.pages).toHaveLength(expectedPages);
    expect(result.markdown).toEqual(expect.any(String));
    await expect(page.getByText("Your Markdown result", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download .md" })).toBeVisible();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    const download = await downloadPromise;
    const downloadedPath = path.join(OUTPUT_DIR, path.basename(filePath).replace(/\.pdf$/i, "-markdown.md"));
    await download.saveAs(downloadedPath);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${path.basename(filePath)}.json`), `${JSON.stringify({
        input: path.basename(filePath),
        job_id: created.job_id,
        post_status: post.status(),
        statuses,
        status_429_count: status429.length,
        result_status: resultResponse.status(),
        schema_version: result.schema_version,
        validation_valid: result.validation.valid,
        page_count: result.pages.length,
        markdown_chars: result.markdown.length,
        markdown_headings: (result.markdown.match(/^#{1,6} /gm) || []).length,
        markdown_table_lines: (result.markdown.match(/^\|/gm) || []).length,
        markdown_list_lines: (result.markdown.match(/^(?:[-*] |\d+\. )/gm) || []).length,
        warning_count: result.warnings.length,
        browser_console_error_count: consoleMessages.length,
        browser_console_429_count: consoleMessages.filter(message => /429|Too Many Requests/i.test(message)).length,
        downloaded_path: downloadedPath,
    }, null, 2)}\n`, "utf8");
    return { result, downloadedPath };
}

test.describe.serial("PDF-to-Markdown scanned structure quality closure", () => {
    test("approved scanned academic PDF produces structured Markdown", async ({ page }) => {
        await authenticateProUser(page);
        const { result, downloadedPath } = await submitAndReadResult(page, APPROVED_SCANNED_PDF, 3);
        expect(result.markdown).toContain("# FACULTY OF ENGINEERING TECHNOLOGY");
        expect(result.markdown).toContain("## Confirmation of Module Completion");
        expect(result.markdown).toMatch(/^\| UNIT NO \| MODULE NAME \| CREDITS \| STATUS \|/m);
        expect(fs.readFileSync(downloadedPath, "utf8")).toContain("<!-- pagebreak -->");
    });

    test("native PDF structure remains available through the product path", async ({ page }) => {
        await authenticateProUser(page);
        const { result } = await submitAndReadResult(page, path.join(FIXTURES, "normal_text.pdf"), 3);
        expect(result.pages.every(page => page.processing_source === "NATIVE_EXTRACTION")).toBe(true);
        expect(result.markdown).toContain("## Sample Text Document - Page 1");
        expect(result.markdown).toContain("## Sample Text Document - Page 2");
        expect(result.markdown).toContain("## Sample Text Document - Page 3");
    });
});
