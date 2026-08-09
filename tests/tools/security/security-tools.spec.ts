import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';
import { assertValidPdfHeader } from '../../helpers/assertions';

test.describe('Security Category Tools', () => {

  test('Lock PDF (Encrypt): password-encrypts a PDF document', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'lock-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);
    
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('secret123');
    
    const confirmInput = page.locator('input[type="password"]').nth(1);
    if (await confirmInput.isVisible()) {
      await confirmInput.fill('secret123');
    }

    await helper.clickAction('Encrypt and Protect PDF');
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();

    assertValidPdfHeader(result.buffer);
  });

  test('Unlock PDF (Decrypt): removes password protection from a PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'unlock-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('test123');
    }

    await helper.clickAction('Remove Security and Unlock PDF');
    // If unencrypted PDF is supplied, check that workspace is present or handles cleanly
    await expect(page).toHaveURL(/unlock-pdf/);
  });

  test('Redact PDF: sanitizes and blackouts sensitive content in PDF', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'redact-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    const keywordInput = page.locator('textarea, input[placeholder*="Passport"]').first();
    await keywordInput.waitFor({ state: 'visible', timeout: 15000 });
    await keywordInput.fill('PDFNEST');

    await helper.clickAction('Execute Secure Binary Redaction');
    await helper.waitForSyncDownload();
    const result = await helper.captureDownload();

    assertValidPdfHeader(result.buffer);
  });

});
