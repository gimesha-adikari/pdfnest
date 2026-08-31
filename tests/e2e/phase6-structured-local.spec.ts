import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/phase6-structured-local");

type Profile = "DOCUMENT_EXTRACTION_V2" | "PDF_MARKDOWN_V2";
type Job = { job_id: string; status: string; profile: string; progress: { completed_pages: number; total_pages: number; failed_pages: number[]; page_statuses: Record<string, string>; percent: number }; result_available: boolean; error?: { code: string; message: string } };

function scannedParagraphPdf(): Buffer {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase6-scan-"));
  const pngPath = path.join(directory, "scan.png");
  try {
    execFileSync("python3", ["-c", [
      "from PIL import Image, ImageDraw, ImageFont",
      "import sys",
      "im=Image.new('RGB', (1200, 1600), 'white')",
      "d=ImageDraw.Draw(im)",
      "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 54)",
      "d.text((120, 220), 'Scanned paragraph 123', font=font, fill='black')",
      "d.text((120, 340), 'Structured OCR local fixture', font=font, fill='black')",
      "im.save(sys.argv[1])",
    ].join(";"), pngPath]);
    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function createScannedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const image = await pdf.embedPng(scannedParagraphPdf());
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  return Buffer.from(await pdf.save());
}

async function submitThroughUi(page: Page, profile: Profile, file: string | { name: string; mimeType: string; buffer: Buffer }, resultName: string, expectedPages: number) {
  const tool = profile === "PDF_MARKDOWN_V2" ? "pdf-to-markdown-v2" : "document-extraction-v2";
  await page.goto(`/${tool}/workspace`);
  await expect(page.getByRole("heading", { name: profile === "PDF_MARKDOWN_V2" ? "Convert PDF to Markdown" : "Extract Data from PDF" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.getByText(typeof file === "string" ? path.basename(file) : file.name, { exact: true })).toBeVisible();
  const postResponsePromise = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/v2/ocr/${tool}/jobs`));
  await page.getByRole("button", { name: profile === "PDF_MARKDOWN_V2" ? "Convert to Markdown" : "Extract data" }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = await postResponse.json() as Job;
  expect(created.job_id).toMatch(/^[0-9a-f-]{36}$/i);
  const postHeaders = postResponse.request().headers();
  expect(postHeaders["x-request-id"]).toBeTruthy();
  expect(postHeaders["idempotency-key"]).toBeTruthy();

  const statuses: string[] = [];
  const deadline = Date.now() + 120_000;
  let job: Job | null = null;
  while (Date.now() < deadline) {
    const statusResponse = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/${tool}/jobs/${created.job_id}`);
    expect(statusResponse.ok(), `status HTTP ${statusResponse.status()}`).toBeTruthy();
    job = await statusResponse.json() as Job;
    if (statuses[statuses.length - 1] !== job.status) statuses.push(job.status);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  expect(job).not.toBeNull();
  expect(job!.status, `${profile} failed: ${JSON.stringify(job)}`).toBe("SUCCEEDED");
  expect(job!.profile).toBe(profile);
  expect(job!.progress.total_pages).toBe(expectedPages);
  expect(job!.progress.completed_pages).toBe(expectedPages);
  expect(job!.progress.failed_pages ?? []).toEqual([]);
  expect(job!.result_available).toBe(true);
  const resultResponse = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/${tool}/jobs/${created.job_id}/result`);
  expect(resultResponse.status()).toBe(200);
  const result = await resultResponse.json() as { schema_version: string; result_id: string; elements: Array<Record<string, unknown>>; pages: Array<Record<string, unknown>>; capabilities: string[]; warnings: string[]; validation: { valid: boolean }; markdown?: string };
  expect(result.schema_version).toBe("ocr_v2_structured_document.v1");
  expect(result.result_id).toBeTruthy();
  expect(result.elements.some(element => element.type === "DOCUMENT")).toBe(true);
  expect(result.elements.some(element => element.type === "PAGE")).toBe(true);
  // normal_text.pdf is the repository's three-page native extraction fixture;
  // assert the durable result preserves its complete page count.
  expect(result.pages).toHaveLength(expectedPages);
  expect(result.validation.valid).toBe(true);
  if (profile === "PDF_MARKDOWN_V2") expect(result.markdown).toEqual(expect.any(String));
  await expect(page.getByText(profile === "PDF_MARKDOWN_V2" ? "Your Markdown result" : "Your structured document result", { exact: true })).toBeVisible();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, resultName), `${JSON.stringify({ profile, statuses, job, result }, null, 2)}\n`, "utf8");
  return { job, result, statuses, requestId: postHeaders["x-request-id"], idempotencyKey: postHeaders["idempotency-key"] };
}

test.describe.serial("Phase 6 structured OCR real local full-stack E2E", () => {
  test("native Document Extraction V2 and scanned PDF-to-Markdown V2 use the durable structured path", async ({ page }) => {
    await authenticateProUser(page);
    const native = await submitThroughUi(page, "DOCUMENT_EXTRACTION_V2", path.join(FIXTURES, "normal_text.pdf"), "document-extraction-native.json", 3);
    expect(native.result.pages[0].processing_source).toBe("NATIVE_EXTRACTION");
    expect(native.result.pages[0].classification).toBe("TEXT_NATIVE");

    const scanned = await createScannedPdf();
    const markdown = await submitThroughUi(page, "PDF_MARKDOWN_V2", { name: "phase6-scanned-paragraph.pdf", mimeType: "application/pdf", buffer: scanned }, "pdf-markdown-scanned.json", 1);
    expect(markdown.result.pages[0].processing_source).toBe("OCR_RECOGNITION");
    expect(markdown.result.pages[0].capabilities).toContain("WORD_GEOMETRY");
    expect(markdown.result.markdown).toContain("Scanned");
  });
});
