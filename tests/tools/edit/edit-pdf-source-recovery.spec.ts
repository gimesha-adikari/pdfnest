import { test, expect } from '@playwright/test';
import { PdfToolHelper } from '../../helpers/pdf-tool';
import { FIXTURES } from '../../helpers/fixtures';

test.describe('Phase 10.3 — Self-Healing Missing R2 Source Recovery', () => {

  test('Self-healing recovery: re-uploads source and retries compile with NEW source_key while preserving edited pages state', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    // Wait for text input overlay
    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    // Modify text in active input: "beautiful" -> "Self-Healing Recovery Test Text"
    await textInput.focus();
    await textInput.fill('Self-Healing Recovery Test Text');
    await page.waitForTimeout(300);

    const editedVal = await textInput.inputValue();
    expect(editedVal).toBe('Self-Healing Recovery Test Text');

    // Intercept extract re-upload API
    await page.route('**/api/edit/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'mock_extract_recovery_job_1',
          status: 'queued',
        }),
      });
    });

    await page.route('**/api/edit/jobs/mock_extract_recovery_job_1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock_extract_recovery_job_1',
          status: 'succeeded',
          result: {
            source_tracker: 'new_refreshed_source_key_999',
            upright_tracker: 'new_upright_key_999',
            pages: [],
          },
        }),
      });
    });

    // Intercept compile request to simulate initial missing R2 key failure
    let compileAttemptCount = 0;
    let retrySourceKey = '';
    let retryPayloadEditedText = '';

    await page.route('**/api/edit/compile', async (route) => {
      compileAttemptCount++;
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');

      if (compileAttemptCount === 1) {
        // Return initial compile job that fails with missing R2 key
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job_id: 'mock_failed_compile_job_1',
            status: 'queued',
          }),
        });
      } else {
        retrySourceKey = postData.source_tracker || '';
        const pageElements = postData.pages?.[0]?.elements || [];
        retryPayloadEditedText = pageElements[0]?.text || '';

        // Fulfill successful retry compile job creation
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job_id: 'mock_retry_compile_job_123',
            status: 'queued',
          }),
        });
      }
    });

    // Mock job status polling for initial failed compile job
    await page.route('**/api/edit/jobs/mock_failed_compile_job_1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock_failed_compile_job_1',
          status: 'failed',
          error: 'failed to fetch file for billing estimate: stream r2 object to disk failed: The specified key does not exist.',
        }),
      });
    });

    // Mock job status polling for retry compile job
    await page.route('**/api/edit/jobs/mock_retry_compile_job_123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock_retry_compile_job_123',
          status: 'succeeded',
          result: { download_url: '/api/edit/jobs/mock_retry_compile_job_123/download' },
        }),
      });
    });

    // Mock download endpoint
    await page.route('**/api/edit/jobs/mock_retry_compile_job_123/download', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 Mock Downloaded PDF'),
      });
    });

    // Click Export button to trigger compile -> failure -> self-healing -> retry
    const exportBtn = page.locator('button:has-text("Export Precision Vector Document Changes")').first();
    await exportBtn.click();
    await page.waitForTimeout(3000);

    // Verify recovery happened: compile attempted twice
    expect(compileAttemptCount).toBeGreaterThanOrEqual(2);

    // Verify retry payload preserved current edited text state!
    expect(retryPayloadEditedText).toBe('Self-Healing Recovery Test Text');

    // Verify retry used NEW source_tracker
    expect(retrySourceKey).toBe('new_refreshed_source_key_999');
  });

  test('Negative test: ordinary server error does NOT trigger re-upload or retry loop', async ({ page }) => {
    const helper = new PdfToolHelper(page, 'edit-pdf');
    await helper.navigateToTool();
    await helper.uploadFile(FIXTURES.SAMPLE_PDF);

    const textInput = page.locator('input[type="text"]').first();
    await textInput.waitFor({ state: 'visible', timeout: 30000 });

    let compileAttemptCount = 0;
    await page.route('**/api/edit/compile', async (route) => {
      compileAttemptCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'mock_ordinary_failed_job',
          status: 'queued',
        }),
      });
    });

    await page.route('**/api/edit/jobs/mock_ordinary_failed_job', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock_ordinary_failed_job',
          status: 'failed',
          error: 'Internal Worker Memory Exception',
        }),
      });
    });

    const exportBtn = page.locator('button:has-text("Export Precision Vector Document Changes")').first();
    await exportBtn.click();
    await page.waitForTimeout(1500);

    // Verify NO retry loop occurred on ordinary server error
    expect(compileAttemptCount).toBe(1);
  });

});
