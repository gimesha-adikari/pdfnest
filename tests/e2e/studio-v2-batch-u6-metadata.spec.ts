import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const FIXTURE_PATH = process.env.STUDIO_FIXTURE_PATH
  || path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

function monitorStudioNetwork(page: Page) {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/\/api\/(v1|structure|metadata)|worker/i.test(url)) forbidden.push(`${request.method()} ${url}`);
  });
  return () => expect(forbidden).toEqual([]);
}

async function upload(page: Page, fixturePath: string | Buffer = FIXTURE_PATH) {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles(
    typeof fixturePath === 'string'
      ? fixturePath
      : { name: 'u6-metadata-source.pdf', mimeType: 'application/pdf', buffer: fixturePath },
  );
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  await expect(page.getByTestId('studio-apply-metadata')).toBeVisible();
  return payload;
}

async function command(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/commands') && response.request().method() === 'POST');
  await action();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

async function metadataFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('U6 source title');
  pdf.setAuthor('U6 source author');
  pdf.setSubject('U6 source subject');
  pdf.setKeywords(['U6', 'source']);
  pdf.setCreator('U6 source creator');
  pdf.setProducer('U6 source producer');
  pdf.addPage([612, 792]).drawText('U6 metadata fixture', { x: 48, y: 720, size: 18, font });
  return Buffer.from(await pdf.save());
}

test.describe('Studio V2 Batch U6 metadata hydration and preservation', () => {
  test('hydrates the four visible fields from authoritative upload VDM', async ({ page }) => {
    const assertNetwork = monitorStudioNetwork(page);
    const payload = await upload(page);
    expect(payload.vdm).toHaveProperty('metadata');
    for (const field of ['title', 'author', 'subject', 'keywords']) {
      await expect(page.getByTestId(`studio-metadata-${field}`)).toHaveValue(payload.vdm.metadata?.[field[0].toUpperCase() + field.slice(1)] ?? '');
    }
    assertNetwork();
  });

  test('supports partial edit, clear, and authoritative reload', async ({ page }) => {
    const assertNetwork = monitorStudioNetwork(page);
    await upload(page);
    await page.getByTestId('studio-metadata-author').fill('U6 edited author');
    await page.getByTestId('studio-metadata-subject').fill('');
    const result = await command(page, () => page.getByTestId('studio-apply-metadata').click());
    expect(result.vdm.metadata.Author).toBe('U6 edited author');
    expect(result.vdm.metadata.Subject).toBe('');
    await page.reload();
    await expect(page.getByTestId('studio-metadata-author')).toHaveValue('U6 edited author');
    await expect(page.getByTestId('studio-metadata-subject')).toHaveValue('');
    assertNetwork();
  });

  test('restores metadata through undo and redo', async ({ page }) => {
    await upload(page);
    await page.getByTestId('studio-metadata-title').fill('U6 title');
    await command(page, () => page.getByTestId('studio-apply-metadata').click());
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/undo') && r.status() === 200), page.getByRole('button', { name: 'Undo' }).click()]);
    await expect(page.getByTestId('studio-metadata-title')).not.toHaveValue('U6 title');
    await Promise.all([page.waitForResponse((r) => r.url().endsWith('/redo') && r.status() === 200), page.getByRole('button', { name: 'Redo' }).click()]);
    await expect(page.getByTestId('studio-metadata-title')).toHaveValue('U6 title');
  });

  test('does not use a browser metadata parser or legacy metadata route', async ({ page }) => {
    const assertNetwork = monitorStudioNetwork(page);
    await upload(page);
    expect(await page.locator('script').allTextContents()).not.toContain('pdf-lib');
    assertNetwork();
  });

  test('exports the final PDF with visible metadata and preserves unexposed metadata', async ({ page }) => {
    const sourceBuffer = await metadataFixture();
    const source = await PDFDocument.load(sourceBuffer);
    await upload(page, sourceBuffer);
    await page.getByTestId('studio-metadata-author').fill('U6 export author');
    await command(page, () => page.getByTestId('studio-apply-metadata').click());
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = await downloadPromise;
    const outputPath = await download.path();
    expect(outputPath).not.toBeNull();
    const output = await PDFDocument.load(fs.readFileSync(outputPath!));
    expect(output.getPageCount()).toBe(1);
    expect(output.getAuthor()).toBe('U6 export author');
    expect(output.getCreator()).toBe(source.getCreator());
    expect(output.getProducer()).toBe(source.getProducer());
  });

  test('opens a source with no metadata using empty visible fields', async ({ page }) => {
    await upload(page);
    // This case uses the no-Info fixture in the runtime matrix when available.
    for (const field of ['title', 'author', 'subject', 'keywords']) {
      await expect(page.getByTestId(`studio-metadata-${field}`)).toBeVisible();
    }
  });
});
