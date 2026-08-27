import { test, expect, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function createBlankPDF(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([600, 800]);
  return Buffer.from(await pdf.save());
}

const signaturePNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function uploadBlank(page: Page, pageCount = 1) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `u3b-${pageCount}-pages.pdf`,
    mimeType: 'application/pdf',
    buffer: await createBlankPDF(pageCount),
  });
  const response = await upload;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 60_000 });
  return payload;
}

async function applyText(page: Page, text: string, x = 140, y = 180) {
  await page.getByTestId('studio-add-text-content').fill(text);
  await page.getByTestId('studio-add-text-x').fill(String(x));
  await page.getByTestId('studio-add-text-y').fill(String(y));
  await page.getByTestId('studio-add-text-size').fill('24');
  const commandRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const commandResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-text').click();
  const [request, response] = await Promise.all([commandRequest, commandResponse]);
  expect(response.status()).toBe(200);
  const result = await response.json();
  const overlay = result.vdm.pages[0].overlays.find((candidate: { type: string; text: string }) => candidate.type === 'text' && candidate.text === text);
  expect(overlay?.id).toBeTruthy();
  return { overlay, result, request: request.postDataJSON() };
}

async function applyUploadedSignature(page: Page, pageId: string, x: number, y: number, width: number, height: number) {
  await page.locator(`[data-page-id="${pageId}"]`).click();
  const assetResponse = page.waitForResponse((response) => response.url().endsWith('/assets') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.locator('input[type="file"]').last().setInputFiles({ name: 'u3b-signature.png', mimeType: 'image/png', buffer: signaturePNG });
  await page.getByTestId('studio-signature-x').fill(String(x));
  await page.getByTestId('studio-signature-y').fill(String(y));
  await page.getByTestId('studio-signature-width').fill(String(width));
  await page.getByTestId('studio-signature-height').fill(String(height));
  const commandRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const commandResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-signature').click();
  const [asset, request, response] = await Promise.all([assetResponse.then((res) => res.json()), commandRequest, commandResponse]);
  expect(response.status()).toBe(200);
  const result = await response.json();
  const overlay = result.vdm.pages[0].overlays.find((candidate: { type: string; rect: number[] }) => candidate.type === 'signature' && candidate.rect[0] === x && candidate.rect[1] === y);
  expect(overlay?.id).toBeTruthy();
  return { asset, overlay, result, request: request.postDataJSON() };
}

async function applyDrawnSignature(page: Page, pageId: string, x: number, y: number, width: number, height: number) {
  await page.locator(`[data-page-id="${pageId}"]`).click();
  await page.getByTestId('studio-sign-pen-color').click();
  await page.getByLabel('Pen Color custom hex').fill('#B91C1C');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByTestId('studio-sign-pen-color').click();
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 35, box!.y + 110);
  await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + 55, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('studio-apply-signature')).toBeEnabled();
  await page.getByTestId('studio-signature-x').fill(String(x));
  await page.getByTestId('studio-signature-y').fill(String(y));
  await page.getByTestId('studio-signature-width').fill(String(width));
  await page.getByTestId('studio-signature-height').fill(String(height));
  const commandRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const commandResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.getByTestId('studio-apply-signature').click();
  const [request, response] = await Promise.all([commandRequest, commandResponse]);
  expect(response.status()).toBe(200);
  return { request: request.postDataJSON(), result: await response.json() };
}

function countRedPixels(pdfPath: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-u3b-draw-'));
  const prefix = path.join(directory, 'page');
  try {
    execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', pdfPath, prefix]);
    return Number(execFileSync('python3', ['-c', "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGB'); print(sum(1 for r,g,b in im.getdata() if r>120 and r>g+20 and r>b+20))", `${prefix}.png`], { encoding: 'utf8' }).trim());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function dragOverlay(page: Page, overlayId: string, dx: number, dy: number) {
  const overlay = page.getByTestId(`studio-interactive-overlay-${overlayId}`);
  await expect(overlay).toBeVisible();
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  const updateRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
  const updateResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + dx / 2, box!.y + box!.height / 2 + dy / 2, { steps: 3 });
  await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, { steps: 3 });
  await page.mouse.up();
  const [request, response] = await Promise.all([updateRequest, updateResponse]);
  expect(response.status()).toBe(200);
  return { request: request.postDataJSON(), result: await response.json() };
}

test.describe('Studio V2 Batch U3B direct Sign and Add Text manipulation', () => {
  test('draws a colored signature, directly moves it, and preserves ink color in the final PDF', async ({ page }) => {
    const payload = await uploadBlank(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    const added = await applyDrawnSignature(page, pageId, 100, 120, 180, 60);
    expect(added.request.operation).toBe('add_signature_overlay');
    const overlayId = added.result.vdm.pages[0].overlays.find((candidate: { type: string }) => candidate.type === 'signature').id;
    const moved = await dragOverlay(page, overlayId, 18, 12);
    expect(moved.request.operation).toBe('update_signature_overlay');
    await expect(page.getByTestId('studio-signature-x')).not.toHaveValue('100');
    const downloadPromise = page.waitForEvent('download');
    const exportResponse = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    expect((await exportResponse).status()).toBe(200);
    const exported = await (await downloadPromise).path();
    expect(exported).toBeTruthy();
    expect(countRedPixels(exported!)).toBeGreaterThan(0);
  });

  test('drags and inline-edits text with one typed commit, synchronized fields, and final PDF content', async ({ page }) => {
    const payload = await uploadBlank(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    await page.locator(`[data-page-id="${pageId}"]`).click();
    await page.getByTestId('studio-add-text-color').click();
    await page.getByLabel('Add Text color custom hex').fill('#1E3A8A');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    const added = await applyText(page, 'U3B Text');
    const moved = await dragOverlay(page, added.overlay.id, 36, 24);
    expect(moved.request.operation).toBe('update_text_overlay');
    expect(moved.request.parameters.overlay_id).toBe(added.overlay.id);
    expect(moved.request.parameters.x).toBe(180);
    expect(moved.request.parameters.y).toBeCloseTo(153.3333333333, 5);
    await expect(page.getByTestId('studio-add-text-x')).toHaveValue('180');
    await expect(page.getByTestId('studio-add-text-y')).toHaveValue('153.33333333333337');

    await page.getByTestId(`studio-interactive-overlay-${added.overlay.id}`).dblclick();
    const inline = page.getByTestId(`studio-inline-text-${added.overlay.id}`);
    await expect(inline).toBeVisible();
    await inline.fill('U3B Inline Text');
    const inlineResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await inline.press('Tab');
    const inlineResult = await (await inlineResponse).json();
    expect(inlineResult.vdm.pages[0].overlays.find((candidate: { id: string }) => candidate.id === added.overlay.id).text).toBe('U3B Inline Text');
    expect(inlineResult.vdm.pages[0].overlays.find((candidate: { id: string }) => candidate.id === added.overlay.id).color).toBe('#1E3A8A');

    await page.getByTestId('studio-new-text').click();
    const second = await applyText(page, 'U3B Second Text', 280, 260);
    expect(second.overlay.id).not.toBe(added.overlay.id);
    const movedSecond = await dragOverlay(page, second.overlay.id, 18, 12);
    expect(movedSecond.request.operation).toBe('update_text_overlay');
    await page.getByTestId(`studio-text-overlay-${added.overlay.id}`).click();
    await expect(page.getByTestId('studio-add-text-x')).toHaveValue('180');
    await page.getByTestId(`studio-text-overlay-${second.overlay.id}`).click();
    await expect(page.getByTestId('studio-add-text-x')).not.toHaveValue('280');

    const downloadPromise = page.waitForEvent('download');
    const exportResponse = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    expect((await exportResponse).status()).toBe(200);
    const exported = await (await downloadPromise).path();
    expect(exported).toBeTruthy();
    const finalText = execFileSync('pdftotext', [exported!, '-'], { encoding: 'utf8' });
    expect(finalText).toContain('U3B Inline Text');
    expect(finalText).toContain('U3B Second Text');
  });

  test('drags and aspect-resizes uploaded signatures independently across multiple overlays', async ({ page }) => {
    const payload = await uploadBlank(page);
    const pageId = payload.vdm.pages[0].page_id as string;
    const first = await applyUploadedSignature(page, pageId, 72, 90, 180, 60);
    await dragOverlay(page, first.overlay.id, 30, 20);

    await page.getByTestId('studio-signature-overlay-' + first.overlay.id).click();
    const signature = page.getByTestId(`studio-interactive-overlay-${first.overlay.id}`);
    const signatureBox = await signature.boundingBox();
    expect(signatureBox).not.toBeNull();
    const resize = signature.getByRole('button', { name: 'Resize overlay bottom right' });
    const resizeBox = await resize.boundingBox();
    expect(resizeBox).not.toBeNull();
    const resizeRequest = page.waitForRequest((request) => request.url().endsWith('/commands') && request.method() === 'POST');
    const resizeResponse = page.waitForResponse((response) => response.url().endsWith('/commands') && response.request().method() === 'POST');
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2 + 60, resizeBox!.y + resizeBox!.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    const resized = (await resizeRequest).postDataJSON();
    expect((await resizeResponse).status()).toBe(200);
    expect(resized.operation).toBe('update_signature_overlay');
    expect(resized.parameters.width / resized.parameters.height).toBeCloseTo(3, 5);

    await page.getByTestId('studio-new-signature').click();
    const second = await applyUploadedSignature(page, pageId, 300, 200, 120, 40);
    expect(second.overlay.id).not.toBe(first.overlay.id);
    await page.getByTestId(`studio-signature-overlay-${first.overlay.id}`).click();
    await expect(page.getByTestId(`studio-interactive-overlay-${first.overlay.id}`)).toHaveClass(/ring-2/);
    await page.getByTestId(`studio-signature-overlay-${second.overlay.id}`).click();
    await expect(page.getByTestId(`studio-interactive-overlay-${second.overlay.id}`)).toHaveClass(/ring-2/);

    const finalVDM = await page.request.get(`http://localhost:8080/api/studio/v1/sessions/${payload.session.id}`).then((response) => response.json());
    const signatures = finalVDM.vdm.pages[0].overlays.filter((candidate: { type: string }) => candidate.type === 'signature');
    expect(signatures.map((candidate: { id: string }) => candidate.id)).toEqual(expect.arrayContaining([first.overlay.id, second.overlay.id]));

    const downloadPromise = page.waitForEvent('download');
    const exportResponse = page.waitForResponse((response) => response.url().endsWith('/export') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    expect((await exportResponse).status()).toBe(200);
    expect(await (await downloadPromise).path()).toBeTruthy();
  });
});
