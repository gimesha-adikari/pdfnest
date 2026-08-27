import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';

function monitorBrowser(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) consoleErrors.push(message.text()); });
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests.filter((item) => !item.includes('net::ERR_ABORTED'))).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(requests.some((item) => item.includes('/api/structure/add-text'))).toBe(false);
  };
}

async function createBlankPDF(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

async function uploadBlank(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles({ name: 'blank-3-pages.pdf', mimeType: 'application/pdf', buffer: await createBlankPDF(3) });
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page).toHaveURL(new RegExp(`session_id=${payload.session.id}`));
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function applyText(page: Page, text: string) {
  await page.getByTestId('studio-add-text-content').fill(text);
  await page.getByTestId('studio-add-text-x').fill('72');
  await page.getByTestId('studio-add-text-y').fill('72');
  await page.getByTestId('studio-add-text-size').fill('24');
  await page.getByTestId('studio-add-text-color').click();
  await page.getByLabel('Add Text color custom hex').fill('#1E3A8A');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-text').click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const body = request.postDataJSON() as Record<string, any>;
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(200);
  return { body, result: JSON.parse(responseText) };
}

async function exportPDF(page: Page) {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await responsePromise).status()).toBe(200);
  const file = await (await downloadPromise).path();
  expect(file).toBeTruthy();
  return file!;
}

test.describe('Studio V2 Batch 4A4 Add Text', () => {
  test('adds, previews, edits, removes, and restores a server-owned text overlay', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    const payload = await uploadBlank(page);
    await page.locator(`[data-page-id="${payload.vdm.pages[0].page_id}"]`).click();
    const before = await page.locator('main img[alt="Page 1"]').screenshot();

    const added = await applyText(page, 'Studio V2 Add Text');
    expect(added.body.operation).toBe('add_text_overlay');
    expect(added.body.parameters).toEqual({ page_id: payload.vdm.pages[0].page_id, text: 'Studio V2 Add Text', x: 72, y: 72, font_size: 24, color: '#1E3A8A' });
    expect(added.body).not.toHaveProperty('new_virtual_model');
    const addedOverlay = added.result.vdm.pages[0].overlays.find((overlay: { type: string; text: string }) => overlay.type === 'text' && overlay.text === 'Studio V2 Add Text');
    expect(addedOverlay.id).toBeTruthy();
    await expect(page.getByTestId('studio-version')).toHaveText('Version 1');
    const after = await page.locator('main img[alt="Page 1"]').screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);

    await page.getByTestId(`studio-text-overlay-${addedOverlay.id}`).click();
    await page.getByTestId('studio-add-text-content').fill('Studio V2 Edited Text');
    const updateRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
    const updateResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByTestId('studio-apply-text').click();
    const [updateReq, updateRes] = await Promise.all([updateRequest, updateResponse]);
    const updateBody = updateReq.postDataJSON() as Record<string, any>;
    const updateResult = await updateRes.json();
    expect(updateBody.operation).toBe('update_text_overlay');
    expect(updateBody.parameters.overlay_id).toBe(addedOverlay.id);
    expect(updateResult.vdm.pages[0].overlays.find((overlay: { id: string }) => overlay.id === addedOverlay.id).text).toBe('Studio V2 Edited Text');

    const removeResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.getByTestId('studio-remove-text').click();
    const removed = await (await removeResponse).json();
    expect(removed.vdm.pages[0].overlays.some((overlay: { id: string }) => overlay.id === addedOverlay.id)).toBe(false);
    await expect(page.getByTestId('studio-version')).toHaveText('Version 3');

    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId(`studio-text-overlay-${addedOverlay.id}`)).toBeVisible();
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId(`studio-text-overlay-${addedOverlay.id}`)).toHaveCount(0);
    assertNoBrowserIssues();
  });

  test('exports Add Text through Compress once and supports blank-page finality', async ({ page }) => {
    const assertNoBrowserIssues = monitorBrowser(page);
    let materializeCalls = 0;
    page.on('request', (request) => { if (request.url().endsWith('/materializations') && request.method() === 'POST') materializeCalls += 1; });
    const payload = await uploadBlank(page);
    const blankPageId = payload.vdm.pages[2].page_id;
    await page.locator(`[data-page-id="${blankPageId}"]`).click();
    await applyText(page, 'Blank Page Add Text');
    const materializeResponse = page.waitForResponse((response) => response.url().endsWith('/materializations') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await page.getByRole('button', { name: 'Apply Compress' }).click();
    const compressed = await (await materializeResponse).json();
    expect(compressed.version.is_materialized).toBe(true);
    expect(compressed.vdm.pages.every((page: { overlays: unknown[] }) => page.overlays.length === 0)).toBe(true);
    expect(materializeCalls).toBe(1);
    const file = await exportPDF(page);
    const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
    expect((text.match(/Blank Page Add Text/g) || []).length).toBe(1);
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/undo') && response.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await Promise.all([page.waitForResponse((response) => response.url().endsWith('/redo') && response.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    expect(materializeCalls).toBe(1);
    assertNoBrowserIssues();
  });
});
