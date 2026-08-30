import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { authenticateProUser, getE2EApiBaseUrl } from "../helpers/auth";

type Action = "highlight" | "underline" | "strikeout";
type Job = {
  job_id: string;
  status: string;
  profile: string;
  progress: { completed_pages: number; total_pages: number; failed_pages?: number[]; page_statuses: Record<string, string>; percent: number };
  result_available: boolean;
  error?: { code: string; message: string };
};

const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), "../output/playwright/phase7-markup-local");
const WORKER_PYTHON = process.env.PDFNEST_WORKER_PYTHON || path.resolve(process.cwd(), "../pdfnest-worker/.venv/bin/python");

function makeScannedPdf(): Buffer {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pdfnest-phase7-scan-"));
  const imagePath = path.join(directory, "scan.png");
  try {
    execFileSync("python3", ["-c", [
      "from PIL import Image, ImageDraw, ImageFont",
      "import sys",
      "im=Image.new('RGB', (1200, 1600), 'white')",
      "d=ImageDraw.Draw(im)",
      "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 54)",
      "d.text((120, 220), 'Markup Alpha Bravo', font=font, fill='black')",
      "d.text((120, 340), 'Native and OCR V2', font=font, fill='black')",
      "im.save(sys.argv[1])",
    ].join(";"), imagePath]);
    const image = fs.readFileSync(imagePath);
    return image;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function makeScannedPdfDocument(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const image = await pdf.embedPng(makeScannedPdf());
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
  return Buffer.from(await pdf.save());
}

async function makeNativePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.drawText("Normal Alpha Bravo", { x: 80, y: 650, size: 40 });
  page.drawText("Native PDF V2", { x: 80, y: 570, size: 30 });
  return Buffer.from(await pdf.save());
}

function inspectPdf(sourcePath: string, outputPath: string, action: Action, query: string): Record<string, unknown> {
  const script = [
    "import hashlib, json, sys, numpy as np",
    "import fitz",
    "source=fitz.open(sys.argv[1]); output=fitz.open(sys.argv[2])",
    "assert output.page_count == source.page_count == 1",
    "sp, op = source[0], output[0]",
    "assert op.rect.width == sp.rect.width and op.rect.height == sp.rect.height",
    "assert op.get_images(full=True) == sp.get_images(full=True)",
    "source_pixels=sp.get_pixmap(alpha=False, annots=False).samples",
    "output_pixels=op.get_pixmap(alpha=False, annots=False).samples",
    "source_array=np.frombuffer(source_pixels,dtype=np.uint8); output_array=np.frombuffer(output_pixels,dtype=np.uint8); delta=np.abs(source_array.astype(np.int16)-output_array.astype(np.int16))",
    "assert int(delta.max()) <= 1 and int(np.count_nonzero(delta)) < max(1,int(source_array.size*0.01))",
    "text=op.get_text('text')",
    "annotations=[{'type': ann.type[1], 'rect': [ann.rect.x0, ann.rect.y0, ann.rect.x1, ann.rect.y1]} for ann in (op.annots() or [])]",
    "expected={'highlight':'Highlight','underline':'Underline','strikeout':'StrikeOut'}[sys.argv[3]]",
    "assert len(annotations) >= 1 and all(item['type'] == expected for item in annotations)",
    "print(json.dumps({'page_count': output.page_count, 'page_size': [op.rect.width, op.rect.height], 'source_image_count': len(sp.get_images(full=True)), 'output_image_count': len(op.get_images(full=True)), 'text_char_count': len(text), 'annotation_count': len(annotations), 'annotations': annotations, 'visible_raster_equal_without_annotations': True, 'raster_max_delta': int(delta.max()), 'raster_changed_samples': int(np.count_nonzero(delta)), 'pdf_header': open(sys.argv[2],'rb').read(5).decode('ascii')}))",
  ].join("; ");
  return JSON.parse(execFileSync(WORKER_PYTHON, ["-c", script, sourcePath, outputPath, action, query], { encoding: "utf8" }));
}

async function waitForJob(page: Page, jobId: string): Promise<{ job: Job; statuses: string[] }> {
  const statuses: string[] = [];
  const deadline = Date.now() + 120_000;
  let job: Job | null = null;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/markup/jobs/${jobId}`);
    if (response.status() === 429) {
      const retryAfter = Number(response.headers()["retry-after"] || "2");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Math.min(5000, retryAfter * 1000))));
      continue;
    }
    expect(response.ok(), `markup status HTTP ${response.status()}`).toBeTruthy();
    job = await response.json() as Job;
    if (statuses[statuses.length - 1] !== job.status) statuses.push(job.status);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return { job, statuses };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for markup job ${jobId}: ${statuses.join(", ")}`);
}

async function runMarkup(page: Page, action: Action, file: { name: string; mimeType: string; buffer: Buffer }, query: string, name: string) {
  await page.goto(`/${action}-pdf-v2/workspace`);
  await expect(page.getByRole("heading", { name: `${action === "strikeout" ? "Strikeout" : action[0].toUpperCase() + action.slice(1)} PDF V2` })).toBeVisible();
  await page.getByLabel("PDF document").setInputFiles(file);
  await page.getByLabel("Text query").fill(query);
  await page.getByLabel("Selection source").selectOption("smart");

  const postResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/v2/ocr/markup/${action}/jobs`));
  const resultResponsePromise = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/v2/ocr/markup/jobs/") && response.url().endsWith("/result"), { timeout: 120_000 });
  await page.getByRole("button", { name: `${action === "strikeout" ? "Strike out" : action[0].toUpperCase() + action.slice(1)} text` }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = await postResponse.json() as Job;
  const headers = postResponse.request().headers();
  expect(headers["x-request-id"]).toBeTruthy();
  expect(headers["idempotency-key"]).toBeTruthy();

  const durable = await waitForJob(page, created.job_id);
  expect(durable.job.status, JSON.stringify(durable.job.error)).toBe("SUCCEEDED");
  expect(durable.job.profile).toBe("MARKUP_V2");
  expect(durable.job.progress.total_pages).toBe(1);
  expect(durable.job.progress.completed_pages).toBe(1);
  expect(durable.job.progress.failed_pages ?? []).toEqual([]);
  expect(durable.job.result_available).toBe(true);
  const resultResponse = await resultResponsePromise;
  expect(resultResponse.status()).toBe(200);
  expect(resultResponse.headers()["content-type"] || "").toMatch(/^application\/pdf/i);
  const pdfBytes = await resultResponse.body();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, name);
  const sourcePath = path.join(OUTPUT_DIR, `${name}.source.pdf`);
  fs.writeFileSync(outputPath, pdfBytes);
  fs.writeFileSync(sourcePath, file.buffer);
    const inspection = inspectPdf(sourcePath, outputPath, action, query);
    if (action === "highlight") {
      expect((inspection as { text_char_count: number }).text_char_count).toBeGreaterThan(0);
    }
    return { job: durable.job, statuses: durable.statuses, requestId: headers["x-request-id"], idempotencyKey: headers["idempotency-key"], outputPath, inspection };
}

test.describe.serial("Phase 7 OCR-aware markup real local full-stack E2E", () => {
  test("native, scanned, and all three annotation consumers use one authenticated durable path", async ({ page }) => {
    await authenticateProUser(page);
    const native = await makeNativePdf();
    const scanned = await makeScannedPdfDocument();

    const highlight = await runMarkup(page, "highlight", { name: "native.pdf", mimeType: "application/pdf", buffer: native }, "Normal", "highlight-native.pdf");
    const underline = await runMarkup(page, "underline", { name: "scan.pdf", mimeType: "application/pdf", buffer: scanned }, "Markup Alpha", "underline-scanned.pdf");
    const strikeout = await runMarkup(page, "strikeout", { name: "scan.pdf", mimeType: "application/pdf", buffer: scanned }, "Alpha Bravo", "strikeout-scanned.pdf");
    expect((highlight.inspection as { annotations: Array<{ type: string }> }).annotations[0].type).toBe("Highlight");
    expect((underline.inspection as { annotations: Array<{ type: string }> }).annotations[0].type).toBe("Underline");
    expect((strikeout.inspection as { annotations: Array<{ type: string }> }).annotations[0].type).toBe("StrikeOut");
    expect(underline.statuses).toContain("SUCCEEDED");
    expect(strikeout.statuses).toContain("SUCCEEDED");

    const replay = await page.request.post(`${getE2EApiBaseUrl()}/v2/ocr/markup/highlight/jobs`, {
      headers: { "Idempotency-Key": highlight.idempotencyKey, "X-Request-ID": `${highlight.requestId}-replay` },
      multipart: { file: { name: "native.pdf", mimeType: "application/pdf", buffer: native }, query: "Normal", mode: "smart", language: "eng", routing_policy: "FAST", color: "#FFFF00" },
    });
    expect(replay.status()).toBe(202);
    const replayBody = await replay.json() as { job_id: string; idempotent_replay?: boolean };
    expect(replayBody.job_id).toBe(highlight.job.job_id);
    expect(replayBody.idempotent_replay).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/highlight-pdf-v2/workspace");
    await expect(page.getByRole("heading", { name: "Highlight PDF V2" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    fs.writeFileSync(path.join(OUTPUT_DIR, "e2e-evidence.json"), `${JSON.stringify({
      native_input_bytes: native.length,
      scanned_input_bytes: scanned.length,
      highlight,
      underline,
      strikeout,
      idempotency_replay: { status: replay.status(), body: replayBody },
    }, null, 2)}\n`, "utf8");
  });
});
