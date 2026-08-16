import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PDF to Text Hybrid & Offline Integration Suite', () => {

  const testTextPdfPath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');
  const testScannedPdfPath = path.resolve(process.cwd(), 'tests/fixtures/scanned_page.pdf');

  test('1. Backend ONLINE + Auto Mode (Text PDF): Extracts locally in-browser with zero backend OCR calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendOcrRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/ocr/extract-text')) {
        backendOcrRequests.push(req.url());
      }
    });

    await page.goto('/pdf-to-text');
    await page.waitForLoadState('networkidle');

    // Upload text PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testTextPdfPath);

    // Transition to workspace
    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);

    // Click Extract Text Button
    const extractBtn = page.getByRole('button', { name: 'Extract Text', exact: true });
    await expect(extractBtn).toBeVisible();
    await extractBtn.click();

    // Reaches download page
    await expect(page).toHaveURL(/\/pdf-to-text\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Local execution with 0 backend calls
    expect(backendOcrRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Backend ONLINE + Device Mode: Completes 100% locally in Device mode', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendOcrRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/ocr/extract-text')) {
        backendOcrRequests.push(req.url());
      }
    });

    await page.goto('/pdf-to-text');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testTextPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);

    // Select Device mode in ProcessingModeSelector if visible
    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const extractBtn = page.getByRole('button', { name: 'Extract Text', exact: true });
    await extractBtn.click();

    await expect(page).toHaveURL(/\/pdf-to-text\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendOcrRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Backend OFFLINE + Auto Mode (Text PDF): Extracts and downloads with backend completely unreachable', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Abort all backend /api/ requests
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/pdf-to-text');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testTextPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);

    const extractBtn = page.getByRole('button', { name: 'Extract Text', exact: true });
    await extractBtn.click();

    await expect(page).toHaveURL(/\/pdf-to-text\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('4. Backend OFFLINE + Device Mode (Text PDF): Operates completely on device with backend offline', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/pdf-to-text');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testTextPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const extractBtn = page.getByRole('button', { name: 'Extract Text', exact: true });
    await extractBtn.click();

    await expect(page).toHaveURL(/\/pdf-to-text\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
  });

  test('5. Backend OFFLINE + Device Mode (Scanned PDF): Extracts native layer locally without crash', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/pdf-to-text');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testScannedPdfPath);

    await expect(page).toHaveURL(/\/pdf-to-text\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const extractBtn = page.getByRole('button', { name: 'Extract Text', exact: true });
    await extractBtn.click();

    // Reaches download page with on-device text output
    await expect(page).toHaveURL(/\/pdf-to-text\/download/, { timeout: 15000 });
  });

});
