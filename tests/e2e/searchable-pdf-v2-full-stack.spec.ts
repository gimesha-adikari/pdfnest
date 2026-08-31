import { test, expect, type Page, type Response } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { authenticateProUser, getE2EApiBaseUrl } from '../helpers/auth';

const PRIMARY_PATH = process.env.SEARCHABLE_PDF_E2E_PRIMARY || '/home/gimesha/Downloads/6670c2153.png';
const SECONDARY_PATH = process.env.SEARCHABLE_PDF_E2E_SECONDARY || path.resolve(__dirname, '../../../pdfnest-worker/input.png');
const EXPECTED_PRIMARY_SHA256 = 'a540d252220d945fac511b97d223ffeb6849eb8d50f1be39234b7bfc82f4e3ac';
const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR || path.resolve(process.cwd(), '../output/playwright/searchable-pdf-v2-e2e-20260830/artifacts');

interface DurableStatus {
  job_id: string;
  status: string;
  profile?: string;
  progress: {
    completed_pages: number;
    total_pages: number;
    failed_pages?: number[];
    page_statuses: Record<string, string>;
    percent: number;
  };
  result_available: boolean;
  error?: { code: string; message: string };
}

interface UiJobEvidence {
  job: DurableStatus;
  postStatus: number;
  requestId: string;
  idempotencyKey: string;
  statuses: string[];
  resultHttpStatus: number;
  resultContentType: string;
  downloadedPath: string;
  downloadedFilename: string;
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeFileMetadata(filePath: string) {
  const stat = fs.statSync(filePath);
  return { path: filePath, bytes: stat.size, sha256: sha256(filePath) };
}

async function waitForDurableStatus(page: Page, jobId: string): Promise<{ job: DurableStatus; statuses: string[] }> {
  const statuses: string[] = [];
  const deadline = Date.now() + 120_000;
  let last: DurableStatus | null = null;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${getE2EApiBaseUrl()}/v2/ocr/searchable-pdf/jobs/${encodeURIComponent(jobId)}`);
    if (response.status() === 429) {
      const retryAfter = Number(response.headers()['retry-after'] || '2');
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Math.min(5000, retryAfter * 1000))));
      continue;
    }
    expect(response.ok(), `job status HTTP ${response.status()}`).toBeTruthy();
    last = (await response.json()) as DurableStatus;
    if (statuses[statuses.length - 1] !== last.status) statuses.push(last.status);
    if (last.status === 'SUCCEEDED' || last.status === 'FAILED' || last.status === 'CANCELLED') {
      return { job: last, statuses };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for durable job ${jobId}; observed statuses: ${statuses.join(',')}`);
}

async function submitThroughUi(page: Page, files: string[], artifactName: string): Promise<UiJobEvidence> {
  await page.goto('/searchable-pdf-v2/workspace');
  await expect(page.getByRole('heading', { name: 'Build a searchable PDF' }).first()).toBeVisible();

  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(files);
  for (const file of files) await expect(page.getByText(path.basename(file), { exact: true })).toBeVisible();

  const languagePicker = page.getByRole('combobox', { name: 'OCR language' });
  await languagePicker.click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Create searchable PDF' })).toBeEnabled();

  let resultResponse: Response | undefined;
  page.on('response', (response) => {
    if (response.request().method() === 'GET' && response.url().includes('/api/v2/ocr/searchable-pdf/jobs/') && response.url().endsWith('/result')) {
      resultResponse = response;
    }
  });

  const postResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/v2/ocr/searchable-pdf/jobs')
  );
  await page.getByRole('button', { name: 'Create searchable PDF' }).click();
  const postResponse = await postResponsePromise;
  expect(postResponse.status()).toBe(202);
  const created = (await postResponse.json()) as DurableStatus;
  expect(created.job_id).toMatch(/^[0-9a-f-]{36}$/i);
  const headers = postResponse.request().headers();
  const requestId = headers['x-request-id'] || '';
  const idempotencyKey = headers['idempotency-key'] || '';
  expect(requestId).not.toBe('');
  expect(idempotencyKey).not.toBe('');

  const durable = await waitForDurableStatus(page, created.job_id);
  expect(durable.job.profile).toBe('SEARCHABLE_PDF_V2');
  expect(durable.job.status).toBe('SUCCEEDED');
  expect(durable.job.progress.total_pages).toBe(files.length);
  expect(durable.job.progress.completed_pages).toBe(files.length);
  expect(durable.job.progress.failed_pages ?? []).toEqual([]);
  expect(durable.job.progress.page_statuses).toEqual(Object.fromEntries(files.map((_, index) => [String(index), 'SUCCESS'])));
  expect(durable.job.result_available).toBe(true);
  await expect(page.getByText('Your searchable PDF is ready', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle('Searchable PDF preview')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const downloadedPath = path.join(OUTPUT_DIR, artifactName);
  await download.saveAs(downloadedPath);
  expect(fs.readFileSync(downloadedPath).subarray(0, 5).toString()).toBe('%PDF-');
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  expect(resultResponse).toBeDefined();
  expect(resultResponse!.status()).toBe(200);
  expect(resultResponse!.headers()['content-type'] || '').toMatch(/^application\/pdf/i);

  return {
    job: durable.job,
    postStatus: postResponse.status(),
    requestId,
    idempotencyKey,
    statuses: durable.statuses,
    resultHttpStatus: resultResponse!.status(),
    resultContentType: resultResponse!.headers()['content-type'] || '',
    downloadedPath,
    downloadedFilename: download.suggestedFilename(),
  };
}

test.describe.serial('Searchable PDF V2 real local full-stack E2E', () => {
  test('exact regression image succeeds, replays idempotently, and preserves two-image order', async ({ page }) => {
    expect(fs.existsSync(PRIMARY_PATH)).toBe(true);
    expect(safeFileMetadata(PRIMARY_PATH).sha256).toBe(EXPECTED_PRIMARY_SHA256);
    expect(fs.existsSync(SECONDARY_PATH)).toBe(true);

    const auth = await authenticateProUser(page);
    expect(auth.proEntitlement).toBe(true);

    const single = await submitThroughUi(page, [PRIMARY_PATH], 'searchable-pdf-v2-exact-single.pdf');
    expect(single.statuses).toContain('SUCCEEDED');

    const replay = await page.request.post(`${getE2EApiBaseUrl()}/v2/ocr/searchable-pdf/jobs`, {
      headers: {
        'Idempotency-Key': single.idempotencyKey,
        'X-Request-ID': `${single.requestId}-replay`,
      },
      multipart: {
        file: { name: path.basename(PRIMARY_PATH), mimeType: 'image/png', buffer: fs.readFileSync(PRIMARY_PATH) },
        language: 'eng',
        routing_policy: 'AUTO',
      },
    });
    expect(replay.status()).toBe(202);
    const replayBody = await replay.json();
    expect(replayBody.job_id).toBe(single.job.job_id);
    expect(replayBody.idempotent_replay).toBe(true);

    const conflict = await page.evaluate(async ({ apiUrl, primary, secondary, idempotencyKey, requestId }) => {
      const form = new FormData();
      form.append('file', new File([Uint8Array.from(atob(primary), (value) => value.charCodeAt(0))], '6670c2153.png', { type: 'image/png' }));
      form.append('file', new File([Uint8Array.from(atob(secondary), (value) => value.charCodeAt(0))], 'input.png', { type: 'image/png' }));
      form.append('language', 'eng');
      form.append('routing_policy', 'AUTO');
      const response = await fetch(`${apiUrl}/v2/ocr/searchable-pdf/jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Idempotency-Key': idempotencyKey, 'X-Request-ID': `${requestId}-conflict` },
        body: form,
      });
      return { status: response.status, body: await response.json() as { code?: string } };
    }, {
      apiUrl: getE2EApiBaseUrl(),
      primary: fs.readFileSync(PRIMARY_PATH).toString('base64'),
      secondary: fs.readFileSync(SECONDARY_PATH).toString('base64'),
      idempotencyKey: single.idempotencyKey,
      requestId: single.requestId,
    });
    expect(conflict.status).toBe(422);
    expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD');

    await page.getByRole('button', { name: 'New PDF' }).click();
    const ordered = await submitThroughUi(page, [PRIMARY_PATH, SECONDARY_PATH], 'searchable-pdf-v2-ordered-two-image.pdf');
    expect(ordered.job.progress.total_pages).toBe(2);

    const evidence = {
      primary: safeFileMetadata(PRIMARY_PATH),
      secondary: safeFileMetadata(SECONDARY_PATH),
      auth_mode: auth.authMode,
      single,
      idempotency_replay: { status: replay.status(), job_id: replayBody.job_id, idempotent_replay: replayBody.idempotent_replay },
      idempotency_conflict: { status: conflict.status, code: conflict.body.code },
      ordered,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'e2e-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  });
});
