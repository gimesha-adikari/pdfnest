import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const REPORT_ROOT = process.env.P2_REPORT_ROOT || "/home/gimesha/My_Projects/platen-audit-reports/production-p2-remediation-20260915";
const BROWSER_EVIDENCE = path.join(REPORT_ROOT, "evidence", "browser");
const ARTIFACT_EVIDENCE = path.join(REPORT_ROOT, "evidence", "artifacts");
const API_BASE = (process.env.E2E_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

const NATIVE_PDF = "/home/gimesha/My_Projects/platen/pdfnest/tests/fixtures/normal_text.pdf";
const SCANNED_PDF = "/home/gimesha/pdfnest-tests/ocr-extracted-text-29-rotated (1).pdf";
const MIXED_PDF = "/home/gimesha/My_Projects/platen/benchmarks/ocr_eval/fixtures_generated/synth_mixed.pdf";
const SEARCHABLE_IMAGE = "/home/gimesha/Downloads/6670c2153.png";

type RequestRecord = {
  method: string;
  url: string;
  status?: number;
  requestId?: string;
  taskId?: string;
};

function ensureEvidenceDirs() {
  fs.mkdirSync(BROWSER_EVIDENCE, { recursive: true });
  fs.mkdirSync(ARTIFACT_EVIDENCE, { recursive: true });
}

function writeJson(name: string, value: unknown) {
  ensureEvidenceDirs();
  fs.writeFileSync(path.join(BROWSER_EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loginViaUi(page: Page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error("Dedicated local E2E credentials are required.");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  const session = await page.request.get(`${API_BASE}/api/auth/session`);
  expect(session.status()).toBe(200);
  const payload = await session.json();
  expect(payload.authenticated).toBe(true);
  expect(payload.user?.id).toEqual(expect.any(String));
  return payload.user.id as string;
}

function telemetry(page: Page) {
  const requests: RequestRecord[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("localhost:8080") && !url.includes("/api/")) return;
    const interesting = request.method() === "POST" || url.includes("/api/v1/tasks/") || url.includes("/api/v1/download/") || url.includes("/api/v2/") || url.includes("/api/ocr/") || url.includes("/api/storage/") || url.includes("/api/conversion/");
    if (!interesting) return;
    requests.push({
      method: request.method(),
      url,
      requestId: request.headers()["x-request-id"] || request.headers()["x-correlation-id"],
    });
  });
  page.on("response", (response) => {
    const existing = requests.find((item) => item.url === response.url() && item.status === undefined);
    if (existing) existing.status = response.status();
  });
  return requests;
}

function validatePdf(artifactPath: string, expectedText?: RegExp) {
  const bytes = fs.readFileSync(artifactPath);
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const qpdf = execFileSync("qpdf", ["--check", artifactPath], { encoding: "utf8" });
  const info = execFileSync("pdfinfo", [artifactPath], { encoding: "utf8" });
  const pagesMatch = info.match(/^Pages:\s+(\d+)/m);
  const pages = pagesMatch ? Number(pagesMatch[1]) : 0;
  expect(pages).toBeGreaterThan(0);
  const text = execFileSync("pdftotext", [artifactPath, "-"], { encoding: "utf8" });
  if (expectedText) expect(text).toMatch(expectedText);

  const renderPrefix = artifactPath.replace(/\.pdf$/i, "-page-1");
  execFileSync("pdftoppm", ["-f", "1", "-singlefile", "-png", artifactPath, renderPrefix], { stdio: "pipe" });
  const renderPath = `${renderPrefix}.png`;
  expect(fs.statSync(renderPath).size).toBeGreaterThan(0);

  return {
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    pages,
    qpdf: qpdf.trim() || "no warnings; operation succeeded",
    extractedText: text.slice(0, 2000),
    renderPath,
  };
}

async function acceptMarkdown(page: Page, filePath: string, evidenceName: string, expected: RegExp) {
  const requests = telemetry(page);
  await page.goto("/pdf-to-markdown-v2");
  await page.evaluate(() => window.localStorage.clear());
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await expect(page).toHaveURL(/\/pdf-to-markdown-v2\/workspace$/);
  await expect(page.getByText(path.basename(filePath), { exact: true })).toBeVisible();
  const action = page.getByRole("button", { name: "Convert to Markdown", exact: true });
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.getByText("Your Markdown result", { exact: true })).toBeVisible({ timeout: 180_000 });
  const rendered = (await page.locator("pre").textContent()) || "";
  expect(rendered.trim().length).toBeGreaterThan(20);
  expect(rendered).toMatch(expected);
  expect(rendered.trim()).not.toBe("a");
  expect(rendered.trim()).not.toBe("a\\n");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .md", exact: true }).click();
  const download = await downloadPromise;
  const artifactPath = path.join(ARTIFACT_EVIDENCE, `${evidenceName}.md`);
  await download.saveAs(artifactPath);
  const downloaded = fs.readFileSync(artifactPath, "utf8");
  expect(downloaded).toBe(rendered);
  expect(Buffer.from(downloaded, "utf8").toString("utf8")).toBe(downloaded);

  writeJson(`${evidenceName}.json`, {
    input: path.basename(filePath),
    renderedChars: rendered.length,
    downloadedChars: downloaded.length,
    downloadedSha256: crypto.createHash("sha256").update(downloaded, "utf8").digest("hex"),
    browserResultEqualsDownload: downloaded === rendered,
    requestTrace: requests,
    artifactPath,
  });
}

async function acceptLegacyTaskPdf(page: Page, route: string, filePath: string, actionName: string, evidenceName: string, expectedText: RegExp) {
  const requests = telemetry(page);
  await page.goto(route);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(filePath);
  await expect(page).toHaveURL(new RegExp(`${route}/workspace$`));
  await expect(page.getByRole("button", { name: actionName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: actionName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${route}/download$`), { timeout: 180_000 });
  await expect(page.getByRole("button", { name: "Download File", exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download File", exact: true }).click();
  const download = await downloadPromise;
  const artifactPath = path.join(ARTIFACT_EVIDENCE, `${evidenceName}.pdf`);
  await download.saveAs(artifactPath);
  const validation = validatePdf(artifactPath, expectedText);
  writeJson(`${evidenceName}.json`, {
    input: path.basename(filePath),
    browserDownloadSuggestedName: download.suggestedFilename(),
    artifactPath,
    finalBrowserUrl: page.url(),
    requestTrace: requests,
    validation,
  });
  return validation;
}

test.describe("P2 Wave 1 local browser artifact acceptance", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000);
    await loginViaUi(page);
  });

  test("TOOL-004 native-text PDF produces meaningful Markdown and matching download", async ({ page }) => {
    await acceptMarkdown(page, NATIVE_PDF, "tool-004-native", /Sample Text Document - Page 1/);
  });

  test("TOOL-004 scanned/OCR PDF produces meaningful Markdown and matching download", async ({ page }) => {
    await acceptMarkdown(page, SCANNED_PDF, "tool-004-scanned", /FACULTY OF|Confirmation of Academic Details/i);
  });

  test("TOOL-004 mixed PDF produces meaningful Markdown and matching download", async ({ page }) => {
    await acceptMarkdown(page, MIXED_PDF, "tool-004-mixed", /Invoice #2024-001|native text on the mixed page/i);
  });

  test("TOOL-002 Image-to-Searchable-PDF downloads a searchable PDF", async ({ page }) => {
    const validation = await acceptLegacyTaskPdf(page, "/image-to-searchable-pdf", SEARCHABLE_IMAGE, "Create Searchable PDF", "tool-002-searchable-image", /WE ARE|HIRING|MISSING/i);
    expect(validation.pages).toBe(1);
  });

  test("TOOL-003 URL-to-PDF downloads a valid public-page PDF", async ({ page }) => {
    const requests = telemetry(page);
    await page.goto("/url-to-pdf");
    await page.locator('input[type="url"]').fill("https://example.com");
    await page.getByRole("button", { name: "Open Webpage Capture Workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/url-to-pdf\/workspace$/);
    // The async callback stores the final blob and navigates directly to the
    // shared download page; that page is the product's usable Save/download
    // state for this flow.
    await expect(page).toHaveURL(/\/url-to-pdf\/download$/, { timeout: 180_000 });
    await expect(page.getByRole("button", { name: "Download File", exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download File", exact: true }).click();
    const download = await downloadPromise;
    const artifactPath = path.join(ARTIFACT_EVIDENCE, "tool-003-url-to-pdf.pdf");
    await download.saveAs(artifactPath);
    const validation = validatePdf(artifactPath, /Example Domain/i);
    writeJson("tool-003-url-to-pdf.json", {
      inputUrl: "https://example.com",
      browserDownloadSuggestedName: download.suggestedFilename(),
      artifactPath,
      finalBrowserUrl: page.url(),
      requestTrace: requests,
      validation,
    });
    expect(page.url()).not.toContain("https://api.platenpdf.comhttps");
  });
});
