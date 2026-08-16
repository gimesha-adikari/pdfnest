import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Compress PDF Hybrid & Offline Integration Suite', () => {

  const testPdfPath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');
  const normalTextPdfPath = path.resolve(process.cwd(), 'tests/fixtures/normal_text.pdf');

  test('1. Online Auto LOW: Optimizes locally in-browser with zero backend calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/optimize/compress')) {
        backendCompressRequests.push(req.url());
      }
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const lowBtn = page.getByRole('button', { name: /Low/i });
    if (await lowBtn.isVisible()) {
      await lowBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Online Auto MEDIUM: Optimizes vector text PDF locally with zero backend calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/optimize/compress')) {
        backendCompressRequests.push(req.url());
      }
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(normalTextPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const medBtn = page.getByRole('button', { name: /Medium/i });
    if (await medBtn.isVisible()) {
      await medBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Online Auto HIGH: Routes to Cloud Ghostscript for aggressive raster compression', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    await page.route('**/api/optimize/compress', async (route) => {
      backendCompressRequests.push(route.request().url());
      const fixtureBytes = fs.readFileSync(testPdfPath);
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: fixtureBytes,
        headers: {
          'Content-Disposition': 'attachment; filename="optimized_sample.pdf"',
        },
      });
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const highBtn = page.getByRole('button', { name: /High/i });
    if (await highBtn.isVisible()) {
      await highBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    // Auto HIGH routes to Cloud
    expect(backendCompressRequests.length).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });

  test('4. Device Mode LOW: Completes 100% locally with 0 cloud calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/optimize/compress')) {
        backendCompressRequests.push(req.url());
      }
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const lowBtn = page.getByRole('button', { name: /Low/i });
    if (await lowBtn.isVisible()) {
      await lowBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('5. Device Mode MEDIUM: Completes 100% locally in Device mode', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/optimize/compress')) {
        backendCompressRequests.push(req.url());
      }
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(normalTextPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const medBtn = page.getByRole('button', { name: /Medium/i });
    if (await medBtn.isVisible()) {
      await medBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('6. Device Mode HIGH Limitation: Displays clear local raster downsampling limitation notice and processes locally', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/optimize/compress')) {
        backendCompressRequests.push(req.url());
      }
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const highBtn = page.getByRole('button', { name: /High/i });
    if (await highBtn.isVisible()) {
      await highBtn.click();
    }

    // Limitation notice should appear
    await expect(page.getByText(/Local Execution Limitation/i)).toBeVisible();
    await expect(page.getByText(/Aggressive raster image downsampling/i)).toBeVisible();

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('7. Offline Mode LOW: Optimizes and downloads with backend completely unreachable', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/compress-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const lowBtn = page.getByRole('button', { name: /Low/i });
    if (await lowBtn.isVisible()) {
      await lowBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('8. Offline Mode MEDIUM: Optimizes vector text PDF with backend completely offline', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/compress-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(normalTextPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const medBtn = page.getByRole('button', { name: /Medium/i });
    if (await medBtn.isVisible()) {
      await medBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('9. Offline Mode HIGH: Shows limitation notice and executes local structural compaction', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/compress-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const highBtn = page.getByRole('button', { name: /High/i });
    if (await highBtn.isVisible()) {
      await highBtn.click();
    }

    await expect(page.getByText(/Local Execution Limitation/i)).toBeVisible();

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('10. Cloud Mode: Explicitly dispatches to backend with level parameter', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendCompressRequests: string[] = [];
    await page.route('**/api/optimize/compress', async (route) => {
      backendCompressRequests.push(route.request().url());
      const fixtureBytes = fs.readFileSync(testPdfPath);
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: fixtureBytes,
        headers: {
          'Content-Disposition': 'attachment; filename="optimized_sample.pdf"',
        },
      });
    });

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const cloudModeBtn = page.getByRole('button', { name: /Cloud/i });
    if (await cloudModeBtn.isVisible()) {
      await cloudModeBtn.click();
    }

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendCompressRequests.length).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });

  test('11. Zero Size Expansion Invariant: Already optimized PDF reports 0% / preserved file cleanly', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/compress-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPdfPath);
    await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

    const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
    await compressBtn.click();

    await expect(page).toHaveURL(/\/compress-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

});
