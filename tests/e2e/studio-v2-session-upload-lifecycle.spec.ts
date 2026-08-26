import { test, expect, BrowserContext, Page } from '@playwright/test';
import path from 'path';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf'
);

interface BrowserMonitoring {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
}

function monitorBrowser(page: Page): BrowserMonitoring {
  const monitoring: BrowserMonitoring = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: [],
  };
  page.on('pageerror', (error) => monitoring.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') monitoring.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    monitoring.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`)
  );
  page.on('response', (response) => {
    if (response.status() >= 500) {
      monitoring.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  return monitoring;
}

function expectNoFatalBrowserIssues(
  monitoring: BrowserMonitoring,
  expectedNotFoundConsoleErrors = 0
) {
  expect(monitoring.pageErrors).toEqual([]);
  const expected404s = monitoring.consoleErrors.filter(
    (message) => message === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
  );
  expect(expected404s).toHaveLength(expectedNotFoundConsoleErrors);
  expect(monitoring.consoleErrors).toHaveLength(expectedNotFoundConsoleErrors);
  expect(monitoring.failedRequests).toEqual([]);
  expect(monitoring.serverErrors).toEqual([]);
}

async function uploadFromStudioEntry(page: Page): Promise<{
  sessionId: string;
  response: any;
}> {
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/studio/v1/sessions/from-upload') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  const sessionId = payload.session.id as string;

  await expect(page).toHaveURL(new RegExp(`session_id=${sessionId}`));
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();
  await expect(page.locator('main img').first()).toBeVisible({ timeout: 30_000 });

  return { sessionId, response: payload };
}

async function closeContext(context: BrowserContext) {
  await context.close();
}

test.describe('Studio V2 source document and session lifecycle', () => {
  test('clean Studio entry does not load or create a session', async ({ page }) => {
    const monitoring = monitorBrowser(page);
    const studioSessionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/studio/v1/sessions')) {
        studioSessionRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto('/studio-v2');
    await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
    expect(page.url()).toMatch(/\/studio-v2\/?$/);
    expect(studioSessionRequests).toEqual([]);
    expectNoFatalBrowserIssues(monitoring);
  });

  test('a real PDF upload creates an authoritative source asset, VDM, Version 0, and tile previews', async ({ page }) => {
    const monitoring = monitorBrowser(page);
    const before = await page.request.get(`${BACKEND_URL}/studio/v1/metrics`);
    expect(before.ok()).toBe(true);
    const beforeMetrics = await before.json();

    const { sessionId, response } = await uploadFromStudioEntry(page);
    expect(response.document.initial_page_count).toBe(10);
    expect(response.active_version.version_number).toBe(0);
    expect(response.active_version.operation_type).toBe('initial_upload');
    expect(response.active_version.is_materialized).toBe(true);
    expect(response.session.active_version_id).toBe(response.active_version.id);
    expect(response.vdm.page_count).toBe(10);
    expect(response.vdm.pages).toHaveLength(10);

    const sourceAssetId = response.vdm.pages[0].source_asset_id;
    for (let index = 0; index < response.vdm.pages.length; index += 1) {
      const pageDescriptor = response.vdm.pages[index];
      expect(pageDescriptor.source_asset_id).toBe(sourceAssetId);
      expect(pageDescriptor.source_page_number).toBe(index + 1);
      expect(pageDescriptor.rotation).toBe(0);
      expect(pageDescriptor.is_blank).toBe(false);
      expect(pageDescriptor.dimensions.width).toBeGreaterThan(0);
      expect(pageDescriptor.dimensions.height).toBeGreaterThan(0);
    }

    await expect(page.locator('main img[alt="Page 1"]')).toBeVisible({ timeout: 30_000 });
    const isRealTile = await page.locator('main img[alt="Page 1"]').evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    );
    expect(isRealTile).toBe(true);

    const after = await page.request.get(`${BACKEND_URL}/studio/v1/metrics`);
    expect(after.ok()).toBe(true);
    const afterMetrics = await after.json();
    expect(afterMetrics.underlying_renders).toBeGreaterThan(beforeMetrics.underlying_renders);
    expect(afterMetrics.render_errors).toBe(0);
    expect(afterMetrics.worker_timeouts).toBe(0);
    expect(afterMetrics.worker_rejections).toBe(0);

    // Opening the generated URL uses the exact backend-owned session.
    const exactSession = await page.request.get(`${BACKEND_URL}/studio/v1/sessions/${sessionId}`);
    expect(exactSession.ok()).toBe(true);
    expectNoFatalBrowserIssues(monitoring);
  });

  test('two clean contexts create isolated sessions for the same source PDF', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const uploadPageA = await contextA.newPage();
      const uploadPageB = await contextB.newPage();
      const monitoringA = monitorBrowser(uploadPageA);
      const monitoringB = monitorBrowser(uploadPageB);
      const resultA = await uploadFromStudioEntry(uploadPageA);
      const resultB = await uploadFromStudioEntry(uploadPageB);
      expect(resultA.sessionId).not.toBe(resultB.sessionId);

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      const reopenedMonitoringA = monitorBrowser(pageA);
      const reopenedMonitoringB = monitorBrowser(pageB);
      await pageA.goto(`/studio-v2?session_id=${resultA.sessionId}`);
      await pageB.goto(`/studio-v2?session_id=${resultB.sessionId}`);
      await expect(pageA.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();
      await expect(pageB.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();
      expect(pageA.url()).toContain(`session_id=${resultA.sessionId}`);
      expect(pageB.url()).toContain(`session_id=${resultB.sessionId}`);
      expectNoFatalBrowserIssues(monitoringA);
      expectNoFatalBrowserIssues(monitoringB);
      expectNoFatalBrowserIssues(reopenedMonitoringA);
      expectNoFatalBrowserIssues(reopenedMonitoringB);
    } finally {
      await closeContext(contextA);
      await closeContext(contextB);
    }
  });

  test('a valid session ID loads that exact session', async ({ page, context }) => {
    const monitoring = monitorBrowser(page);
    const { sessionId } = await uploadFromStudioEntry(page);
    const reopened = await context.newPage();
    const reopenedMonitoring = monitorBrowser(reopened);
    const loadedSessionRequests: string[] = [];
    reopened.on('request', (request) => {
      if (request.url().includes('/studio/v1/sessions/')) loadedSessionRequests.push(request.url());
    });
    await reopened.goto(`/studio-v2?session_id=${sessionId}`);
    await expect(reopened.locator('header')).toBeVisible();
    await expect(reopened.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();
    expect(reopened.url()).toContain(`session_id=${sessionId}`);
    expect(loadedSessionRequests.some((url) => url.endsWith(`/sessions/${sessionId}`))).toBe(true);
    expectNoFatalBrowserIssues(monitoring);
    expectNoFatalBrowserIssues(reopenedMonitoring);
  });

  test('an invalid session ID gives recoverable not-found UI without creating a replacement', async ({ page }) => {
    const monitoring = monitorBrowser(page);
    const invalid = '11111111-1111-4111-8111-111111111111';
    const postRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/studio/v1/sessions') && request.method() === 'POST') {
        postRequests.push(request.url());
      }
    });

    await page.goto(`/studio-v2?session_id=${invalid}`);
    await expect(page.getByRole('heading', { name: 'Studio session not found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open another PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to Studio' })).toBeVisible();
    expect(page.url()).toContain(`session_id=${invalid}`);
    expect(postRequests).toEqual([]);
    // React development Strict Mode performs two GETs for this deliberate 404.
    // They are recorded here; any other browser failure remains fatal.
    expectNoFatalBrowserIssues(monitoring, 2);
  });
});
