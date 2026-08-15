import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

test.describe('PDF to Images Hybrid & Offline Integration Suite', () => {

  let testPdfPath: string;

  test.beforeAll(async () => {
    // Generate a valid 2-page test PDF fixture
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([600, 800]);
    p1.drawText('First Page for PDF to Image conversion', { x: 50, y: 700 });
    const p2 = doc.addPage([600, 800]);
    p2.drawText('Second Page for PDF to Image conversion', { x: 50, y: 700 });

    const pdfBytes = await doc.save();
    testPdfPath = path.resolve(process.cwd(), 'tests/fixtures/tmp_pdf_to_images_test.pdf');
    fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));
  });

  test.afterAll(() => {
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test('1. Backend ONLINE + Auto Mode: Converts locally in-browser with zero backend conversion calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendRasterizeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/conversion/pdf-to-images')) {
        backendRasterizeRequests.push(req.url());
      }
    });

    await page.goto('/pdf-to-images');
    await page.waitForLoadState('networkidle');

    // Upload PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    // Transition to workspace
    await expect(page).toHaveURL(/\/pdf-to-images\/workspace/);

    // Verify option dropdown and action button
    await expect(page.getByRole('heading', { name: 'Image type' })).toBeVisible();
    const extractBtn = page.getByRole('button', { name: /Extract as JPEG/i });
    await expect(extractBtn).toBeVisible();

    // Click Extract
    await extractBtn.click();

    // Reaches download page
    await expect(page).toHaveURL(/\/pdf-to-images\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Auto mode executes locally with 0 backend conversion calls
    expect(backendRasterizeRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Backend ONLINE + Device Mode: Selects PNG format and completes locally', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendRasterizeRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/conversion/pdf-to-images')) {
        backendRasterizeRequests.push(req.url());
      }
    });

    await page.goto('/pdf-to-images');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-images\/workspace/);

    // Select PNG format
    const formatSelect = page.locator('select');
    await formatSelect.selectOption('png');

    // Select Device mode in ProcessingModeSelector if available
    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const extractBtn = page.getByRole('button', { name: /Extract as PNG/i });
    await extractBtn.click();

    await expect(page).toHaveURL(/\/pdf-to-images\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendRasterizeRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Backend OFFLINE + Auto Mode: Converts and downloads ZIP with backend completely unreachable', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Abort all backend /api/ requests
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/pdf-to-images');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-images\/workspace/);

    // Click Extract
    const extractBtn = page.getByRole('button', { name: /Extract as JPEG/i });
    await extractBtn.click();

    // Reaches download page locally
    await expect(page).toHaveURL(/\/pdf-to-images\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('4. Backend OFFLINE + Device Mode: Completes 100% offline in explicit Device mode', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/pdf-to-images');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-images\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const extractBtn = page.getByRole('button', { name: /Extract as JPEG/i });
    await extractBtn.click();

    await expect(page).toHaveURL(/\/pdf-to-images\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

});
