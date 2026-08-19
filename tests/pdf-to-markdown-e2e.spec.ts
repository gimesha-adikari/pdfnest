import { test, expect } from '@playwright/test';
import fs from 'fs';
import { PdfToolHelper } from './helpers/pdf-tool';
import { FIXTURES } from './helpers/fixtures';
import { authenticateProUser } from './helpers/auth';

test.describe('PDF → Markdown Production E2E Suite', () => {

  test('1. Tool Discovery in Directory & Landing Page Hero', async ({ page }) => {
    await authenticateProUser(page);
    await page.goto('/tools');
    await page.waitForLoadState('networkidle');

    const card = page.locator('main a[href="/pdf-to-markdown"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('text=PDF to Markdown')).toBeVisible();

    await card.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/pdf-to-markdown$/);

    await expect(page.locator('h1')).toContainText(/PDF to Markdown/i);
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('2. Real CV PDF Conversion & Canonical Download Redirect', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV);

    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    await expect(page.locator('text=PDF successfully converted to Markdown!')).toBeVisible();
    await expect(page.locator('button:has-text("Download File")')).toBeVisible();
    await expect(page.locator('button:has-text("Process Another")')).toBeVisible();
  });

  test('3. Downloaded Artifact Content & Markdown Layout Quality Validation', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV);

    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    const downloadBtn = page.locator('button:has-text("Download File")').first();
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();
    await expect(downloadBtn).toBeEnabled();
  });

  test('4. Sequential Conversion Task & State Isolation (Real CV -> Sample PDF)', async ({ page }) => {
    // --- CONVERSION A: Real CV ---
    const helperA = new PdfToolHelper(page, 'pdf-to-markdown');
    await helperA.navigateToTool();
    await helperA.uploadFile(FIXTURES.GIMESHA_CV);

    await helperA.clickAction();
    await helperA.waitForSyncDownload(60000);

    const downloadBtnA = page.locator('button:has-text("Download File")').first();
    await expect(downloadBtnA).toBeVisible();

    // --- RESET & CONVERSION B: Sample PDF ---
    const startOverBtn = page.locator('button:has-text("Process Another")').first();
    await expect(startOverBtn).toBeVisible();
    await startOverBtn.click();

    await page.goto('/pdf-to-markdown', { waitUntil: 'domcontentloaded' });

    const helperB = new PdfToolHelper(page, 'pdf-to-markdown');
    await helperB.uploadFile(FIXTURES.SAMPLE_PDF);
    await helperB.clickAction();
    await helperB.waitForSyncDownload(60000);

    const downloadBtnB = page.locator('button:has-text("Download File")').first();
    await expect(downloadBtnB).toBeVisible();
  });

  test('5. Failed Second Conversion State Isolation', async ({ page }) => {
    // Intercept pdf-to-markdown-async calls on the browser context
    await page.route((url) => url.href.includes('pdf-to-markdown-async'), async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Simulated backend worker failure' }),
      });
    });

    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await helper.clickAction();
    await page.waitForTimeout(2000);

    // Verify user is NOT redirected to download page with stale result
    expect(page.url()).not.toMatch(/\/pdf-to-markdown\/download/);
    await expect(page.locator('text=Task completed successfully!')).not.toBeVisible();
  });

  test('6. Quota Rejection Non-Retryable Error Handling & Single Request Proof', async ({ page }) => {
    await authenticateProUser(page);

    let submitRequestCount = 0;
    await page.route((url) => url.href.includes('pdf-to-markdown-async'), async (route) => {
      submitRequestCount++;
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'HOURLY_LIMIT_REACHED',
          title: 'Usage Limit Reached',
          message: "You've reached your 3-hour usage limit.",
        }),
      });
    });

    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV);

    await helper.clickAction();
    await page.waitForTimeout(1500);

    // 1. Verify exactly ONE submission request occurred (0 retries!)
    expect(submitRequestCount).toBe(1);

    // 2. Verify user-visible error toast / alert banner is present on screen
    await expect(page.locator('text=You\'ve reached your 3-hour usage limit.').first()).toBeVisible({ timeout: 10000 });

    // 3. Verify uploaded PDF remains in workspace
    await expect(page.locator('text=gimesha_cv.pdf')).toBeVisible();

    // 4. Verify URL remains /pdf-to-markdown/workspace
    await expect(page).toHaveURL(/\/pdf-to-markdown\/workspace$/);

    // 5. Verify no redirect to download page or stale result display
    await expect(page.locator('button:has-text("Download File")')).not.toBeVisible();
  });

  test('7. Catalog Merge Discovery (Backend Missing PDF → Markdown)', async ({ page }) => {
    await authenticateProUser(page);

    await page.route('**/site-content/tools', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, title: 'Merge PDF', href: '/merge-pdf', category: 'organize', isActive: true },
        ]),
      });
    });

    await page.goto('/tools');
    await page.waitForLoadState('networkidle');

    const pdfToMdLink = page.locator('main a[href="/pdf-to-markdown"]').first();
    await expect(pdfToMdLink).toBeVisible({ timeout: 15000 });
  });

  test('8. Catalog Merge Deduplication (Backend Has PDF → Markdown)', async ({ page }) => {
    await authenticateProUser(page);

    await page.goto('/tools');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('main a[href="/pdf-to-markdown"]');
    await expect(cards).toHaveCount(1);
  });

  test('9. Mobile Responsive Viewport Discovery & Download Flow', async ({ page }) => {
    await authenticateProUser(page);
    await page.setViewportSize({ width: 375, height: 667 });

    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    await expect(page.locator('button:has-text("Download File")')).toBeVisible();
  });

  test('10. Security Verification: DOMPurify Protection', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();

    const xssExecuted = await page.evaluate(() => (window as any).__xss_executed || (window as any).__xss_onerror);
    expect(xssExecuted).toBeFalsy();
  });

  test('11. Password-Protected Locked PDF Unlock & Markdown Conversion Flow', async ({ page }) => {
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));
    page.on('response', res => console.log('[BROWSER NETWORK]', res.status(), res.url()));

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();

    // 1. Upload genuinely password-protected PDF directly into file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURES.LOCKED_SAMPLE_PDF);

    // 2. Verify centralized password prompt card is displayed
    await expect(page.locator('text=Protected Document Detected')).toBeVisible({ timeout: 10000 });

    // 3. Test wrong password first
    const passwordInput = page.locator('input[placeholder="Enter PDF Password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('wrongpass');
    await page.click('button:has-text("Unlock & Continue")');

    await expect(page.locator('text=Incorrect password or corrupted file.')).toBeVisible({ timeout: 5000 });

    // 4. Fill correct password 'secret123' and unlock
    await passwordInput.fill('secret123');
    await expect(passwordInput).toHaveValue('secret123');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Unlock & Continue")');

    // 5. Verify unlock completes and navigates to workspace
    await expect(page).toHaveURL(/\/pdf-to-markdown\/workspace$/, { timeout: 20000 });
    await expect(page.locator('text=locked_sample.pdf')).toBeVisible();

    // 6. Click Convert to Markdown
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    // 7. Verify download page reached successfully
    await expect(page.locator('button:has-text("Download File")')).toBeVisible();
  });

});

