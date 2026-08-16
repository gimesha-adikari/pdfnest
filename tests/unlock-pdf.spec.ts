import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Unlock PDF Hybrid & Offline Integration Suite', () => {

  const testEncryptedPdfPath = path.resolve(process.cwd(), 'tests/fixtures/encrypted_sample.pdf');

  test('1. Backend ONLINE + Auto Mode: Decrypts locally in-browser with zero backend security calls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendUnlockRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/security/unlock')) {
        backendUnlockRequests.push(req.url());
      }
    });

    await page.goto('/unlock-pdf');
    await page.waitForLoadState('networkidle');

    // Upload encrypted PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testEncryptedPdfPath);

    // Transition to workspace
    await expect(page).toHaveURL(/\/unlock-pdf\/workspace/);

    // Enter Password
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('secret123');

    // Click Unlock Button
    const unlockBtn = page.getByRole('button', { name: /Remove Security and Unlock PDF/i });
    await expect(unlockBtn).toBeVisible();
    await unlockBtn.click();

    // Reaches download page
    await expect(page).toHaveURL(/\/unlock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();
    await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();

    // Local execution with 0 backend calls
    expect(backendUnlockRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('2. Backend ONLINE + Device Mode: Completes 100% locally in Device mode', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const backendUnlockRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/security/unlock')) {
        backendUnlockRequests.push(req.url());
      }
    });

    await page.goto('/unlock-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testEncryptedPdfPath);

    await expect(page).toHaveURL(/\/unlock-pdf\/workspace/);

    // Select Device mode in ProcessingModeSelector if visible
    const deviceModeBtn = page.getByRole('button', { name: /Device/i });
    if (await deviceModeBtn.isVisible()) {
      await deviceModeBtn.click();
    }

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('secret123');

    const unlockBtn = page.getByRole('button', { name: /Remove Security and Unlock PDF/i });
    await unlockBtn.click();

    await expect(page).toHaveURL(/\/unlock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(backendUnlockRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('3. Backend OFFLINE + Auto Mode: Unlocks and downloads with backend completely unreachable', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Abort all backend /api/ requests
    await page.route('**/api/**', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/unlock-pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testEncryptedPdfPath);

    await expect(page).toHaveURL(/\/unlock-pdf\/workspace/);

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('secret123');

    const unlockBtn = page.getByRole('button', { name: /Remove Security and Unlock PDF/i });
    await unlockBtn.click();

    await expect(page).toHaveURL(/\/unlock-pdf\/download/, { timeout: 15000 });
    await expect(page.getByText('Task completed successfully!')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('4. Wrong password shows user-friendly error and does not download', async ({ page }) => {
    await page.goto('/unlock-pdf');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testEncryptedPdfPath);

    await expect(page).toHaveURL(/\/unlock-pdf\/workspace/);

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('wrong_password_123');

    const unlockBtn = page.getByRole('button', { name: /Remove Security and Unlock PDF/i });
    await unlockBtn.click();

    // Verify error banner / toast
    await expect(page.getByText(/Incorrect password/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Decryption Failed')).toBeVisible();
    // Remains on workspace
    expect(page.url()).toContain('/unlock-pdf/workspace');
  });

});
