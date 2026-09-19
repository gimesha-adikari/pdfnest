import { test, expect } from "@playwright/test";

const SESSION_ID = "local-edit-persistence-session";
const STATE_ID = "local-editor-state";
const EXTRACT_JOB_ID = "local-editor-extract-job";
const COMPILE_JOB_ID = "local-editor-compile-job";
const ELEMENT_ID = "p1-ocr-v2-line-1";
const WORD_ID = "p1-ocr-v2-line-1-word-1";
const ORIGINAL_TEXT = "229";
const PROBE = "STUDIO-OBS-LOCAL-PERSISTENCE-PROBE";

const layout = {
  schema_version: "ocr_v2_editor_layout.v1",
  pages: [{
    page_num: 1,
    width: 600,
    height: 800,
    kind: "text",
    is_ocr: true,
    elements: [{
      id: ELEMENT_ID,
      text: ORIGINAL_TEXT,
      original_text: ORIGINAL_TEXT,
      x: 40,
      y: 40,
      width: 80,
      height: 20,
      size: 12,
      font: "helv",
      word_geometry: [{ id: WORD_ID, text: ORIGINAL_TEXT, x: 40, y: 40, width: 24, height: 14 }],
    }],
  }],
};

const session = {
  id: SESSION_ID,
  user_id: "local-qa-user",
  document_id: "local-document",
  active_version_id: "local-version-0",
  created_at: "2026-09-19T00:00:00.000Z",
  last_accessed_at: "2026-09-19T00:00:00.000Z",
  expires_at: "2026-09-20T00:00:00.000Z",
  title: "Local edit persistence probe",
};

const document = {
  id: "local-document",
  original_filename: "controlled-fixture.pdf",
  file_size: 1,
  initial_page_count: 1,
  created_at: "2026-09-19T00:00:00.000Z",
};

const activeVersion = {
  id: "local-version-0",
  document_id: document.id,
  parent_version_id: null,
  preferred_child_id: null,
  snapshot_id: "local-snapshot-0",
  version_number: 0,
  status: "succeeded",
  operation_type: "initial",
  is_materialized: true,
  created_at: "2026-09-19T00:00:00.000Z",
};

const vdm = {
  document_id: document.id,
  version_id: activeVersion.id,
  page_count: 1,
  pages: [{
    page_id: "local-page-1",
    source_asset_id: "local-asset",
    source_page_number: 1,
    parent_page_id: null,
    is_blank: false,
    dimensions: { width: 600, height: 800 },
    rotation: 0,
    overlays: [],
  }],
};

const job = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  session_id: SESSION_ID,
  base_version_id: activeVersion.id,
  result_version_id: null,
  editor_state_id: null,
  job_type: "editor_extract",
  status,
  progress: status === "succeeded" ? 100 : 0,
  message: status,
  created_at: "2026-09-19T00:00:00.000Z",
  updated_at: "2026-09-19T00:00:00.000Z",
  ...extra,
});

test("word edit is visible and the appbar compile serializes the current layout", async ({ page }) => {
  let compileRequest: Record<string, unknown> | null = null;

  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      type: "user",
      user: { id: "local-qa-user", email: "qa1@platenpdf.com", role: "user" },
      subscription: { tier: "free", status: "active", role: "user", billing_interval: "monthly", current_period_end: "2026-10-19T00:00:00.000Z", custom_credits: 0, used_units_3h: 0, used_units_daily: 0, used_units_monthly: 0 },
    }),
  }));
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/ready", (route) => route.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/site-content/tools", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "[]",
  }));

  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ session, document, active_version: activeVersion, vdm }),
  }));
  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}/history`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ versions: [activeVersion], operations: [] }),
  }));
  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}/versions/${activeVersion.id}/pages/local-page-1/tile*`, (route) => route.fulfill({
    status: 404,
    body: "not needed for this state-boundary test",
  }));
  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}/editor/${STATE_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      editor_state: {
        id: STATE_ID,
        document_id: document.id,
        session_id: SESSION_ID,
        base_version_id: activeVersion.id,
        extract_job_id: EXTRACT_JOB_ID,
        layout,
        created_at: "2026-09-19T00:00:00.000Z",
      },
    }),
  }));
  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}/jobs`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.operation === "editor_compile") compileRequest = body;
    const isCompile = body.operation === "editor_compile";
    const responseJob = isCompile
      ? job(COMPILE_JOB_ID, "failed", { job_type: "editor_compile", message: "test capture complete" })
      : job(EXTRACT_JOB_ID, "succeeded", { editor_state_id: STATE_ID, job_type: "editor_extract" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job: responseJob }),
    });
  });
  await page.route(`**/api/studio/v1/sessions/${SESSION_ID}/jobs/${COMPILE_JOB_ID}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ job: job(COMPILE_JOB_ID, "failed", { job_type: "editor_compile", message: "test capture complete" }) }),
  }));

  await page.goto(`/studio-v2?session_id=${SESSION_ID}`);
  await page.getByTestId("studio-enter-edit-pdf").click();
  await expect(page.getByTestId("studio-edit-workspace")).toBeVisible();

  const wordTarget = page.locator(`[data-testid="word-hit-target"][aria-label="Edit word ${ORIGINAL_TEXT}"]`);
  await expect(wordTarget).toBeVisible();
  await wordTarget.click();

  const inlineEditor = page.getByTestId("word-inline-editor");
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill(PROBE);
  await expect(inlineEditor).toHaveValue(PROBE);
  console.log(JSON.stringify({
    sidebar_text_after_fill: await page.locator('[data-testid="editor-v2-properties"] textarea').inputValue(),
  }));

  const compileButton = page.locator("button.studio-v2-editor-compile");
  await expect(compileButton).toBeEnabled();
  await compileButton.click();
  await expect.poll(() => compileRequest).not.toBeNull();

  const submittedLayout = ((compileRequest as unknown as { parameters: { layout: typeof layout } }).parameters).layout;
  const submittedElement = submittedLayout.pages[0].elements[0];
  console.log(JSON.stringify({
    editor_value: await inlineEditor.inputValue(),
    submitted_element_id: submittedElement.id,
    submitted_original_text: submittedElement.original_text,
    submitted_text: submittedElement.text,
    probe_match_count: JSON.stringify(compileRequest).split(PROBE).length - 1,
  }));

  expect(submittedElement.id).toBe(ELEMENT_ID);
  expect(submittedElement.original_text).toBe(ORIGINAL_TEXT);
  expect(submittedElement.text).toBe(PROBE);
});
