import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/multilingual-language-routing-v1/final-run-01/evidence");
const SINHALA = /[\u0d80-\u0dff]/;
const APPROVED_REAL_BILINGUAL_IMAGE = "/home/gimesha/pdfnest-tests/images/1.jpeg";

type Job = {
  job_id: string;
  status: string;
  profile: string;
  progress: { completed_pages: number; total_pages: number; failed_pages: number[]; page_statuses: Record<string, string>; percent: number };
  result_available: boolean;
  error?: { code: string; message: string };
};

type OcrResult = {
  schema_version: string;
  profile: string;
  status: string;
  text: string;
  pages: Array<{ page_index: number; status: string; text: string; source: string; language: { requested?: string[]; detected?: string[]; status?: string; mode?: string; scripts?: string[] } }>;
};

function fixtureDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-multilingual-v1-"));
}

function createPng(directory: string, name: string, lines: string[], includeSinhala: boolean): string {
  const output = path.join(directory, name);
  const script = [
    "from PIL import Image, ImageDraw, ImageFont",
    "import sys",
    "im=Image.new('RGB',(1800,700),'white')",
    "d=ImageDraw.Draw(im)",
    "eng=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',80)",
    "sin=ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansSinhala-Regular.ttf',80)",
    `d.text((60,60),${JSON.stringify(lines[0])},fill='black',font=eng)`,
    includeSinhala ? `d.text((60,360),${JSON.stringify(lines[1])},fill='black',font=sin)` : `d.text((60,360),${JSON.stringify(lines[1])},fill='black',font=eng)`,
    "im.save(sys.argv[1],format='PNG')",
  ].join(";");
  execFileSync("python3", ["-c", script, output]);
  return output;
}

function createUncertainPng(directory: string): string {
  const output = path.join(directory, "auto-uncertain.png");
  const script = [
    "from PIL import Image, ImageDraw, ImageFont",
    "im=Image.new('RGB',(900,900),'white')",
    "d=ImageDraw.Draw(im)",
    "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)",
    "d.text((80,300),'Fallback language proof 123',fill='black',font=font)",
    "d.text((80,460),'Explicit English retry',fill='black',font=font)",
    "im=im.rotate(12,expand=False,fillcolor='white')",
    "im.save(__import__('sys').argv[1],format='PNG')",
  ].join(";");
  execFileSync("python3", ["-c", script, output]);
  return output;
}

async function pdfFromImages(imagePaths: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const imagePath of imagePaths) {
    const imageBytes = fs.readFileSync(imagePath);
    const image = /\.jpe?g$/i.test(imagePath)
      ? await pdf.embedJpg(imageBytes)
      : await pdf.embedPng(imageBytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  return Buffer.from(await pdf.save());
}

async function waitForJob(page: Page, endpoint: string, jobId: string): Promise<{ job: Job; statuses: string[] }> {
  const statuses: string[] = [];
  const deadline = Date.now() + 120_000;
  let last: Job | null = null;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${getE2EApiBaseUrl()}${endpoint}/${jobId}`);
    if (response.status() === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    expect(response.ok(), `status HTTP ${response.status()}`).toBeTruthy();
    last = await response.json() as Job;
    if (statuses[statuses.length - 1] !== last.status) statuses.push(last.status);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(last.status)) return { job: last, statuses };
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error(`Timed out waiting for ${jobId}: ${statuses.join(",")}`);
}

function safeFileMetadata(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  return { path: filePath, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function submitOcrText(page: Page, pdf: Buffer, language: "eng" | "sin" | "eng+sin" | "auto", evidenceName: string): Promise<OcrResult> {
  await page.goto("/ocr-text-v2/workspace");
  await expect(page.getByRole("heading", { name: "OCR Text V2" })).toBeVisible();
  await page.getByRole("link", { name: "Choose PDF" }).click();
  await expect(page).toHaveURL(/\/ocr-text-v2$/);
  await page.locator('input[type="file"]').first().setInputFiles({ name: `${evidenceName}.pdf`, mimeType: "application/pdf", buffer: pdf });
  await expect(page).toHaveURL(/\/ocr-text-v2\/workspace$/);
  await page.getByLabel("OCR language").selectOption(language === "auto" ? "auto" : language.split("+"));
  const postResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/text/jobs"));
  await page.getByRole("button", { name: "Start OCR" }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = await postResponse.json() as Job;
  const headers = postResponse.request().headers();
  expect(headers["x-request-id"]).toBeTruthy();
  expect(headers["idempotency-key"]).toBeTruthy();
  const durable = await waitForJob(page, "/v2/ocr/text/jobs", created.job_id);
  expect(durable.job.status, JSON.stringify(durable.job.error)).toBe("SUCCEEDED");
  expect(durable.job.result_available).toBe(true);
  const resultResponse = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/text/jobs/${created.job_id}/result`);
  expect(resultResponse.status()).toBe(200);
  const result = await resultResponse.json() as OcrResult;
  expect(result.status).toBe("SUCCEEDED");
  expect(result.pages.every((item) => item.source.includes("tesseract") || item.source.includes("native"))).toBe(true);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, evidenceName + ".json"), `${JSON.stringify({
    profile: result.profile,
    schema_version: result.schema_version,
    job_id: created.job_id,
    statuses: durable.statuses,
    request_id_present: Boolean(headers["x-request-id"]),
    idempotency_key_present: Boolean(headers["idempotency-key"]),
    page_count: result.pages.length,
    pages: result.pages.map((item) => ({
      page_index: item.page_index,
      status: item.status,
      source: item.source,
      text_length: item.text.length,
      has_sinhala_unicode: SINHALA.test(item.text),
      language: item.language,
    })),
  }, null, 2)}\n`, "utf8");
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page).toHaveURL(/\/ocr-text-v2$/);
  await expect(page.locator('input[type="file"]').first()).toBeAttached();
  return result;
}

async function submitSearchable(page: Page, files: string[], language: "eng+sin" | "auto", evidenceName: string): Promise<{ job: Job; pdfPath: string }> {
  await page.goto("/searchable-pdf-v2/workspace");
  await expect(page.getByRole("heading", { name: "Searchable PDF V2" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.locator('select[aria-label="OCR language"]').selectOption(language === "auto" ? "auto" : language.split("+"));
  const postResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/searchable-pdf/jobs"));
  await page.getByRole("button", { name: "Create searchable PDF" }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = await postResponse.json() as Job;
  const headers = postResponse.request().headers();
  const durable = await waitForJob(page, "/v2/ocr/searchable-pdf/jobs", created.job_id);
  expect(durable.job.status, JSON.stringify(durable.job.error)).toBe("SUCCEEDED");
  expect(durable.job.progress.completed_pages).toBe(files.length);
  expect(durable.job.result_available).toBe(true);
  await expect(page.getByText("Your searchable PDF is ready", { exact: true })).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pdfPath = path.join(OUTPUT_DIR, evidenceName + ".pdf");
  await download.saveAs(pdfPath);
  expect(fs.readFileSync(pdfPath).subarray(0, 5).toString()).toBe("%PDF-");
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  fs.writeFileSync(path.join(OUTPUT_DIR, evidenceName + ".json"), `${JSON.stringify({
    job_id: created.job_id,
    statuses: durable.statuses,
    request_id_present: Boolean(headers["x-request-id"]),
    idempotency_key_present: Boolean(headers["idempotency-key"]),
    page_count: durable.job.progress.total_pages,
    completed_pages: durable.job.progress.completed_pages,
    artifact: safeFileMetadata(pdfPath),
  }, null, 2)}\n`, "utf8");
  return { job: durable.job, pdfPath };
}

test.describe.serial("Multilingual Language Routing V1 real local full-stack E2E", () => {
  test("explicit English, Sinhala, and bilingual OCR preserve language provenance", async ({ page }) => {
    await authenticateProUser(page);
    const directory = fixtureDir();
    try {
      const english = createPng(directory, "english.png", ["English language proof 123", "Plain English page"], false);
      const sinhala = createPng(directory, "sinhala.png", ["Sinhala language proof 123", "සිංහල පෙළ පරීක්ෂණය"], true);
      const bilingual = createPng(directory, "bilingual.png", ["English heading 123", "සිංහල පෙළ පරීක්ෂණය 456"], true);
      const englishResult = await submitOcrText(page, await pdfFromImages([english]), "eng", "ocr-text-explicit-eng");
      expect(englishResult.pages[0].language.requested).toEqual(["eng"]);
      const sinhalaResult = await submitOcrText(page, await pdfFromImages([sinhala]), "sin", "ocr-text-explicit-sin");
      expect(sinhalaResult.pages[0].language.requested).toEqual(["sin"]);
      expect(SINHALA.test(sinhalaResult.text)).toBe(true);
      const bilingualResult = await submitOcrText(page, await pdfFromImages([bilingual]), "eng+sin", "ocr-text-explicit-eng-sin");
      expect(bilingualResult.pages[0].language.requested).toEqual(["eng", "sin"]);
      expect(SINHALA.test(bilingualResult.text)).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test("AUTO routes English and Sinhala pages independently and reports detection", async ({ page }) => {
    await authenticateProUser(page);
    const directory = fixtureDir();
    try {
      const english = createPng(directory, "auto-english.png", ["AUTO English page 123", "Detected Latin content"], false);
      const sinhala = createPng(directory, "auto-sinhala.png", ["AUTO Sinhala page 456", "සිංහල පෙළ පරීක්ෂණය"], true);
      const result = await submitOcrText(page, await pdfFromImages([english, sinhala]), "auto", "ocr-text-auto-cross-page");
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].language.mode).toBe("AUTO");
      expect(result.pages[1].language.mode).toBe("AUTO");
      expect(result.pages.some((item) => item.language.detected?.includes("eng"))).toBe(true);
      expect(result.pages.some((item) => item.language.detected?.includes("sin"))).toBe(true);
      expect(SINHALA.test(result.pages[1].text)).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test("AUTO preserves English and Sinhala coverage for the approved real bilingual page", async ({ page }) => {
    await authenticateProUser(page);
    expect(fs.existsSync(APPROVED_REAL_BILINGUAL_IMAGE)).toBe(true);
    const result = await submitOcrText(
      page,
      await pdfFromImages([APPROVED_REAL_BILINGUAL_IMAGE]),
      "auto",
      "ocr-text-auto-approved-real-eng-sin"
    );
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].language.detected).toEqual(expect.arrayContaining(["eng", "sin"]));
    expect(SINHALA.test(result.pages[0].text)).toBe(true);

    const searchable = await submitSearchable(
      page,
      [APPROVED_REAL_BILINGUAL_IMAGE],
      "auto",
      "searchable-auto-approved-real-eng-sin"
    );
    expect(searchable.job.progress.total_pages).toBe(1);
  });

  test("Searchable PDF V2 explicit and AUTO mixed-language paths preserve Unicode text", async ({ page }) => {
    await authenticateProUser(page);
    const directory = fixtureDir();
    try {
      const bilingual = createPng(directory, "searchable-bilingual.png", ["Searchable English 123", "සිංහල පෙළ පරීක්ෂණය"], true);
      const english = createPng(directory, "searchable-english.png", ["Searchable AUTO English 789", "Latin page"], false);
      const sinhala = createPng(directory, "searchable-sinhala.png", ["Searchable AUTO Sinhala 987", "සිංහල පෙළ පරීක්ෂණය"], true);
      const explicit = await submitSearchable(page, [bilingual], "eng+sin", "searchable-explicit-eng-sin");
      expect(explicit.job.progress.total_pages).toBe(1);
      await page.getByRole("button", { name: "New PDF" }).click();
      const automatic = await submitSearchable(page, [english, sinhala], "auto", "searchable-auto-cross-page");
      expect(automatic.job.progress.total_pages).toBe(2);
      expect(fs.readFileSync(automatic.pdfPath).subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test("AUTO uncertainty preserves the upload for explicit-language recovery", async ({ page }) => {
    await authenticateProUser(page);
    const directory = fixtureDir();
    try {
      const uncertain = createUncertainPng(directory);
      const pdf = await pdfFromImages([uncertain]);
      await page.goto("/ocr-text-v2/workspace");
      await expect(page.getByRole("heading", { name: "OCR Text V2" })).toBeVisible();
      await page.getByRole("link", { name: "Choose PDF" }).click();
      await expect(page).toHaveURL(/\/ocr-text-v2$/);
      await page.locator('input[type="file"]').first().setInputFiles({ name: "auto-uncertain.pdf", mimeType: "application/pdf", buffer: pdf });
      await expect(page).toHaveURL(/\/ocr-text-v2\/workspace$/);
      await page.getByLabel("OCR language").selectOption("auto");
      const firstPost = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/text/jobs"));
      await page.getByRole("button", { name: "Start OCR" }).click();
      const firstCreated = await (await firstPost).json() as Job;
      const firstDurable = await waitForJob(page, "/v2/ocr/text/jobs", firstCreated.job_id);
      expect(firstDurable.job.status, JSON.stringify(firstDurable.job.error)).toBe("FAILED");
      expect(firstDurable.job.error?.code).toBe("LANGUAGE_DETECTION_UNCERTAIN");

      await expect(page.getByText("We couldn't reliably determine the OCR language. Choose the language(s) used in this document.", { exact: true })).toBeVisible({ timeout: 15_000 });
      const languageSelect = page.getByLabel("OCR language");
      await expect(languageSelect).toBeEnabled();
      await languageSelect.selectOption("eng");
      await expect(page.getByRole("button", { name: "Start OCR" })).toBeEnabled();

      const retryPost = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/ocr/text/jobs"));
      await page.getByRole("button", { name: "Start OCR" }).click();
      const retryCreated = await (await retryPost).json() as Job;
      expect(retryCreated.job_id).not.toBe(firstCreated.job_id);
      const retryDurable = await waitForJob(page, "/v2/ocr/text/jobs", retryCreated.job_id);
      expect(retryDurable.job.status, JSON.stringify(retryDurable.job.error)).toBe("SUCCEEDED");
      expect(retryDurable.job.result_available).toBe(true);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUT_DIR, "ocr-text-auto-uncertain-recovery.json"), `${JSON.stringify({
        failed_job_id: firstCreated.job_id,
        failed_statuses: firstDurable.statuses,
        failed_code: firstDurable.job.error?.code,
        retry_job_id: retryCreated.job_id,
        retry_statuses: retryDurable.statuses,
        retry_status: retryDurable.job.status,
        upload_preserved: true,
        explicit_language: "eng",
      }, null, 2)}\n`, "utf8");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
