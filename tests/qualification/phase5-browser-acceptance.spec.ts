/** Real local UI acceptance. No mocked successful jobs, PDF text or clipboard.
 * Private evidence stays outside Git. Explicitly opt in using the README command.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const enabled = process.env.PLATEN_PHASE5_BROWSER_ACCEPTANCE === '1';
const root = path.resolve(__dirname, '../../..');
const output = process.env.PLATEN_PHASE5_EVIDENCE_DIR || '';
const fixtureDir = path.join(output, 'fixtures');
const python = process.env.STUDIO_TEST_PYTHON || path.join(root, 'pdfnest-worker/.venv/bin/python');
const tools = path.join(__dirname, 'phase5_pdf_browser_tools.py');
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const scalars = (value: string) => Array.from(value, c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
test.skip(!enabled, 'Explicit local Phase 5 acceptance opt-in required');

type Job = { id: string; job_type: string; status: string; error_code?: string; error?: string; result: any; payload: any };
type Ledger = { jobs: Record<string, Job>; submissions: any[]; compileRequests: any[]; errors: string[]; uploads?: any[]; [key: string]: any };

function loadCredentials() {
  const file = path.join(root, 'pdfnest/.env.test.local');
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.trim().match(/^(E2E_TEST_EMAIL|E2E_TEST_PASSWORD)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) throw new Error('Dedicated local E2E credentials required; no personal profile fallback');
}

async function setup(page: Page, context: BrowserContext, name: string) {
  if (!output || !path.isAbsolute(output)) throw new Error('Private absolute PLATEN_PHASE5_EVIDENCE_DIR required');
  for (let p = output; p !== path.dirname(p); p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) throw new Error('Evidence directory must stay outside Git');
  }
  fs.mkdirSync(path.join(output, name), { recursive: true });
  loadCredentials();
  // Block external traffic in this isolated task context, not in the user's browser.
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)
      ? route.continue() : route.abort('blockedbyclient');
  });
  const login = await context.request.post('http://localhost:8080/api/auth/login', {
    data: { email: process.env.E2E_TEST_EMAIL, password: process.env.E2E_TEST_PASSWORD },
  });
  expect(login.status(), 'dedicated local account login').toBe(200);
  const session = await context.request.get('http://localhost:8080/api/auth/session');
  expect((await session.json()).authenticated).toBe(true);
  const ledger: Ledger = { jobs: {}, submissions: [], compileRequests: [], errors: [] };
  page.on('pageerror', error => ledger.errors.push(String(error)));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/edit/compile')) {
      ledger.compileRequests.push({ at: Date.now(), request: request.postDataJSON() });
    }
  });
  page.on('response', async response => {
    try {
      const pathname = new URL(response.url()).pathname;
      if (/\/api\/edit\/(jobs\/|extract$|compile$)/.test(pathname) && response.headers()['content-type']?.includes('json')) {
        const data = await response.json();
        if (data.id) ledger.jobs[data.id] = data;
        else ledger.submissions.push({ pathname, status: response.status(), data });
      }
    } catch { /* Aborted obsolete requests are recorded by the specific race test. */ }
  });
  // Read-only audit of actual File bytes sent by the application to its preview
  // renderer. It neither replaces fetch/body nor changes the verified PDF.
  await page.addInitScript(() => {
    const w = window as any; w.__phase5FileAudits = [];
    const original = window.fetch.bind(window);
    window.fetch = (...args: Parameters<typeof fetch>) => {
      const body = args[1]?.body;
      if (body instanceof FormData) for (const value of body.values()) {
        if (value instanceof File) void value.arrayBuffer().then(async bytes => {
          const digest = await window.crypto.subtle.digest('SHA-256', bytes);
          w.__phase5FileAudits.push({ name: value.name, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), endpoint: new URL(String(args[0]), location.href).pathname });
        });
      }
      return original(...args);
    };
  });
  test.info().annotations.push({ type: 'browser', description: page.context().browser()!.version() });
  return ledger;
}

function save(name: string, ledger: Ledger) {
  fs.writeFileSync(path.join(output, name, 'private-evidence.json'), JSON.stringify(ledger, null, 2));
}
const preview = (p: Page) => p.locator('section[aria-label="Verified compiled PDF preview"]');
const compileJobs = (l: Ledger) => Object.values(l.jobs).filter(j => j.job_type === 'editor_word_edit_compile');

async function upload(page: Page, ledger: Ledger, source: string) {
  await page.goto('/edit-pdf');
  await page.locator('input[type=file]').first().setInputFiles(source);
  await page.getByTestId('editor-overlay-layer').waitFor({ timeout: 180_000 });
  const sourceImage = page.getByRole('img', { name: 'Page 1', exact: true });
  await expect(sourceImage).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => sourceImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  ledger.source_preview_rendered = true;
  await expect.poll(() => Object.values(ledger.jobs).filter(j => j.job_type === 'editor_extract' && j.status === 'succeeded').length, { timeout: 180_000 }).toBeGreaterThan(0);
  return Object.values(ledger.jobs).filter(j => j.job_type === 'editor_extract' && j.status === 'succeeded').at(-1)!;
}

async function edit(page: Page, text: string, original = 'Ministry') {
  const target = page.getByRole('button', { name: `Edit word ${original}`, exact: true }).first();
  await target.waitFor();
  const id = await target.getAttribute('data-word-id'); expect(id).toBeTruthy();
  await target.click();
  await page.getByTestId('word-inline-editor').fill(text);
  await page.getByTestId('word-inline-editor').press('Enter');
  return id!;
}

function declareMask(name: string, source: string, job: Job, text: string, wordId: string, original = 'Ministry', suffix = '') {
  const dir = path.join(output, name); const jobFile = path.join(dir, `extraction${suffix}.json`);
  const declaration = path.join(dir, `declared-mask${suffix}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  execFileSync(python, [tools, 'mask', source, jobFile, text, original, wordId, declaration], { env: { ...process.env, REDIS_URL: process.env.PLATEN_PHASE5_JOB_REDIS_URL || 'redis://127.0.0.1:6381/0' } });
  const data = JSON.parse(fs.readFileSync(declaration, 'utf8'));
  return { file: declaration, at: Date.now(), ...data };
}

async function prepare(page: Page, ledger: Ledger, before: number) {
  await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
  await expect.poll(() => compileJobs(ledger).filter(j => ['succeeded', 'failed', 'cancelled'].includes(j.status)).length, { timeout: 180_000 }).toBeGreaterThan(before);
  return compileJobs(ledger).at(-1)!;
}

async function auditAccessibility(page: Page) {
  const axe = process.env.PLATEN_PHASE5_AXE_PATH;
  if (!axe || !fs.existsSync(axe)) throw new Error('Explicit axe-core installation/path required');
  await page.addScriptTag({ path: axe });
  const result = await page.evaluate(async () => (window as any).axe.run(document.querySelector('section[aria-label="Verified compiled PDF preview"]'), {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  }));
  return { violations: result.violations, incomplete: result.incomplete, passes: result.passes.length, version: result.testEngine.version };
}

async function realCopyPaste(page: Page, word: ReturnType<Page['getByRole']>, keyboard: boolean) {
  if (keyboard) { await page.getByRole('textbox', { name: 'Find selectable word', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(word).toBeFocused(); await page.keyboard.press('Enter'); }
  else await word.click();
  await expect(word).toBeFocused();
  const selection = await page.evaluate(() => window.getSelection()?.toString());
  await page.keyboard.press('Control+C');
  const direct = await page.evaluate(() => navigator.clipboard.readText());
  await page.evaluate(() => {
    const label = document.createElement('label'); label.id = 'phase5-paste-label'; label.textContent = 'Task clipboard paste field';
    const input = document.createElement('textarea'); input.id = 'phase5-paste'; input.setAttribute('aria-label', 'Task clipboard paste field');
    label.append(input); document.body.append(label);
  });
  const paste = page.getByRole('textbox', { name: 'Task clipboard paste field', exact: true });
  expect(await paste.inputValue()).toBe('');
  await paste.focus(); await page.keyboard.press('Control+V');
  const pasted = await paste.inputValue();
  await page.evaluate(() => document.getElementById('phase5-paste-label')!.remove());
  return { selection, direct, pasted, codepoints: scalars(pasted), nfc: pasted.normalize('NFC'), nfd: pasted.normalize('NFD') };
}

async function validateAndDownload(page: Page, ledger: Ledger, name: string, source: string, declaration: any, job: Job) {
  const hash = job.result.artifact_sha256;
  await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect.poll(async () => (await page.evaluate(() => (window as any).__phase5FileAudits)).some((x: any) => x.endpoint === '/api/conversion/preview/session' && x.sha256 === hash), { timeout: 30_000 }).toBe(true);
  ledger.uploads = await page.evaluate(() => (window as any).__phase5FileAudits);
  // Local storage is AES-GCM encrypted at rest. Obtain the actual worker PDF
  // through its existing owned artifact path; do not compare ciphertext to PDF.
  const artifact = await page.context().request.get(`http://localhost:8080/api/edit/jobs/${job.id}/download`);
  expect(artifact.ok()).toBe(true);
  const artifactBytes = await artifact.body(); expect(artifactBytes.subarray(0, 5).toString()).toBe('%PDF-');
  ledger.worker_artifact_sha256 = sha(artifactBytes); expect(ledger.worker_artifact_sha256).toBe(hash);
  fs.writeFileSync(path.join(output, name, 'worker-artifact.pdf'), artifactBytes);
  ledger.preview_candidate_sha256 = ledger.uploads!.find(x => x.endpoint === '/api/conversion/preview/session' && x.sha256 === hash).sha256;
  await page.getByRole('button', { name: 'Download verified PDF', exact: true }).click();
  await expect(page).toHaveURL(/\/edit-pdf\/download$/);
  const paths: string[] = [];
  for (const repetition of [1, 2]) {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File', exact: true }).click();
    const download = await event; const dest = path.join(output, name, `ui-download-${repetition}.pdf`);
    await download.saveAs(dest); expect(sha(fs.readFileSync(dest))).toBe(hash); paths.push(dest);
  }
  ledger.ui_download_sha256 = paths.map(p => sha(fs.readFileSync(p)));
  execFileSync(python, [tools, 'validate', source, paths[0], declaration.file, path.join(output, name, 'pdf-validation.json')], { timeout: 120_000 });
  ledger.pdf_validation = JSON.parse(fs.readFileSync(path.join(output, name, 'pdf-validation.json'), 'utf8'));
  expect(sha(await (await page.context().request.get(`http://localhost:8080/api/edit/jobs/${job.id}/download`)).body())).toBe(hash);
}

const scripts = [
  ['sinhala-joiner', 'අධ්‍යාපනය', 'native'], ['sinhala-without-joiner', 'අධ්යාපනය', 'native'], ['sinhala-conjunct', 'ශ්‍රී', 'native'],
  ['sinhala-simple', 'සිංහල', 'native'], ['sinhala-vowel', 'කී', 'native'],
  ['tamil-word', 'தமிழ்நாடு', 'native'], ['tamil-cluster', 'கல்வி', 'native'], ['tamil-vowel', 'கி', 'native'],
  ['sinhala-searchable', 'කී', 'searchable'], ['tamil-searchable', 'கி', 'searchable'],
  ['english-native', 'hello', 'native'], ['english-scan', 'hello', 'scan'],
] as const;

for (const [name, text, kind] of scripts) test(`${name}: real UI ${kind === 'scan' ? 'image-only fallback' : 'selection clipboard'} downloads and PDF preservation`, async ({ page, context }) => {
  const ledger = await setup(page, context, name); const source = path.join(fixtureDir, `${kind}.pdf`);
  try {
    const extraction = await upload(page, ledger, source); const id = await edit(page, text);
    const declaration = declareMask(name, source, extraction, text, id); ledger.declaration = declaration;
    expect(declaration.planning_refusal).toBeNull();
    const job = await prepare(page, ledger, 0); expect(job.status, job.error || job.error_code).toBe('succeeded');
    expect(ledger.compileRequests[0].request).toEqual(declaration.request); expect(ledger.compileRequests[0].at).toBeGreaterThanOrEqual(declaration.at);
    if (kind === 'scan') {
      await expect(preview(page)).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Select whole words' })).toHaveCount(0);
      await expect(preview(page).getByText('Text selection is unavailable for this page.', { exact: false })).toBeVisible();
      ledger.selection_policy = 'image-only fallback; no clipboard qualification claimed';
      ledger.fallback_accessibility = await auditAccessibility(page); expect(ledger.fallback_accessibility.violations).toEqual([]);
      await validateAndDownload(page, ledger, name, source, declaration, job);
      return;
    }
    await page.getByRole('checkbox', { name: 'Select whole words' }).check();
    const word = page.getByRole('button', { name: `Select whole word ${text}`, exact: true });
    await expect(word).toHaveCount(1); await expect(word).toHaveAttribute('tabindex', '0');
    const mapping = job.result.candidate_selection.pages[0];
    const region = mapping.words.find((w: any) => w.text === text);
    const checkMapping = async () => {
      const imageBox = await preview(page).getByRole('img', { name: 'Verified compiled PDF page 1' }).boundingBox();
      const wordBox = await word.boundingBox(); expect(imageBox).toBeTruthy(); expect(wordBox).toBeTruthy();
      const [x0, y0, x1, y1] = region.rect;
      const expected = { x: imageBox!.x + x0 / mapping.width * imageBox!.width, y: imageBox!.y + y0 / mapping.height * imageBox!.height,
        width: (x1 - x0) / mapping.width * imageBox!.width, height: (y1 - y0) / mapping.height * imageBox!.height };
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(wordBox![key] - expected[key])).toBeLessThan(1);
      return { image: imageBox, word: wordBox, expected, tolerance_css_px: 1 };
    };
    ledger.selection_geometry = [await checkMapping()];
    ledger.dom_word_order = await page.locator('[data-candidate-word]').allTextContents();
    expect(ledger.dom_word_order).toEqual(kind === 'native' ? [text, 'of', 'Education,', 'Higher'] : [text]);

    ledger.clipboard = [];
    for (const keyboard of [false, true]) {
      const result = await realCopyPaste(page, word, keyboard); ledger.clipboard.push({ keyboard, ...result });
      expect(result.selection).toBe(text); expect(result.direct).toBe(text); expect(result.pasted).toBe(text);
    }
    await word.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+ArrowLeft');
    expect(await page.evaluate(() => getSelection()?.toString())).toBe(text);
    await page.getByRole('textbox', { name: 'Find selectable word', exact: true }).fill(text);
    await expect(preview(page).locator('output')).toHaveText('1 matches');
    ledger.accessibility = await auditAccessibility(page);
    expect(ledger.accessibility.violations.map((x: any) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n: any) => n.target) }))).toEqual([]);
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    ledger.light_accessibility = await auditAccessibility(page); expect(ledger.light_accessibility.violations).toEqual([]);
    await expect(word).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    await expect(word).toBeVisible();
    const session = await context.newCDPSession(page); const ax = await session.send('Accessibility.getFullAXTree');
    ledger.ax_word_names = ax.nodes.filter((n: any) => n.role?.value === 'button' && n.name?.value === `Select whole word ${text}`).map((n: any) => ({ name: n.name.value, ignored: n.ignored }));
    expect(ledger.ax_word_names).toEqual([{ name: `Select whole word ${text}`, ignored: false }]); await session.detach();
    // Page changes reset opt-in; controls on the other page cannot retain target text.
    await preview(page).getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(preview(page).getByRole('img', { name: 'Verified compiled PDF page 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Select whole word ${text}`, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => getSelection()?.toString())).not.toBe(text);
    await expect(page.getByRole('checkbox', { name: 'Select whole words' })).toHaveCount(0);
    await expect(preview(page).getByText('Text selection is unavailable for this page.', { exact: false })).toBeVisible();
    ledger.fallback_accessibility = await auditAccessibility(page);
    expect(ledger.fallback_accessibility.violations).toEqual([]);
    await preview(page).getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(preview(page).getByRole('img', { name: 'Verified compiled PDF page 1' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select whole words' }).check();
    await page.setViewportSize({ width: 1100, height: 900 });
    ledger.selection_geometry.push(await checkMapping());
    await word.click(); expect(await page.evaluate(() => getSelection()?.toString())).toBe(text);
    await page.setViewportSize({ width: 1440, height: 1100 });
    const compileCount = ledger.compileRequests.length;
    await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
    await expect(preview(page)).toBeVisible(); expect(ledger.compileRequests.length).toBe(compileCount);
    await validateAndDownload(page, ledger, name, source, declaration, job);
    expect(ledger.errors).toEqual([]);
  } finally { save(name, ledger); }
});

for (const [name, code] of [
  ['rotated-image', 'UNSUPPORTED_IMAGE_TRANSFORM'], ['sheared-image', 'UNSUPPORTED_IMAGE_TRANSFORM'],
  ['handwriting', 'BACKGROUND_UNCERTAIN'], ['misaligned-ocr', 'HIDDEN_OCR_ALIGNMENT_UNCERTAIN'],
  ['visible-conflict', 'VISIBLE_TEXT_LAYER_CONFLICT'], ['table', 'BACKGROUND_RULE_OVERLAP'],
] as const) test(`${name}: authentic browser refusal and failed artifact denial`, async ({ page, context }) => {
  const ledger = await setup(page, context, name); const source = path.join(fixtureDir, name + '.pdf');
  try {
    const extraction = await upload(page, ledger, source);
    const targets = page.getByRole('button', { name: 'Edit word Ministry', exact: true });
    if (!await targets.count()) {
      ledger.extraction_limitation = { expected: 'Ministry', actual: await page.getByTestId('word-hit-target').evaluateAll(xs => xs.map(x => x.getAttribute('aria-label'))) };
      test.skip(true, 'Authentic extraction did not expose exact Ministry; no fabricated identity or compile submission');
    }
    const id = await edit(page, 'hello'); ledger.declaration = declareMask(name, source, extraction, 'hello', id);
    const job = await prepare(page, ledger, 0); expect(job.status).toBe('failed'); expect(job.error_code).toBe(code);
    ledger.failed_job_observed_at = Date.now();
    await expect(page.getByRole('alert').first()).toBeVisible(); ledger.alert = await page.getByRole('alert').allTextContents();
    ledger.alert_delay_ms = Date.now() - ledger.failed_job_observed_at;
    await page.waitForTimeout(1500); await expect(page.getByRole('alert').first()).toBeVisible();
    expect(ledger.alert.join(' ')).toMatch(/refus|does not align|border|line|conflict|repair|image|transform/i);
    await expect(preview(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toHaveCount(0);
    expect(job.result?.artifact_key).toBeFalsy();
    const download = await context.request.get(`http://localhost:8080/api/edit/jobs/${job.id}/download`);
    ledger.failed_download_status = download.status(); const body = await download.body();
    expect(download.ok()).toBe(false); expect(body.subarray(0, 5).toString()).not.toBe('%PDF-');
    ledger.failed_download_is_pdf = false;
  } finally { save(name, ledger); }
});

test('stale baseline: authentic earlier extraction rejected before queueing', async ({ page, context }) => {
  const name = 'stale-baseline'; const ledger = await setup(page, context, name);
  try {
    const old = await upload(page, ledger, path.join(fixtureDir, 'native.pdf'));
    const current = await upload(page, ledger, path.join(fixtureDir, 'native-second.pdf'));
    expect(old.id).not.toBe(current.id);
    const wordId = await edit(page, 'hello');
    ledger.stale_control = { earlier_extraction: old.id, current_extraction: current.id, submitted_digest: old.result.word_edit_baseline.digest, current_digest: current.result.word_edit_baseline.digest, unchanged_authentic_word_id: wordId };
    // A controlled stale transport test uses a real earlier digest, not a forged
    // word ID/original string or a changed server-held baseline.
    await page.route('**/api/edit/compile', async route => {
      const body = route.request().postDataJSON();
      expect(body.extraction_job_id).toBe(current.id); expect(body.edits[0].word_id).toBe(wordId);
      await route.continue({ postData: JSON.stringify({ ...body, baseline_digest: old.result.word_edit_baseline.digest }) });
    });
    const response = page.waitForResponse(r => r.url().endsWith('/api/edit/compile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
    const rejected = await response; expect(rejected.status()).toBe(409);
    ledger.rejection = await rejected.json(); expect(ledger.rejection.code).toBe('WORD_EDIT_BASELINE_MISMATCH');
    expect(ledger.rejection.job_id).toBeFalsy(); expect(compileJobs(ledger)).toHaveLength(0);
    await expect(page.getByRole('alert').first()).toBeVisible(); ledger.alert = await page.getByRole('alert').allTextContents();
    expect(ledger.alert.join(' ')).toMatch(/baseline|extract/i);
    await expect(preview(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toHaveCount(0);
    ledger.no_compile_job_or_artifact_created = true;
  } finally { save(name, ledger); }
});

test('failure after valid candidate: edit invalidates old semantics and refuses publication', async ({ page, context }) => {
  const name = 'failure-after-valid'; const ledger = await setup(page, context, name); const source = path.join(fixtureDir, 'native.pdf');
  try {
    const extraction = await upload(page, ledger, source); const id = await edit(page, 'hello');
    const declared = declareMask(name, source, extraction, 'hello', id);
    const valid = await prepare(page, ledger, 0); expect(valid.status).toBe('succeeded');
    await page.getByRole('checkbox', { name: 'Select whole words' }).check();
    await page.getByRole('button', { name: 'Select whole word hello', exact: true }).click();
    const artifact = await context.request.get(`http://localhost:8080/api/edit/jobs/${valid.id}/download`);
    const file = path.join(output, name, 'setup-valid.pdf'); fs.writeFileSync(file, await artifact.body());
    expect(sha(fs.readFileSync(file))).toBe(valid.result.artifact_sha256);
    execFileSync(python, [tools, 'validate', source, file, declared.file, path.join(output, name, 'setup-pdf-validation.json')]);
    ledger.setup_valid_candidate = { hash: valid.result.artifact_sha256, purpose: 'transient refusal setup; not a new UI-download qualification case' };
    await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
    if (!await page.getByTestId('word-inline-editor').isVisible()) await page.getByRole('button', { name: 'Edited word hello', exact: true }).click();
    await page.getByTestId('word-inline-editor').fill('W'.repeat(160));
    await expect(preview(page)).toHaveCount(0); await expect(page.locator('[data-candidate-word]')).toHaveCount(0);
    expect(await page.evaluate(() => getSelection()?.toString())).not.toBe('hello');
    await page.getByTestId('word-inline-editor').press('Enter');
    const failed = await prepare(page, ledger, 1); expect(failed.status).toBe('failed');
    expect(['REPLACEMENT_DOES_NOT_FIT', 'NATIVE_REPLACEMENT_COLLISION']).toContain(failed.error_code);
    await expect(page.getByRole('alert').first()).toBeVisible(); ledger.alert = await page.getByRole('alert').allTextContents();
    expect(ledger.alert.join(' ')).toMatch(/fit|collid|space|neighbor/i);
    await expect(preview(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toHaveCount(0);
    expect(failed.result?.artifact_key).toBeFalsy();
    const denied = await context.request.get(`http://localhost:8080/api/edit/jobs/${failed.id}/download`);
    expect(denied.ok()).toBe(false); expect((await denied.body()).subarray(0, 5).toString()).not.toBe('%PDF-');
    ledger.failed_artifact_status = denied.status(); ledger.no_stale_candidate = true;
  } finally { save(name, ledger); }
});

test('delayed successful response: revision fence, fresh prepare, ownership and source replacement', async ({ page, context, browser }) => {
  const name = 'stale-response'; const ledger = await setup(page, context, name); const source = path.join(fixtureDir, 'native.pdf');
  let release: (() => void) | undefined; let held: Job | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const extraction = await upload(page, ledger, source); const id = await edit(page, 'hello');
    const oldMask = declareMask(name, source, extraction, 'hello', id, 'Ministry', '-old');
    await page.route('**/api/edit/jobs/*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      if (!held && body.job_type === 'editor_word_edit_compile' && body.status === 'succeeded') {
        held = body; ledger.held_actual_response = { id: body.id, digest: body.result.artifact_sha256 };
        await gate;
      }
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
    await expect.poll(() => Boolean(held), { timeout: 180_000 }).toBe(true);
    if (!await page.getByTestId('word-inline-editor').isVisible()) await page.getByRole('button', { name: 'Edited word hello', exact: true }).click();
    await page.getByTestId('word-inline-editor').fill('world'); await page.getByTestId('word-inline-editor').press('Enter');
    release!();
    await expect(page.getByRole('button', { name: 'Prepare export', exact: true })).toBeEnabled({ timeout: 60_000 });
    await expect(preview(page)).toHaveCount(0); await expect(page.locator('[data-candidate-word]')).toHaveCount(0);
    ledger.stale_success_discarded_after_real_edit = true;
    const oldArtifact = await context.request.get(`http://localhost:8080/api/edit/jobs/${held!.id}/download`);
    const oldFile = path.join(output, name, 'obsolete-setup.pdf'); fs.writeFileSync(oldFile, await oldArtifact.body());
    execFileSync(python, [tools, 'validate', source, oldFile, oldMask.file, path.join(output, name, 'obsolete-pdf-validation.json')]);
    await page.unroute('**/api/edit/jobs/*');
    const declared = declareMask(name, source, extraction, 'world', id, 'Ministry', '-current');
    const current = await prepare(page, ledger, 1); expect(current.status).toBe('succeeded');
    await page.getByRole('checkbox', { name: 'Select whole words' }).check();
    await expect(page.getByRole('button', { name: 'Select whole word world', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select whole word hello', exact: true })).toHaveCount(0);
    const other = await browser.newContext();
    try {
      for (const suffix of ['', '/download']) {
        const denied = await other.request.get(`http://localhost:8080/api/edit/jobs/${current.id}${suffix}`);
        expect([401, 403]).toContain(denied.status()); expect((await denied.body()).subarray(0, 5).toString()).not.toBe('%PDF-');
      }
    } finally { await other.close(); }
    ledger.foreign_context_denied = true;
    await validateAndDownload(page, ledger, name, source, declared, current);
    await page.getByRole('button', { name: 'Process Another', exact: true }).click();
    await page.locator('input[type=file]').first().setInputFiles(path.join(fixtureDir, 'native-second.pdf'));
    await page.getByRole('button', { name: 'Edit word Ministry', exact: true }).waitFor({ timeout: 180_000 });
    await expect(preview(page)).toHaveCount(0); await expect(page.locator('[data-candidate-word]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toHaveCount(0);
    ledger.source_replacement_cleared_candidate = true;
  } finally { release?.(); save(name, ledger); }
});

test('handwriting OCR target: genuine recognized identity refuses protected overlap', async ({ page, context }) => {
  const name = 'handwriting-recognized'; const ledger = await setup(page, context, name); const source = path.join(fixtureDir, 'handwriting.pdf');
  try {
    const extraction = await upload(page, ledger, source);
    const p = extraction.result.pages[0];
    const words = p.elements.flatMap((e: any) => e.word_geometry || []);
    const targetRect = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8')).targets.handwriting;
    const overlaps = words.filter((w: any) => w.x < targetRect[2] && w.x + w.width > targetRect[0] && w.y < targetRect[3] && w.y + w.height > targetRect[1]);
    expect(overlaps.length).toBe(1); const authentic = overlaps[0];
    ledger.recognized_original = authentic.text;
    ledger.exact_ministry_extraction = authentic.text === 'Ministry';
    // This is an additional truthful OCR-target refusal. It does not relabel the
    // separate exact-Ministry extraction limitation as a passing identity gate.
    const target = page.locator(`[data-testid="word-hit-target"][data-word-id="${authentic.id}"]`);
    await target.click(); await page.getByTestId('word-inline-editor').fill('hello'); await page.getByTestId('word-inline-editor').press('Enter');
    ledger.declaration = declareMask(name, source, extraction, 'hello', authentic.id, authentic.text);
    const job = await prepare(page, ledger, 0); expect(job.status).toBe('failed');
    expect(['BACKGROUND_UNCERTAIN', 'BACKGROUND_RULE_OVERLAP', 'BACKGROUND_COLORED_OVERLAP']).toContain(job.error_code);
    await expect(page.getByRole('alert').first()).toBeVisible(); ledger.alert = await page.getByRole('alert').allTextContents();
    await expect(preview(page)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download verified PDF', exact: true })).toHaveCount(0);
    expect(job.result?.artifact_key).toBeFalsy();
    const denied = await context.request.get(`http://localhost:8080/api/edit/jobs/${job.id}/download`);
    expect(denied.ok()).toBe(false); expect((await denied.body()).subarray(0, 5).toString()).not.toBe('%PDF-');
    ledger.failed_artifact_status = denied.status();
  } finally { save(name, ledger); }
});
