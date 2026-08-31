import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/phase10-whole-system-local/final-run-01/evidence/ocr-text");

function scannedPng(): Buffer {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase10-ocr-text-"));
  const imagePath = path.join(directory, "scan.png");
  try {
    execFileSync("python3", ["-c", [
      "from PIL import Image, ImageDraw, ImageFont",
      "import sys",
      "im=Image.new('RGB', (1200, 1600), 'white')",
      "d=ImageDraw.Draw(im)",
      "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 54)",
      "d.text((120, 220), 'Phase Ten OCR Text', font=font, fill='black')",
      "d.text((120, 340), 'Durable scanned result 123', font=font, fill='black')",
      "im.save(sys.argv[1])",
    ].join(";"), imagePath]);
    return fs.readFileSync(imagePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function scannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const image = await pdf.embedPng(scannedPng());
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  return Buffer.from(await pdf.save());
}

type Job = {
  job_id: string;
  status: string;
  profile: string;
  progress: { completed_pages: number; total_pages: number; failed_pages: number[]; page_statuses: Record<string, string>; percent: number };
  result_available: boolean;
  error?: { code: string; message: string };
};

async function waitForJob(page: Page, jobId: string): Promise<{ job: Job; statuses: string[] }> {
  const statuses: string[] = [];
  const deadline = Date.now() + 120_000;
  let job: Job | null = null;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/text/jobs/${jobId}`);
    expect(response.ok(), `OCR Text status HTTP ${response.status()}`).toBeTruthy();
    job = await response.json() as Job;
    if (statuses[statuses.length - 1] !== job.status) statuses.push(job.status);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return { job, statuses };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for OCR Text V2 job ${jobId}: ${statuses.join(", ")}`);
}

test("OCR Text V2 scanned UI path completes a durable real-Tesseract job", async ({ page }) => {
  await authenticateProUser(page);
  await page.goto("/ocr-text-v2");
  await expect(page.getByRole("heading", { name: "Extract Text from PDF" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "phase10-ocr-text.pdf", mimeType: "application/pdf", buffer: await scannedPdf() });
  const picker = page.getByRole("combobox", { name: "OCR language" });
  await picker.click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await picker.click();

  const postResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/text/jobs"));
  await page.getByRole("button", { name: "Start OCR" }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = await postResponse.json() as Job;
  const headers = postResponse.request().headers();
  expect(headers["x-request-id"]).toBeTruthy();
  expect(headers["idempotency-key"]).toBeTruthy();

  const durable = await waitForJob(page, created.job_id);
  expect(durable.job.status, JSON.stringify(durable.job.error)).toBe("SUCCEEDED");
  expect(durable.job.profile).toBe("OCR_TEXT_V2");
  expect(durable.job.progress.total_pages).toBe(1);
  expect(durable.job.progress.completed_pages).toBe(1);
  expect(durable.job.progress.failed_pages ?? []).toEqual([]);
  expect(durable.job.result_available).toBe(true);

  const resultResponse = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/text/jobs/${created.job_id}/result`);
  expect(resultResponse.status()).toBe(200);
  const result = await resultResponse.json() as { schema_version: string; profile: string; status: string; text: string; pages: Array<{ page_index: number; status: string; text: string; source: string }> };
  expect(result.schema_version).toBe("ocr_v2_worker_response.v1");
  expect(result.profile).toBe("OCR_TEXT_V2");
  expect(result.status).toBe("SUCCEEDED");
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].source).toContain("tesseract");
  expect(result.text).toContain("Phase Ten OCR Text");
  await expect(page.getByRole("heading", { name: "Your extracted text" })).toBeVisible({ timeout: 120_000 });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "e2e-evidence.json"), `${JSON.stringify({
    profile: result.profile,
    schema_version: result.schema_version,
    statuses: durable.statuses,
    job_id: created.job_id,
    request_id_present: Boolean(headers["x-request-id"]),
    idempotency_key_present: Boolean(headers["idempotency-key"]),
    page_count: result.pages.length,
    completed_pages: durable.job.progress.completed_pages,
    result_available: durable.job.result_available,
    source: result.pages[0].source,
    extracted_text_length: result.text.length,
  }, null, 2)}\n`, "utf8");
});
