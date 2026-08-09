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

  // Diagnostic State Tracking
  public taskId: string | null = null;
  public lastKnownStatus: string | null = null;
  public lastProgress: number | null = null;
  public pollingAttempts = 0;
  public lastPollingEndpoint: string | null = null;
  public lastPollingHttpStatus: number | null = null;
  public count429Responses = 0;
  public first429Timestamp: string | null = null;
  public last429Timestamp: string | null = null;
  public retryAttemptCount = 0;
  public startTimeMs = Date.now();
  public lastApiError: string | null = null;
  public taskError: string | null = null;
  public browserConsoleErrors: string[] = [];
  public failedNetworkRequests: string[] = [];

  constructor(
    public page: Page,
    public toolId: string
  ) {
    // Console error logging
    this.page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('API Error')) {
        const text = msg.text();
        this.browserConsoleErrors.push(text);
        if (this.browserConsoleErrors.length > 20) this.browserConsoleErrors.shift();
      }
    });

    // Unhandled error logging
    this.page.on('pageerror', err => {
      this.browserConsoleErrors.push(`Unhandled: ${err.stack || err.message}`);
    });

    // Network failure tracking
    this.page.on('requestfailed', req => {
      const info = `${req.method()} ${req.url()} - ${req.failure()?.errorText || 'Unknown failure'}`;
      this.failedNetworkRequests.push(info);
      if (this.failedNetworkRequests.length > 20) this.failedNetworkRequests.shift();
    });

    // HTTP response monitoring for status polling, task creation, and rate limiting
    this.page.on('response', async res => {
      const url = res.url();
      const status = res.status();
      const nowStr = new Date().toISOString();

      if (status === 429) {
        this.count429Responses++;
        if (!this.first429Timestamp) this.first429Timestamp = nowStr;
        this.last429Timestamp = nowStr;
        console.warn(`[DIAGNOSTICS 429 DETECTED] HTTP 429 Too Many Requests on ${url}`);
      }

      if (status >= 400) {
        this.lastApiError = `${status} ${res.statusText()} on ${url}`;
      }

      // Intercept task status polling requests (/api/v1/tasks/:id)
      if (url.includes('/api/v1/tasks/')) {
        this.pollingAttempts++;
        this.lastPollingEndpoint = url;
        this.lastPollingHttpStatus = status;

        const urlParts = url.split('/api/v1/tasks/');
        if (urlParts[1]) {
          this.taskId = urlParts[1].split('?')[0];
        }

        if (res.ok()) {
          try {
            const data = await res.json();
            if (data && typeof data === 'object') {
              if (data.status) this.lastKnownStatus = data.status;
              if (typeof data.progress === 'number') this.lastProgress = data.progress;
              if (data.error) this.taskError = data.error;
            }
          } catch (_) {
            // Safe fallback if JSON parsing fails
          }
        }
      }

      // Intercept initial async task creation responses
      if ((url.includes('-async') || url.includes('/api/ocr/jobs')) && res.ok()) {
        try {
          const data = await res.json();
          if (data && data.taskId) {
            this.taskId = data.taskId;
          }
        } catch (_) {}
      }
    });
  }

  /**
   * Outputs comprehensive diagnostic debugging details when an async operation fails.
   */
  async printAsyncFailureDiagnostics(error: any, timeoutMs: number): Promise<void> {
    const currentUrl = this.page.url();
    const elapsedTimeMs = Date.now() - this.startTimeMs;
    const bodySnippet = await this.page.innerText('body').catch(() => 'N/A');
    const trackerText = await this.page.locator('.font-mono, [class*="progress"]').first().innerText().catch(() => 'N/A');

    console.error(`\n======================================================================`);
    console.error(`[E2E DIAGNOSTIC REPORT] Async Task Failure Detected!`);
    console.error(`----------------------------------------------------------------------`);
    console.error(`  Tool ID:                 ${this.toolId}`);
    console.error(`  Task ID:                 ${this.taskId || 'Not Captured'}`);
    console.error(`  Current URL:             ${currentUrl}`);
    console.error(`  Total Elapsed Time:      ${elapsedTimeMs}ms (Timeout limit: ${timeoutMs}ms)`);
    console.error(`  Last Known Task Status:  ${this.lastKnownStatus || 'Unknown'}`);
    console.error(`  Last Recorded Progress:  ${this.lastProgress !== null ? `${this.lastProgress}%` : 'N/A'}`);
    console.error(`  Polling Attempt Count:   ${this.pollingAttempts}`);
    console.error(`  Last Polling Endpoint:   ${this.lastPollingEndpoint || 'N/A'}`);
    console.error(`  Last Polling HTTP Status:${this.lastPollingHttpStatus ?? 'N/A'}`);
    console.error(`  HTTP 429 Responses:      ${this.count429Responses}`);
    console.error(`  First 429 Timestamp:     ${this.first429Timestamp || 'N/A'}`);
    console.error(`  Last 429 Timestamp:      ${this.last429Timestamp || 'N/A'}`);
    console.error(`  Retry Attempt Count:     ${this.retryAttemptCount}`);
    console.error(`  Last API Error:          ${this.lastApiError || 'None'}`);
    console.error(`  Task Error (Backend):    ${this.taskError || 'None'}`);
    console.error(`  UI Tracker Snippet:      ${trackerText.slice(0, 150)}`);
    console.error(`  Browser Console Errors (${this.browserConsoleErrors.length}):`);
    this.browserConsoleErrors.forEach(err => console.error(`    - ${err}`));
    console.error(`  Failed Network Requests (${this.failedNetworkRequests.length}):`);
    this.failedNetworkRequests.forEach(req => console.error(`    - ${req}`));
    console.error(`  Visible Page Text Snippet:\n${bodySnippet.slice(0, 400)}`);
    console.error(`======================================================================\n`);
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
   * Bounded retry: max 1 retry attempt to avoid indefinite loops on 429 or navigation delay.
   */
  async waitForSyncDownload(timeoutMs = 60_000): Promise<void> {
    console.log(`[PdfToolHelper] Waiting for transition to download page /${this.toolId}/download`);
    try {
      await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
    } catch (err) {
      if (this.retryAttemptCount < 1) {
        this.retryAttemptCount++;
        console.log(`[PdfToolHelper] Navigation timeout (attempt 1/1), checking for rate limit retry...`);
        await this.page.waitForTimeout(3000);
        const actionBtn = this.page.locator('main button.from-indigo-500, main button:has-text("Convert"), main button:has-text("Process")').first();
        if (await actionBtn.isVisible()) {
          console.log(`[PdfToolHelper] Retrying action click after backoff...`);
          await actionBtn.click();
          await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
        } else {
          await this.printAsyncFailureDiagnostics(err, timeoutMs);
          throw err;
        }
      } else {
        await this.printAsyncFailureDiagnostics(err, timeoutMs);
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
    console.log(`[PdfToolHelper] Waiting for async task completion and download page transition (tool: ${this.toolId}, timeout: ${timeoutMs}ms)`);
    try {
      await expect(this.page).toHaveURL(new RegExp(`/${this.toolId}/download`), { timeout: timeoutMs });
      await expect(this.page.locator('h2:has-text("Task completed successfully!")')).toBeVisible({ timeout: 10000 });
      console.log(`[PdfToolHelper] Async task completed successfully.`);
    } catch (err: any) {
      await this.printAsyncFailureDiagnostics(err, timeoutMs);
      throw err;
    }
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
