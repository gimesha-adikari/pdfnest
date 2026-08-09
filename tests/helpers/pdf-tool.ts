import { Page, expect } from '@playwright/test';
import fs from 'fs';
import { authenticateProUser } from './auth';

export interface DownloadResult {
  buffer: Buffer;
  fileName: string;
  suggestedFileName: string;
}

export class PdfToolHelper {
  private authenticated = false;

  constructor(
    public page: Page,
    public toolId: string
  ) {
    // Attach browser console & error listeners for full failure diagnostics
    this.page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('error') || msg.text().includes('API')) {
        console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });

    this.page.on('pageerror', err => {
      console.log(`[BROWSER UNHANDLED ERROR] ${err.stack || err.message}`);
    });

    this.page.on('requestfailed', req => {
      console.log(`[BROWSER REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
  }

  /**
   * Navigates to the tool's landing page (e.g. /merge-pdf).
   * Automatically authenticates as PRO user to prevent HTTP 429 rate limits.
   */
  async navigateToTool(): Promise<void> {
    if (!this.authenticated) {
      await authenticateProUser(this.page);
      this.authenticated = true;
    }

    console.log(`[PdfToolHelper] Navigating to /${this.toolId}`);
    await this.page.goto(`/${this.toolId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Uploads a single file using the hidden file input inside PdfUploader/PdfDropzone.
   */
  async uploadFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture file not found: ${filePath}`);
    }

    console.log(`[PdfToolHelper] Uploading file: ${filePath}`);
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 10000 });
    await fileInput.setInputFiles(filePath);

    console.log(`[PdfToolHelper] Waiting for navigation to /${this.toolId}/workspace`);
    await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/workspace`), { timeout: 20000 });
    console.log(`[PdfToolHelper] Reached workspace page: ${this.page.url()}`);
  }

  /**
   * Uploads multiple files for tools accepting batch uploads (e.g. merge-pdf, images-to-pdf).
   */
  async uploadFiles(filePaths: string[]): Promise<void> {
    for (const fp of filePaths) {
      if (!fs.existsSync(fp)) {
        throw new Error(`Fixture file not found: ${fp}`);
      }
    }

    console.log(`[PdfToolHelper] Uploading ${filePaths.length} files to /${this.toolId}`);
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 10000 });
    await fileInput.setInputFiles(filePaths);

    console.log(`[PdfToolHelper] Waiting for navigation to /${this.toolId}/workspace`);
    await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/workspace`), { timeout: 20000 });
    console.log(`[PdfToolHelper] Reached workspace page: ${this.page.url()}`);
  }

  /**
   * Submits a URL for URL-to-PDF tool.
   */
  async submitUrl(url: string): Promise<void> {
    console.log(`[PdfToolHelper] Submitting URL: ${url}`);
    const urlInput = this.page.locator('input[type="url"], input[placeholder*="http"], input[placeholder*="URL"]');
    await urlInput.fill(url);
    
    const submitBtn = this.page.locator('form button[type="submit"]').first();
    await submitBtn.click();

    await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/workspace`), { timeout: 20000 });
  }

  /**
   * Clicks the primary action button to start processing.
   */
  async clickAction(customButtonText?: string): Promise<void> {
    console.log(`[PdfToolHelper] Clicking action button (customText: ${customButtonText || 'none'})`);
    
    const dismissAdBtn = this.page.locator('button:has-text("Continue with Standard Stack")').first();
    if (await dismissAdBtn.isVisible()) {
      await dismissAdBtn.click();
    }

    let actionBtn;
    if (customButtonText) {
      actionBtn = this.page.locator(`button:has-text("${customButtonText}")`).first();
    } else {
      actionBtn = this.page.locator('main button.from-indigo-500').first();
      const primaryCount = await actionBtn.count();
      if (primaryCount === 0) {
        actionBtn = this.page.locator('main button').filter({
          hasText: /^(Merge|Compress|Convert|Process|Split|Rotate|Delete|Protect|Unlock|Repair|Watermark|Extract|Create|Save|Add|Stamp|Update|Redact|Sign|Apply)/i
        }).first();
      }
    }

    await actionBtn.waitFor({ state: 'visible', timeout: 15000 });
    await expect(actionBtn).toBeEnabled({ timeout: 20000 });
    const btnText = await actionBtn.innerText();
    console.log(`[PdfToolHelper] Action button found: "${btnText.trim()}"`);
    await actionBtn.click();
    console.log(`[PdfToolHelper] Action button clicked.`);
  }

  /**
   * Waits for synchronous processing to finish and transition to the download page.
   */
  async waitForSyncDownload(timeoutMs = 60_000): Promise<void> {
    console.log(`[PdfToolHelper] Waiting for transition to download page /${this.toolId}/download`);
    try {
      await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
    } catch (err) {
      console.log(`[PdfToolHelper] Navigation timeout, checking for rate limit retry...`);
      await this.page.waitForTimeout(3000);
      const actionBtn = this.page.locator('main button.from-indigo-500, main button:has-text("Convert"), main button:has-text("Process")').first();
      if (await actionBtn.isVisible()) {
        console.log(`[PdfToolHelper] Retrying action click after backoff...`);
        await actionBtn.click();
        await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
      } else {
        throw err;
      }
    }
    await expect(this.page.locator('h2:has-text("Task completed successfully!")')).toBeVisible({ timeout: 10000 });
    console.log(`[PdfToolHelper] Download page reached successfully.`);
  }

  /**
   * Waits for async task to complete and transition to the download page.
   */
  async waitForAsyncComplete(timeoutMs = 90_000): Promise<void> {
    console.log(`[PdfToolHelper] Waiting for async task completion and download page transition`);
    await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
    await expect(this.page.locator('h2:has-text("Task completed successfully!")')).toBeVisible({ timeout: 10000 });
    console.log(`[PdfToolHelper] Async task completed successfully.`);
  }

  /**
   * Triggers the real download on the download page and returns the downloaded Buffer & metadata.
   */
  async captureDownload(): Promise<DownloadResult> {
    console.log(`[PdfToolHelper] Capturing download...`);
    const downloadBtn = this.page.locator('button:has-text("Download File")');
    await downloadBtn.waitFor({ state: 'visible', timeout: 10000 });

    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 15000 }),
      downloadBtn.click(),
    ]);

    const suggestedFileName = download.suggestedFilename();
    const downloadPath = await download.path();

    if (!downloadPath) {
      throw new Error("Failed to save downloaded file to local path.");
    }

    const buffer = fs.readFileSync(downloadPath);
    console.log(`[PdfToolHelper] Download captured: ${suggestedFileName} (${buffer.length} bytes)`);

    return {
      buffer,
      fileName: suggestedFileName,
      suggestedFileName,
    };
  }

  async runSyncTool(filePath: string, customActionText?: string): Promise<DownloadResult> {
    await this.navigateToTool();
    await this.uploadFile(filePath);
    await this.clickAction(customActionText);
    await this.waitForSyncDownload();
    return await this.captureDownload();
  }

  async runAsyncTool(filePath: string, customActionText?: string): Promise<DownloadResult> {
    await this.navigateToTool();
    await this.uploadFile(filePath);
    await this.clickAction(customActionText);
    await this.waitForAsyncComplete();
    return await this.captureDownload();
  }
}
