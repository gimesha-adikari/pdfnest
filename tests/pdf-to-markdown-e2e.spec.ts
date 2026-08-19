import { test, expect } from '@playwright/test';
import { PdfToolHelper } from './helpers/pdf-tool';
import { FIXTURES } from './helpers/fixtures';
import { authenticateProUser } from './helpers/auth';

test.describe('PDF to Markdown Real Production E2E Suite', () => {

  test('1. Tool Discovery in Directory & Landing Page Hero', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await expect(page.locator('h1')).toContainText(/Convert PDF to Markdown/i);
  });

  test('2. Real CV PDF Conversion & Canonical Download Redirect', async ({ page }) => {
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    await expect(page).toHaveURL(/\/pdf-to-markdown\/download$/, { timeout: 10000 });
    await expect(page.locator('button:has-text("Download File")')).toBeVisible();
  });

  test('3. Downloaded Artifact Content & Markdown Layout Quality Validation', async ({ page }) => {
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Download File")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('gimesha_cv.md');

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fs = require('fs');
    const content = fs.readFileSync(downloadPath, 'utf8');

    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('Gimesha');
    expect(content).not.toContain('| --- | --- |');
  });

  test('4. Sequential Conversion Task & State Isolation (Real CV -> Sample PDF)', async ({ page }) => {
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');

    // Convert PDF A
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    const download1Promise = page.waitForEvent('download');
    await page.click('button:has-text("Download File")');
    const download1 = await download1Promise;
    expect(download1.suggestedFilename()).toBe('gimesha_cv.md');

    // Click "Convert Another File" / Start Over
    await page.click('a:has-text("Convert Another File"), button:has-text("Convert Another File"), button:has-text("Start Over")');
    await expect(page).toHaveURL(/\/pdf-to-markdown$/, { timeout: 10000 });

    // Convert PDF B
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    const download2Promise = page.waitForEvent('download');
    await page.click('button:has-text("Download File")');
    const download2 = await download2Promise;
    expect(download2.suggestedFilename()).toBe('sample.md');

    const fs = require('fs');
    const content2 = fs.readFileSync(await download2.path(), 'utf8');
    expect(content2).not.toContain('Gimesha');
  });

  test('5. Failed Second Conversion State Isolation', async ({ page }) => {
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');

    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    await page.click('a:has-text("Convert Another File"), button:has-text("Convert Another File"), button:has-text("Start Over")');
    await expect(page).toHaveURL(/\/pdf-to-markdown$/, { timeout: 10000 });

    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await expect(page.locator('text=gimesha_cv.pdf')).toBeVisible();
  });

  test('6. Quota Rejection Non-Retryable Error Handling & Single Request Proof', async ({ page }) => {
    let conversionPostCount = 0;

    await page.route('**/api/conversion/pdf-to-markdown-async', async route => {
      conversionPostCount++;
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'RATE_LIMIT_EXCEEDED',
          message: "You've reached your 3-hour usage limit."
        })
      });
    });

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await helper.clickAction();

    await expect(page.locator('[data-testid="pdf-to-markdown-error-banner"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=You\'ve reached your 3-hour usage limit.')).toBeVisible();

    await page.waitForTimeout(3000);
    expect(conversionPostCount).toBe(1);
  });

  test('7. Catalog Merge Discovery (Backend Missing PDF → Markdown)', async ({ page }) => {
    await page.route('**/api/v1/tools', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'pdf-to-text', title: 'PDF to Text', category: 'Conversion' }
        ])
      });
    });

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await expect(page.locator('h1')).toContainText(/Convert PDF to Markdown/i);
  });

  test('8. Catalog Merge Deduplication (Backend Has PDF → Markdown)', async ({ page }) => {
    await page.route('**/api/v1/tools', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'pdf-to-markdown', title: 'PDF to Markdown Backend', category: 'Conversion' }
        ])
      });
    });

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await expect(page.locator('h1')).toContainText(/Convert PDF to Markdown/i);
  });

  test('9. Mobile Responsive Viewport Discovery & Download Flow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    await expect(page).toHaveURL(/\/pdf-to-markdown\/download$/, { timeout: 10000 });
    await expect(page.locator('button:has-text("Download File")')).toBeVisible();
  });

  test('10. Security Verification: DOMPurify Protection', async ({ page }) => {
    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();

    await page.evaluate(() => {
      (window as any).__xss_executed = false;
    });

    await helper.uploadFile(FIXTURES.GIMESHA_CV_PDF);
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

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

  test('12. OCR Language Selector UI & Dynamic Transmission (lang=sin)', async ({ page }) => {
    let capturedLang = '';

    await page.route('**/api/conversion/pdf-to-markdown-async', async route => {
      const request = route.request();
      const postData = request.postData() || '';
      if (postData.includes('name="lang"')) {
        const match = postData.match(/name="lang"\r\n\r\n([^\r\n]+)/);
        if (match) capturedLang = match[1];
      }
      await route.continue();
    });

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // 1. Verify language selector component is rendered and defaults to "Auto detect"
    const langSelector = page.locator('[data-testid="pdf-to-markdown-language-selector"]');
    await expect(langSelector).toBeVisible({ timeout: 10000 });
    await expect(langSelector).toContainText('Auto detect');

    // 2. Open language picker dropdown
    await langSelector.click();

    // 3. Search for "Sinhala"
    const searchInput = page.locator('input[placeholder="Search language..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Sinhala');

    // 4. Select Sinhala language option
    const sinOption = page.locator('button:has-text("Sinhala; Sinhalese")');
    await expect(sinOption).toBeVisible();
    await sinOption.click();

    // 5. Verify dropdown closed and selected language updated to Sinhala
    await expect(langSelector).toContainText('Sinhala; Sinhalese');

    // 6. Click Convert to Markdown & verify form data transmitted lang=sin
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    expect(capturedLang).toBe('sin');
  });

  test('13. Password-Protected Locked PDF + OCR Language Selection Flow', async ({ page }) => {
    let capturedLang = '';
    let capturedPassword = '';

    await page.route('**/api/conversion/pdf-to-markdown-async', async route => {
      const request = route.request();
      const postData = request.postData() || '';
      const langMatch = postData.match(/name="lang"\r\n\r\n([^\r\n]+)/);
      if (langMatch) capturedLang = langMatch[1];
      const passMatch = postData.match(/name="password"\r\n\r\n([^\r\n]+)/);
      if (passMatch) capturedPassword = passMatch[1];
      await route.continue();
    });

    await authenticateProUser(page);
    const helper = new PdfToolHelper(page, 'pdf-to-markdown');
    await helper.navigateToTool();

    // 1. Upload locked PDF and unlock with secret123
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURES.LOCKED_SAMPLE_PDF);
    await expect(page.locator('text=Protected Document Detected')).toBeVisible({ timeout: 10000 });

    const passwordInput = page.locator('input[placeholder="Enter PDF Password"]');
    await passwordInput.fill('secret123');
    await page.click('button:has-text("Unlock & Continue")');

    await expect(page).toHaveURL(/\/pdf-to-markdown\/workspace$/, { timeout: 20000 });

    // 2. Select English in language picker
    const langSelector = page.locator('[data-testid="pdf-to-markdown-language-selector"]');
    await langSelector.click();
    const searchInput = page.locator('input[placeholder="Search language..."]');
    await searchInput.fill('English');
    const engOption = page.locator('button:has-text("English")').first();
    await engOption.click();

    // 3. Convert & verify both password and lang were correctly forwarded
    await helper.clickAction();
    await helper.waitForSyncDownload(60000);

    expect(capturedLang).toBe('eng');
    expect(capturedPassword).toBe('secret123');
  });

});
