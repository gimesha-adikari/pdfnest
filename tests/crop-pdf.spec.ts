import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

test.describe('Crop PDF Hybrid & Adaptive Preview Integration Suite', () => {

  let testPdfPath: string;

  test.beforeAll(async () => {
    // Generate a valid 2-page test PDF fixture
    const doc = await PDFDocument.create();
    const p1 = doc.addPage([600, 800]);
    p1.drawText('Page 1 Content for Crop Test', { x: 50, y: 700 });
    const p2 = doc.addPage([600, 800]);
    p2.drawText('Page 2 Content for Crop Test', { x: 50, y: 700 });

    const pdfBytes = await doc.save();
    testPdfPath = path.resolve(process.cwd(), 'tests/fixtures/tmp_crop_test.pdf');
    fs.writeFileSync(testPdfPath, Buffer.from(pdfBytes));
  });

  test.afterAll(() => {
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  test('1. Online Mode with Server Preview: Preview loads, crop executes locally in Auto mode, file downloads', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCropRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/structure/crop')) {
        backendCropRequests.push(req.url());
      }
    });

    await page.goto('/crop-pdf');
    await page.waitForLoadState('networkidle');

    // Upload PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    // Transition to workspace
    await expect(page).toHaveURL(/\/crop-pdf\/workspace/);

    // Bounding box inputs and preview container visible
    await expect(page.getByText('Bounding Box Parameters (Points)')).toBeVisible();
    await expect(page.locator('.cursor-move')).toBeVisible();

    // Verify Page Selection and change min X
    const minXInput = page.locator('input[type="number"]').first();
    await minXInput.fill('60');

    // Execute Crop
    const cropBtn = page.getByRole('button', { name: /Crop PDF Document/i });
    await expect(cropBtn).toBeVisible();
    await cropBtn.click();

    // Download page reached
    await expect(page).toHaveURL(/\/crop-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Auto mode executes locally with 0 backend structure crop requests
    expect(backendCropRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Server Preview Failure (503 / Network Error): Automatically falls back to ClientPdfRenderer and succeeds', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Mock failure on server preview endpoint
    await page.route('**/api/preview/**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server preview service temporarily unavailable' }),
      });
    });

    await page.goto('/crop-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    await expect(page).toHaveURL(/\/crop-pdf\/workspace/);

    // Despite /api/preview/ 503, ClientPdfRenderer fallback renders page image
    await expect(page.locator('img[alt="PDF Page Preview"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cursor-move')).toBeVisible();

    // Crop box parameters still editable
    await expect(page.getByText('Bounding Box Parameters (Points)')).toBeVisible();

    // Click Crop
    const cropBtn = page.getByRole('button', { name: /Crop PDF Document/i });
    await cropBtn.click();

    await expect(page).toHaveURL(/\/crop-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('3. Complete Offline Execution: Backend completely offline, ClientPdfRenderer renders, local crop completes with 0 backend calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendRequests: string[] = [];
    // Route all /api/ requests to fail or simulate offline backend
    await page.route('**/api/**', async (route) => {
      backendRequests.push(route.request().url());
      await route.abort('failed');
    });

    await page.goto('/crop-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);

    await expect(page).toHaveURL(/\/crop-pdf\/workspace/);

    // Verify client-rendered canvas image and crop overlay
    await expect(page.locator('img[alt="PDF Page Preview"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cursor-move')).toBeVisible();

    // Select "All pages"
    const allPagesBtn = page.getByRole('button', { name: 'All pages', exact: true });
    await allPagesBtn.click();
    await expect(page.getByText('Target Scope:')).toBeVisible();

    // Click Crop
    const cropBtn = page.getByRole('button', { name: /Crop PDF Document/i });
    await cropBtn.click();

    // Reaches download page locally
    await expect(page).toHaveURL(/\/crop-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Verify 0 backend structure processing calls succeeded
    const structureCalls = backendRequests.filter((url) => url.includes('/api/structure/'));
    expect(structureCalls).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

});
