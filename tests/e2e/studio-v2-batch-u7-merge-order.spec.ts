import { test, expect, Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFileSync } from 'child_process';

async function labeledPdf(label: string, pages = 1) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`${label}-${index + 1}`, { x: 48, y: 720, size: 18, font });
  }
  return Buffer.from(await pdf.save());
}

function assertNoLegacyMergeRequests(page: Page) {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(merge|v1)|worker/i.test(request.url())) forbidden.push(request.url());
  });
  return () => expect(forbidden).toEqual([]);
}

async function openStudio(page: Page) {
  await page.goto('/studio-v2');
  const current = await labeledPdf('CURRENT');
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'current.pdf', mimeType: 'application/pdf', buffer: current });
  await expect((await upload).status()).toBe(201);
  await expect(page.getByRole('button', { name: 'Merge and Split PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
}

async function addSecondary(page: Page, entries: Array<{ name: string; pages?: number }>) {
  const requests = entries.map(() => page.waitForResponse((response) => response.url().includes('/assets') && response.request().method() === 'POST'));
  const files = await Promise.all(entries.map(async (entry) => ({ name: entry.name, mimeType: 'application/pdf', buffer: await labeledPdf(entry.name.replace('.pdf', '').toUpperCase(), entry.pages ?? 1) })));
  await page.locator('#studio-secondary-pdf').setInputFiles(files);
  for (const response of await Promise.all(requests)) expect(response.status()).toBe(201);
  for (const entry of entries) await expect(page.getByText(entry.name, { exact: false })).toBeVisible();
}

async function applyMerge(page: Page) {
  const response = page.waitForResponse((r) => r.url().includes('/materializations') && r.request().method() === 'POST');
  const button = page.getByRole('button', { name: 'Merge PDF' });
  await expect(button).toBeEnabled();
  await button.click();
  expect((await response).status()).toBe(200);
}

async function exportText(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  expect(outputPath).not.toBeNull();
  return execFileSync('pdftotext', [outputPath!, '-'], { encoding: 'utf8' });
}

test.describe('Studio V2 Batch U7 ordered merge and success reset', () => {
  test('supports append: Current document then A', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }]);
    await applyMerge(page);
    const text = await exportText(page);
    expect(text.indexOf('CURRENT-1')).toBeLessThan(text.indexOf('A-1'));
    await expect(page.getByTestId('studio-merge-queue')).not.toBeVisible();
  });

  test('supports prepend: A then Current document', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }]);
    await page.getByRole('button', { name: 'Move A.pdf up' }).click();
    await applyMerge(page);
    const text = await exportText(page);
    expect(text.indexOf('A-1')).toBeLessThan(text.indexOf('CURRENT-1'));
  });

  test('submits exact multi-file order B, Current, A', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }, { name: 'B.pdf', pages: 2 }]);
    await page.getByRole('button', { name: 'Move B.pdf up' }).click();
    await page.getByRole('button', { name: 'Move Current document down' }).click();
    const request = page.waitForRequest((r) => r.url().includes('/materializations') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Merge PDF' }).click();
    const body = JSON.parse((await request).postData() ?? '{}');
    expect(body.parameters.source_asset_ids).toHaveLength(2);
    expect(body.parameters.current_document_position).toBe(1);
    const text = await exportText(page);
    expect(text.indexOf('B-1')).toBeLessThan(text.indexOf('CURRENT-1'));
    expect(text.indexOf('CURRENT-1')).toBeLessThan(text.indexOf('A-1'));
    expect(text.indexOf('B-1')).toBeLessThan(text.indexOf('B-2'));
  });

  test('removes uploaded items and clears back to Current document only', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }, { name: 'B.pdf' }]);
    await page.getByRole('button', { name: 'Remove A.pdf' }).click();
    await page.getByRole('button', { name: 'Clear uploads' }).click();
    await expect(page.getByTestId('studio-merge-queue')).toContainText('1. Current document');
    await expect(page.getByText('A.pdf', { exact: false })).not.toBeVisible();
    await expect(page.getByText('B.pdf', { exact: false })).not.toBeVisible();
  });

  test('resets queue and native input after successful merge, allowing same-file reselect', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }]);
    await applyMerge(page);
    await expect(page.getByRole('button', { name: 'Merge and Split PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'Merge and Split PDF' }).click();
    await expect(page.getByText('A.pdf', { exact: false })).not.toBeVisible();
    await addSecondary(page, [{ name: 'A.pdf' }]);
  });

  test('retains queue after failed materialization for retry', async ({ page }) => {
    const assertNoLegacy = assertNoLegacyMergeRequests(page);
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }]);
    await page.route('**/studio/v1/sessions/*/materializations', (route) => route.fulfill({ status: 500, body: JSON.stringify({ error: 'forced U7 test failure' }) }));
    await page.getByRole('button', { name: 'Merge PDF' }).click();
    await expect(page.getByText('A.pdf', { exact: false })).toBeVisible();
    assertNoLegacy();
  });

  test('keeps authoritative page state undoable and redoes the merged order', async ({ page }) => {
    await openStudio(page);
    await addSecondary(page, [{ name: 'A.pdf' }]);
    await applyMerge(page);
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/undo') && r.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/redo') && r.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
  });
});
