import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Lock PDF Hybrid & Offline Integration Suite', () => {

  const testPlainPdfPath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');

  test('1. Backend ONLINE + Auto Mode: Encrypts locally in-browser with zero backend security calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendLockRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/security/lock')) {
        backendLockRequests.push(req.url());
      }
    });

    await page.goto('/lock-pdf');
    await page.waitForLoadState('networkidle');

    // Upload plain PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPlainPdfPath);

    // Transition to workspace
    await expect(page).toHaveURL(/\/lock-pdf\/workspace/);

    // Enter Password
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('MySecretPass123');

    // Click Lock Button
    const lockBtn = page.getByRole('button', { name: /Encrypt and Protect PDF/i });
    await expect(lockBtn).toBeVisible();
    await lockBtn.click();

    // Reaches download page
    await expect(page).toHaveURL(/\/lock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Local execution with 0 backend calls
    expect(backendLockRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Backend ONLINE + Device Mode: Completes 100% locally in Device mode', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendLockRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/security/lock')) {
        backendLockRequests.push(req.url());
      }
    });

    await page.goto('/lock-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPlainPdfPath);

    await expect(page).toHaveURL(/\/lock-pdf\/workspace/);

    // Select Device mode in ProcessingModeSelector if visible
    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('MySecretPass123');

    const lockBtn = page.getByRole('button', { name: /Encrypt and Protect PDF/i });
    await lockBtn.click();

    await expect(page).toHaveURL(/\/lock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendLockRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Backend OFFLINE + Auto Mode: Encrypts and downloads with backend completely unreachable', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Abort all backend /api/ requests
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/lock-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPlainPdfPath);

    await expect(page).toHaveURL(/\/lock-pdf\/workspace/);

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('OfflinePass123');

    const lockBtn = page.getByRole('button', { name: /Encrypt and Protect PDF/i });
    await lockBtn.click();

    await expect(page).toHaveURL(/\/lock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('4. Backend OFFLINE + Device Mode: Operates completely on device with backend offline', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/lock-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPlainPdfPath);

    await expect(page).toHaveURL(/\/lock-pdf\/workspace/);

    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('OfflinePass123');

    const lockBtn = page.getByRole('button', { name: /Encrypt and Protect PDF/i });
    await lockBtn.click();

    await expect(page).toHaveURL(/\/lock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
  });

  test('5. Missing password keeps button disabled or requires input', async ({ page }) => {
    await page.goto('/lock-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testPlainPdfPath);

    await expect(page).toHaveURL(/\/lock-pdf\/workspace/);

    const lockBtn = page.getByRole('button', { name: /Encrypt and Protect PDF/i });
    await expect(lockBtn).toBeDisabled();
  });

});
