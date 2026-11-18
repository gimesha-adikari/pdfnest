import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const API_ROOT = API + "/api";
const PDF_DIR = process.env.STUDIO_PDF_DIR!;
const EVIDENCE_DIR = process.env.STUDIO_EVIDENCE_DIR!;
const INSPECTOR = path.resolve("scripts/studio-compatibility/inspect-pdf.py");
const PYTHON = process.env.STUDIO_TEST_PYTHON || "python3";

function sha(bytes: Buffer | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function sha256Hex(value: unknown): string {
  const match = String(value ?? "").match(/^(?:sha256:)?([a-f0-9]{64})$/);
  return match?.[1] ?? "";
}
function event(caseName: string, eventName: string, data: Record<string, unknown> = {}) {
  fs.appendFileSync(path.join(EVIDENCE_DIR, "workflow-events.jsonl"), JSON.stringify({ at: new Date().toISOString(), case: caseName, event: eventName, ...data }) + "\n");
}
function run(command: string, args: string[], timeout = 180_000) {
  try { return execFileSync(command, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error: any) {
    const diagnostic = String(error?.stderr || "").replace(/\s+/g, " ").slice(0, 400);
    throw new Error("A required isolated CI test command failed: " + path.basename(command) + (diagnostic ? ": " + diagnostic : ""));
  }
}
async function nativePdf(file: string, line: string, rotation = 0) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]);
  first.drawText(line, { x: 72, y: 680, size: 27, font, color: rgb(0, 0, 0) });
  first.drawText("Neighboring native note remains", { x: 72, y: 632, size: 18, font });
  if (rotation) first.setRotation(degrees(rotation));
  const control = pdf.addPage([612, 792]);
  control.drawText("Untouched control page remains identical", { x: 72, y: 680, size: 22, font });
  const bytes = Buffer.from(await pdf.save());
  fs.writeFileSync(file, bytes);
  return { bytes, sourceSha256: sha(bytes), pageCount: 2 };
}
async function scannedPdf(file: string, line: string) {
  const imagePath = path.join(PDF_DIR, path.basename(file, ".pdf") + ".png");
  const script = [
    "from PIL import Image, ImageDraw, ImageFont", "import sys",
    "im=Image.new('RGB',(1800,2400),(248,247,243))",
    "d=ImageDraw.Draw(im)",
    "font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',92)",
    "d.text((145,390),sys.argv[2],font=font,fill=(20,20,20))",
    "d.text((145,530),'Scanned image baseline stays local',font=font,fill=(35,35,35))",
    "im.save(sys.argv[1],format='PNG')",
  ].join(";");
  run(PYTHON, ["-c", script, imagePath, line]);
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(fs.readFileSync(imagePath));
  const first = pdf.addPage([612, 792]);
  first.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText("Untouched scan control page remains identical", { x: 72, y: 680, size: 21, font });
  const bytes = Buffer.from(await pdf.save());
  fs.writeFileSync(file, bytes);
  return { bytes, sourceSha256: sha(bytes), pageCount: 2 };
}
function declareMask(source: string, target: string, mode: "word" | "line" | "scan-line", caseName: string): string {
  const output = path.join(PDF_DIR, caseName + "-mask.json");
  run(PYTHON, [INSPECTOR, "declare-mask", "--source", source, "--output", output, "--target", target, "--mode", mode]);
  const mask = JSON.parse(fs.readFileSync(output, "utf8")) as { declared_before_compile: boolean; source_sha256: string };
  if (!mask.declared_before_compile || mask.source_sha256 !== sha(fs.readFileSync(source))) throw new Error("Source-derived preservation mask was not fixed before compilation.");
  event(caseName, "mask_declared_before_compile", { source_sha256: mask.source_sha256, mask_sha256: sha(fs.readFileSync(output)) });
  return output;
}
type AuditWindow = Window & { __studioCiPreviewHashes?: string[] };
async function newAuthenticatedPage(browser: Browser, targetPath: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript((previewPath) => {
    const scope = window as AuditWindow;
    scope.__studioCiPreviewHashes = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, window.location.href);
      const body = init?.body;
      if (url.pathname.endsWith(previewPath) && body instanceof FormData) {
        const files: Blob[] = [];
        body.forEach((value) => { if (value instanceof Blob) files.push(value); });
        for (const file of files) {
          const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
          const value = Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
          scope.__studioCiPreviewHashes!.push(value);
        }
      }
      return originalFetch(input, init);
    };
  }, "/api/conversion/preview/session");
  await page.goto("/login?callbackUrl=" + encodeURIComponent(targetPath));
  await page.locator('input[type="email"]').fill(process.env.E2E_TEST_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === targetPath, { timeout: 45_000 });
  const sessionResponse = await context.request.get(API_ROOT + "/auth/session");
  const session = await sessionResponse.json();
  expect(sessionResponse.status()).toBe(200);
  expect(session).toMatchObject({ authenticated: true, type: "user" });
  expect(session.subscription?.tier).toBe("plus");
  expect(session.subscription?.status).toBe("active");
  return { context, page };
}
async function uploadStudio(page: Page, file: string, caseName: string) {
  await page.goto("/studio-v2");
  await expect(page.getByRole("heading", { name: "Open a PDF in Studio" })).toBeVisible({ timeout: 45_000 });
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/studio/v1/sessions/from-upload") && response.request().method() === "POST", { timeout: 60_000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const authorizeUpload = page.getByRole("button", { name: "Authorize Cloud upload", exact: true });
  await expect(authorizeUpload).toBeVisible({ timeout: 30_000 });
  event(caseName, "synthetic_source_upload_consent_presented");
  await authorizeUpload.click();
  event(caseName, "synthetic_source_upload_consent_confirmed_in_application");
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = await response.json();
  const sessionId = body?.session?.id;
  const baseVersionId = body?.active_version?.id;
  if (typeof sessionId !== "string" || typeof baseVersionId !== "string") {
    throw new Error("Studio V2 upload omitted its server-owned session/version identity.");
  }
  event(caseName, "server_owned_source_uploaded", {
    http_status: 201, session_id_sha256: sha(Buffer.from(sessionId)),
    base_version_id_sha256: sha(Buffer.from(baseVersionId)), source_response_sha256: sha(Buffer.from(JSON.stringify(body)))
  });
  await expect(page.getByTestId("studio-enter-edit-pdf")).toBeVisible({ timeout: 60_000 });
  return { sessionId, baseVersionId };
}
async function compileV2AndDownload(page: Page, context: BrowserContext, sessionId: string, caseName: string, text: string, replacement: string, fileName: string) {
  await page.getByTestId("studio-enter-edit-pdf").click();
  await expect(page.getByTestId("studio-edit-workspace")).toBeVisible({ timeout: 30_000 });
  const editorSurface = page.getByTestId("shared-editor-v2");
  await expect(editorSurface).toBeVisible({ timeout: 180_000 });
  event(caseName, "editor_extraction_ready_in_shared_layout_editor");
  const search = page.getByTestId("editor-v2-search");
  await search.fill(text);
  const searchCount = page.getByTestId("editor-v2-search-count");
  await expect(searchCount).toContainText("1 matches", { timeout: 30_000 });
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  const lineEditor = page.getByRole("textbox", { name: /^(Edit entire line|Text)$/ });
  await expect(lineEditor).toBeVisible();
  await lineEditor.fill(replacement);
  event(caseName, "single_layout_line_match_selected_and_edited");
  const compileRequest = page.waitForRequest((request) => request.url().includes("/jobs") && request.method() === "POST" && request.postDataJSON()?.operation === "editor_compile", { timeout: 30_000 });
  const compileResponse = page.waitForResponse((response) => response.url().includes("/jobs") && response.request().method() === "POST" && response.request().postDataJSON()?.operation === "editor_compile", { timeout: 30_000 });
  await page.locator('[aria-label="Studio Editor document bar"]').getByRole("button", { name: "Compile", exact: true }).click();
  const request = await compileRequest;
  const payload = request.postDataJSON();
  expect(payload.operation).toBe("editor_compile");
  expect(payload.parameters?.editor_state_id).toBeTruthy();
  expect(payload.parameters?.layout).toBeTruthy();
  expect(JSON.stringify(payload)).not.toContain("platen_word_edits.v1");
  const response = await compileResponse;
  expect(response.ok()).toBe(true);
  const submitted = await response.json();
  const jobId = submitted?.job?.id;
  if (typeof jobId !== "string") throw new Error("Studio V2 layout compile omitted its job identity.");
  event(caseName, "layout_compile_submitted", {
    operation: payload.operation, response_status: response.status(), worker_job_id_sha256: sha(Buffer.from(jobId))
  });

  let terminalJob: any = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const jobResponse = await context.request.get(API_ROOT + "/studio/v1/sessions/" + encodeURIComponent(sessionId) + "/jobs/" + encodeURIComponent(jobId));
    if (!jobResponse.ok()) throw new Error("Studio V2 authorized session job lookup failed with HTTP " + jobResponse.status());
    terminalJob = (await jobResponse.json())?.job;
    if (terminalJob?.status === "succeeded" || terminalJob?.status === "failed" || terminalJob?.status === "cancelled") break;
    await page.waitForTimeout(1000);
  }
  if (terminalJob?.status !== "succeeded" || typeof terminalJob.result_version_id !== "string") {
    event(caseName, "layout_compile_terminal_failure", { status: terminalJob?.status || "unknown", error_code: terminalJob?.error_code || null });
    throw new Error("Studio V2 layout compilation did not produce a successful result version.");
  }
  if (terminalJob.job_type !== "editor_compile") throw new Error("Studio V2 job record did not confirm the layout compile operation.");
  event(caseName, "worker_compile_succeeded", {
    status: terminalJob.status, job_id_sha256: sha(Buffer.from(jobId)),
    result_version_id_sha256: sha(Buffer.from(terminalJob.result_version_id))
  });
  await expect(page.getByTestId("studio-edit-workspace")).toBeHidden({ timeout: 60_000 });
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  event(caseName, "compile_returned_to_verified_session_canvas");
  const exportButton = page.getByRole("button", { name: "Export PDF", exact: true });
  await expect(exportButton).toBeVisible({ timeout: 60_000 });
  await expect(exportButton).toBeEnabled({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await exportButton.click();
  const download = await downloadPromise;
  const destination = path.join(PDF_DIR, fileName);
  await download.saveAs(destination);
  event(caseName, "actual_ui_export_download", { download_sha256: sha(fs.readFileSync(destination)), compiled_job_id_sha256: sha(Buffer.from(jobId)) });
  return { path: destination, jobId, resultVersionId: terminalJob.result_version_id };
}
async function validateCandidate(source: string, candidate: string, mask: string, args: {
  expected: string; stale: string; neighbor: string; pages: number; mode: "text" | "scan"; neighborPosition?: string; allowImageReencoding?: boolean;
}, caseName: string) {
  const output = path.join(EVIDENCE_DIR, caseName + "-pdf-validation.json");
  const cli = [INSPECTOR, "verify", "--source", source, "--candidate", candidate, "--mask", mask, "--output", output,
    "--expected", args.expected, "--stale", args.stale, "--neighbor", args.neighbor, "--pages", String(args.pages), "--mode", args.mode];
  if (args.neighborPosition) cli.push("--neighbor-position", args.neighborPosition);
  if (args.allowImageReencoding) cli.push("--allow-image-reencoding");
  try {
    run(PYTHON, cli, 900_000);
  } catch (error) {
    if (fs.existsSync(output)) {
      const failed = JSON.parse(fs.readFileSync(output, "utf8"));
      event(caseName, "independent_pdf_validation_failed", {
        source_sha256: failed.source_sha256, candidate_sha256: failed.candidate_sha256,
        source_image_count: failed.source_image_sha256.length,
        candidate_image_count: failed.candidate_image_sha256.length,
        source_image_streams_preserved: failed.source_image_streams_preserved,
        image_stream_policy: failed.image_stream_policy,
        pixel_failures: failed.pixel_failures
      });
    }
    throw error;
  }
  const validation = JSON.parse(fs.readFileSync(output, "utf8"));
  event(caseName, "independent_pdf_validation_passed", {
    source_sha256: validation.source_sha256, candidate_sha256: validation.candidate_sha256,
    comparison_count: validation.pixel_metrics.length,
    source_image_count: validation.source_image_sha256.length,
    candidate_image_count: validation.candidate_image_sha256.length,
    source_image_streams_preserved: validation.source_image_streams_preserved,
    image_stream_policy: validation.image_stream_policy
  });
  return validation;
}
async function getWorkerArtifact(context: BrowserContext, jobId: string, caseName: string) {
  const recordResponse = await context.request.get(API_ROOT + "/edit/jobs/" + encodeURIComponent(jobId));
  if (!recordResponse.ok()) throw new Error("Authorized worker job record was unavailable.");
  const record = await recordResponse.json();
  if (record.status !== "succeeded") throw new Error("Worker compile did not reach succeeded status.");
  const expectedHash = sha256Hex(record.result?.artifact_sha256);
  if (!expectedHash) throw new Error("Worker did not return a valid artifact SHA-256.");
  const artifactResponse = await context.request.get(API_ROOT + "/edit/jobs/" + encodeURIComponent(jobId) + "/download");
  if (!artifactResponse.ok()) throw new Error("Authorized worker artifact endpoint did not return the successful PDF.");
  const bytes = Buffer.from(await artifactResponse.body());
  const actualHash = sha(bytes);
  if (actualHash !== expectedHash) throw new Error("Worker artifact bytes did not match worker SHA-256 metadata.");
  const output = path.join(PDF_DIR, caseName + "-worker.pdf");
  fs.writeFileSync(output, bytes);
  event(caseName, "worker_artifact_verified", { worker_artifact_sha256: actualHash });
  return { path: output, sha256: actualHash, record };
}
async function verifyPreviewHash(page: Page, expected: string, caseName: string) {
  await expect(page.getByRole("button", { name: "Download verified PDF", exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect.poll(async () => page.evaluate((hash) => (window as AuditWindow).__studioCiPreviewHashes?.includes(hash) || false, expected), { timeout: 60_000 }).toBe(true);
  event(caseName, "verified_preview_candidate_hash_matches_worker", { preview_sha256: expected });
}
async function actualGeneralEditorDownloads(page: Page, hash: string, caseName: string) {
  await page.getByRole("button", { name: "Download verified PDF", exact: true }).click();
  await expect(page).toHaveURL(/\/edit-pdf\/download$/, { timeout: 60_000 });
  const paths: string[] = [];
  for (let index = 1; index <= 2; index++) {
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Download File", exact: true }).click();
    const download = await downloadPromise;
    const destination = path.join(PDF_DIR, caseName + "-ui-download-" + index + ".pdf");
    await download.saveAs(destination);
    const actual = sha(fs.readFileSync(destination));
    expect(actual).toBe(hash);
    paths.push(destination);
    event(caseName, "actual_ui_download", { repetition: index, download_sha256: actual });
  }
  return paths;
}

test.describe("Pinned full-stack Studio compatibility acceptance", () => {
  test("Studio V2 native unrotated layout edit, preview and download", async ({ browser }) => {
    const name = "studio-v2-native-0";
    const source = path.join(PDF_DIR, name + "-source.pdf");
    const fixture = await nativePdf(source, "Studio layout Alpha Bravo", 0);
    const mask = declareMask(source, "Studio layout Alpha Bravo", "line", name);
    const { context, page } = await newAuthenticatedPage(browser, "/studio-v2");
    try {
      const session = await uploadStudio(page, source, name);
      const compiled = await compileV2AndDownload(page, context, session.sessionId, name, "Studio layout Alpha Bravo", "Studio layout Alpha Charlie", name + "-download.pdf");
      const candidate = compiled.path;
      const validation = await validateCandidate(source, candidate, mask, {
        expected: "Studio layout Alpha Charlie", stale: "Studio layout Alpha Bravo",
        neighbor: "Untouched control page remains identical", pages: fixture.pageCount, mode: "text",
      }, name);
      expect(validation.geometry[0].rotation).toBe(0);
      event(name, "complete", { source_sha256: fixture.sourceSha256, download_sha256: sha(fs.readFileSync(candidate)) });
    } finally { await context.close(); }
  });

  test("Studio V2 native 90-degree rotation layout edit, preview and download", async ({ browser }) => {
    const name = "studio-v2-native-90";
    const source = path.join(PDF_DIR, name + "-source.pdf");
    const fixture = await nativePdf(source, "Studio layout Alpha Bravo", 90);
    const mask = declareMask(source, "Studio layout Alpha Bravo", "line", name);
    const { context, page } = await newAuthenticatedPage(browser, "/studio-v2");
    try {
      const session = await uploadStudio(page, source, name);
      const compiled = await compileV2AndDownload(page, context, session.sessionId, name, "Studio layout Alpha Bravo", "Studio layout Alpha Charlie", name + "-download.pdf");
      const candidate = compiled.path;
      const validation = await validateCandidate(source, candidate, mask, {
        expected: "Studio layout Alpha Charlie", stale: "Studio layout Alpha Bravo",
        neighbor: "Untouched control page remains identical", pages: fixture.pageCount, mode: "text",
      }, name);
      expect(validation.geometry[0].rotation).toBe(90);
      event(name, "complete", { source_sha256: fixture.sourceSha256, download_sha256: sha(fs.readFileSync(candidate)) });
    } finally { await context.close(); }
  });

  test("Studio V2 scanned image OCR layout edit, preview and download", async ({ browser }) => {
    const name = "studio-v2-scanned";
    const source = path.join(PDF_DIR, name + "-source.pdf");
    const fixture = await scannedPdf(source, "Studio scanned Alpha Bravo");
    const mask = declareMask(source, "Studio scanned Alpha Bravo", "scan-line", name);
    const { context, page } = await newAuthenticatedPage(browser, "/studio-v2");
    try {
      const session = await uploadStudio(page, source, name);
      const compiled = await compileV2AndDownload(page, context, session.sessionId, name, "Studio scanned Alpha Bravo", "Studio scanned Alpha Charlie", name + "-download.pdf");
      const candidate = compiled.path;
      const validation = await validateCandidate(source, candidate, mask, {
        expected: "Studio scanned Alpha Charlie", stale: "Studio scanned Alpha Bravo",
        neighbor: "Untouched scan control page remains identical", pages: fixture.pageCount, mode: "scan",
        allowImageReencoding: true,
      }, name);
      expect(validation.source_image_sha256.length).toBeGreaterThan(0);
      event(name, "complete", { source_sha256: fixture.sourceSha256, download_sha256: sha(fs.readFileSync(candidate)) });
    } finally { await context.close(); }
  });

  test("Classic Studio existing layout editor and export remain compatible", async ({ browser }) => {
    const name = "classic-studio-native";
    const source = path.join(PDF_DIR, name + "-source.pdf");
    const fixture = await nativePdf(source, "Classic layout Alpha Bravo", 0);
    const mask = declareMask(source, "Classic layout Alpha Bravo", "line", name);
    const { context, page } = await newAuthenticatedPage(browser, "/studio");
    try {
      await page.locator('input[type="file"]').first().setInputFiles(source);
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({ timeout: 60_000 });
      const layoutEditTool = page.locator('button[title="Edit"]');
      await expect(layoutEditTool).toHaveCount(1);
      await layoutEditTool.click();
      await expect(page.getByText("Precision PDF Layout Editor", { exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Pages mapped", { exact: true })).toBeVisible({ timeout: 180_000 });
      const inputs = page.locator('input[type="text"]');
      const readLayoutInputValues = async () => {
        const values: string[] = [];
        for (let i = 0; i < await inputs.count(); i++) values.push(await inputs.nth(i).inputValue());
        return values;
      };
      await expect.poll(async () => (await readLayoutInputValues()).some((value) => value.includes("Classic layout Alpha Bravo")), { timeout: 180_000 }).toBe(true);
      const inputValues = await readLayoutInputValues();
      event(name, "classic_editor_extraction_ready", { layout_input_count: inputValues.length, exact_target_present: inputValues.some((value) => value.includes("Classic layout Alpha Bravo")) });
      let target: any = null;
      for (let i = 0; i < await inputs.count(); i++) {
        const item = inputs.nth(i);
        if ((await item.inputValue()).includes("Classic layout Alpha Bravo")) { target = item; break; }
      }
      if (!target) throw new Error("Classic Studio layout extraction did not expose the exact synthetic line.");
      await target.fill("Classic layout Alpha Charlie");
      const requestPromise = page.waitForRequest((request) => request.url().endsWith("/api/edit/compile") && request.method() === "POST", { timeout: 30_000 });
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/edit/compile") && response.request().method() === "POST", { timeout: 30_000 });
      await page.getByRole("button", { name: /Export Precision Vector Document Changes/ }).click();
      const request = await requestPromise;
      const payload = request.postDataJSON();
      const sourceTrackerPresent = typeof payload.source_tracker === "string" && payload.source_tracker.trim().length > 0;
      const uprightTrackerPresent = typeof payload.upright_tracker === "string" && payload.upright_tracker.trim().length > 0;
      event(name, "layout_compile_request_observed", {
        payload_keys: Object.keys(payload).sort(), page_count: Array.isArray(payload.pages) ? payload.pages.length : null,
        source_tracker_present: sourceTrackerPresent, upright_tracker_present: uprightTrackerPresent,
        precise_word_protocol_absent: !JSON.stringify(payload).includes("platen_word_edits.v1"),
      });
      expect(payload.pages).toBeTruthy();
      expect(JSON.stringify(payload)).not.toContain("platen_word_edits.v1");
      const response = await responsePromise;
      const responseBody = await response.json();
      event(name, "layout_compile_response_observed", {
        http_status: response.status(), response_keys: Object.keys(responseBody).sort(),
        success: responseBody.success === true,
        job_id_present: typeof responseBody.job_id === "string" && responseBody.job_id.length > 0,
        error_code_present: typeof responseBody.code === "string" && responseBody.code.length > 0,
      });
      expect(response.ok()).toBe(true);
      expect(sourceTrackerPresent).toBe(true);
      expect(uprightTrackerPresent).toBe(true);
      const submission = responseBody;
      if (!submission.job_id) throw new Error("Classic Studio layout compile omitted its worker job identity.");
      event(name, "layout_protocol_submitted", { response_status: response.status(), pages_present: true, source_tracker_present: true, no_precise_word_protocol: true });
      await expect(page.getByText("Edited PDF loaded back into Studio.", { exact: true })).toBeVisible({ timeout: 180_000 });
      await expect(page.getByAltText("Preview page 1")).toBeVisible({ timeout: 60_000 });

      let record: any = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        const jobResponse = await context.request.get(API_ROOT + "/edit/jobs/" + encodeURIComponent(submission.job_id));
        if (jobResponse.ok()) { record = await jobResponse.json(); if (record.status === "succeeded" || record.status === "failed") break; }
        await page.waitForTimeout(1000);
      }
      expect(record?.status).toBe("succeeded");
      const workerHash = sha256Hex(record.result?.artifact_sha256);
      expect(workerHash).toMatch(/^[a-f0-9]{64}$/);
      const workerResponse = await context.request.get(API_ROOT + "/edit/jobs/" + encodeURIComponent(submission.job_id) + "/download");
      expect(workerResponse.ok()).toBe(true);
      const workerBytes = Buffer.from(await workerResponse.body());
      expect(sha(workerBytes)).toBe(workerHash);
      fs.writeFileSync(path.join(PDF_DIR, name + "-worker.pdf"), workerBytes);

      await page.getByText("File", { exact: true }).first().click();
      await page.getByRole("button", { name: "Export", exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Export Document" })).toBeVisible();
      const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
      await page.getByRole("button", { name: "Export PDF", exact: true }).click();
      const download = await downloadPromise;
      const destination = path.join(PDF_DIR, name + "-download.pdf");
      await download.saveAs(destination);
      expect(sha(fs.readFileSync(destination))).toBe(workerHash);
      const validation = await validateCandidate(source, destination, mask, {
        expected: "Classic layout Alpha Charlie", stale: "Classic layout Alpha Bravo",
        neighbor: "Untouched control page remains identical", pages: fixture.pageCount, mode: "text",
      }, name);
      event(name, "complete", { worker_artifact_sha256: workerHash, ui_download_sha256: sha(fs.readFileSync(destination)), comparisons: validation.pixel_metrics.length });
    } finally { await context.close(); }
  });

  test("General Editor source-bound precise word edit, verified preview and both actual downloads", async ({ browser }) => {
    const name = "general-editor-word-protocol";
    const source = path.join(PDF_DIR, name + "-source.pdf");
    const fixture = await nativePdf(source, "Ministry of Synthetic Records", 0);
    const mask = declareMask(source, "Ministry", "word", name);
    const { context, page } = await newAuthenticatedPage(browser, "/edit-pdf");
    try {
      await page.locator('input[type="file"]').first().setInputFiles(source);
      await expect(page).toHaveURL(/\/edit-pdf\/workspace/, { timeout: 90_000 });
      const target = page.getByRole("button", { name: "Edit word Ministry", exact: true }).first();
      await expect(target).toBeVisible({ timeout: 180_000 });
      const wordId = await target.getAttribute("data-word-id");
      expect(wordId).toBeTruthy();
      await target.click();
      const editor = page.getByTestId("word-inline-editor");
      await editor.fill("Office");
      await editor.press("Enter");

      const requestPromise = page.waitForRequest((request) => request.url().endsWith("/api/edit/compile") && request.method() === "POST", { timeout: 60_000 });
      const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/edit/compile") && response.request().method() === "POST", { timeout: 60_000 });
      await page.getByRole("button", { name: "Prepare export", exact: true }).click();
      const request = await requestPromise;
      const payload = request.postDataJSON();
      expect(payload.edit_protocol).toBe("platen_word_edits.v1");
      expect(payload.source_tracker).toBeTruthy();
      expect(payload.extraction_job_id).toBeTruthy();
      const baselineDigest = sha256Hex(payload.baseline_digest);
      expect(baselineDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(payload.edits).toHaveLength(1);
      expect(payload.edits[0]).toMatchObject({ word_id: wordId, expected_original_text: "Ministry", replacement_text: "Office", fit_policy: "preserve_neighbors" });
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      const submission = await response.json();
      if (!submission.job_id) throw new Error("General Editor compile omitted its worker job identity.");
      event(name, "source_bound_word_edit_submitted", {
        worker_job_id_sha256: sha(Buffer.from(submission.job_id)), source_sha256: fixture.sourceSha256,
        source_tracker_sha256: sha(Buffer.from(payload.source_tracker)),
        baseline_digest: baselineDigest, word_id_sha256: sha(Buffer.from(wordId!)),
        operation_sha256: sha(Buffer.from(JSON.stringify(payload.edits[0]))),
      });

      let record: any = null;
      for (let attempt = 0; attempt < 300; attempt++) {
        const jobResponse = await context.request.get(API_ROOT + "/edit/jobs/" + encodeURIComponent(submission.job_id));
        if (jobResponse.ok()) {
          record = await jobResponse.json();
          if (record.status === "succeeded" || record.status === "failed" || record.status === "cancelled") break;
        }
        await page.waitForTimeout(1000);
      }
      if (record?.status !== "succeeded") {
        const workerResult = record?.result && typeof record.result === "object" ? record.result : {};
        const checks = workerResult.checks && typeof workerResult.checks === "object" ? workerResult.checks : {};
        event(name, "worker_compile_terminal_failure", {
          job_id_sha256: sha(Buffer.from(submission.job_id)), status: record?.status ?? "unknown",
          error_code: record?.error_code ?? record?.error?.code ?? workerResult.error_code ?? null,
          worker_message: typeof record?.message === "string" ? record.message : null,
          error_present: typeof record?.error === "string" && record.error.length > 0,
          worker_result_keys: Object.keys(workerResult).sort(),
          validation_check_keys: Object.keys(checks).sort(),
          failed_validation_checks: Object.entries(checks).filter(([, value]) => value === false).map(([key]) => key).sort(),
          boolean_validation_checks: Object.fromEntries(Object.entries(checks).filter(([, value]) => typeof value === "boolean")),
        });
        throw new Error("General Editor worker job did not reach succeeded status.");
      }
      expect(record.result?.compiler_protocol).toBe("platen_word_edits.v1");
      expect(sha256Hex(record.result?.artifact_sha256)).toMatch(/^[a-f0-9]{64}$/);
      event(name, "worker_compile_succeeded", { job_id_sha256: sha(Buffer.from(submission.job_id)), artifact_sha256: sha256Hex(record.result?.artifact_sha256) });
      await expect(page.getByRole("region", { name: "Verified compiled PDF preview" })).toBeVisible({ timeout: 120_000 });
      expect(await page.getByRole("textbox", { name: "Find selectable word", exact: true }).count()).toBe(0);
      const artifact = await getWorkerArtifact(context, submission.job_id, name);
      await verifyPreviewHash(page, artifact.sha256, name);
      const downloads = await actualGeneralEditorDownloads(page, artifact.sha256, name);
      expect(sha(fs.readFileSync(downloads[0]))).toBe(sha(fs.readFileSync(downloads[1])));
      const validation = await validateCandidate(source, downloads[0], mask, {
        expected: "Office of Synthetic Records", stale: "Ministry of Synthetic Records",
        neighbor: "Untouched control page remains identical", pages: fixture.pageCount,
        mode: "text", neighborPosition: "of",
      }, name);
      event(name, "complete", {
        source_sha256: fixture.sourceSha256, worker_artifact_sha256: artifact.sha256,
        verified_preview_sha256: artifact.sha256, ui_download_sha256: sha(fs.readFileSync(downloads[0])),
        repeat_download_sha256: sha(fs.readFileSync(downloads[1])), visual_comparisons: validation.pixel_metrics.length,
      });
    } finally { await context.close(); }
  });
});
