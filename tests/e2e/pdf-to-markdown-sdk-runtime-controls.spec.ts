import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const APPROVED_SCANNED_PDF = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/pdf-to-markdown-sdk-consumer-01/controls");

type Job = {
    job_id: string;
    status: string;
    result_available: boolean;
    progress: { completed_pages: number; total_pages: number; percent: number };
};

async function waitForTerminal(page: Page, jobId: string): Promise<{ job: Job; statuses: string[]; status429: number; status5xx: number }> {
    const statuses: string[] = [];
    let status429 = 0;
    let status5xx = 0;
    const deadline = Date.now() + 60_000;
    let job: Job | null = null;
    while (Date.now() < deadline) {
        const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/pdf-to-markdown-v2/jobs/${jobId}`);
        if (response.status() === 429) status429 += 1;
        if (response.status() >= 500) status5xx += 1;
        expect(response.ok(), `status HTTP ${response.status()}`).toBeTruthy();
        job = await response.json() as Job;
        if (statuses[statuses.length - 1] !== job.status) statuses.push(job.status);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) break;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    expect(job).not.toBeNull();
    return { job: job!, statuses, status429, status5xx };
}

test("SDK-backed PDF-to-Markdown cancellation reaches a terminal cancelled job", async ({ page }) => {
    await authenticateProUser(page);
    await page.goto("/pdf-to-markdown-v2/workspace");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/pdf-to-markdown-v2/workspace");
    await expect(page.getByRole("heading", { name: "Convert PDF to Markdown" })).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(APPROVED_SCANNED_PDF);

    const postPromise = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/pdf-to-markdown-v2/jobs"));
    await page.getByRole("button", { name: "Convert to Markdown" }).click();
    const post = await postPromise;
    expect(post.status()).toBe(202);
    const created = await post.json() as Job;

    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 60_000 });
    const cancelPromise = page.waitForResponse(response => response.request().method() === "DELETE" && response.url().endsWith(`/api/v2/ocr/pdf-to-markdown-v2/jobs/${created.job_id}`));
    await page.getByRole("button", { name: "Cancel" }).click();
    const cancelResponse = await cancelPromise;
    expect(cancelResponse.status()).toBe(200);

    const terminal = await waitForTerminal(page, created.job_id);
    expect(terminal.job.status).toBe("CANCELLED");
    expect(terminal.job.result_available).toBe(false);
    await expect(page.getByText("Processing could not finish", { exact: true })).toBeVisible();

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "cancellation.json"), `${JSON.stringify({
        job_id: created.job_id,
        post_status: post.status(),
        cancel_status: cancelResponse.status(),
        statuses: terminal.statuses,
        final_status: terminal.job.status,
        result_available: terminal.job.result_available,
        status_429_count: terminal.status429,
        status_5xx_count: terminal.status5xx,
        successful_artifact_exposed: terminal.job.result_available,
    }, null, 2)}\n`, "utf8");
});
