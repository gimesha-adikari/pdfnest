import { test, expect } from '@playwright/test';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

test.describe('Studio V2 Whole-Stack Real PDF E2E Validation', () => {
  test('executes whole-stack Studio V2 user journey with real PDF rendering, mutations, and undo/redo', async ({ page }) => {
    // 1. Authenticate user context with full session cookies across localhost:3000 and localhost:8080
    console.log('[E2E SETUP] Authenticating user session...');
    const authSession = await authenticateProUser(page);
    console.log(`[E2E SETUP] Authenticated as ${authSession.authMode} (User ID: ${authSession.userId})`);

    // 2. Initialize a real session through the Batch 0 product upload flow.
    const cookies = await page.context().cookies('http://localhost:8080');
    const authToken = cookies.find((c) => c.name === 'auth_token')?.value || '';
    await page.goto('/studio-v2');
    await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
    const sessionResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/studio/v1/sessions/from-upload') &&
        response.request().method() === 'POST',
      { timeout: 30_000 }
    );
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
    const sessionResp = await sessionResponsePromise;
    expect(sessionResp.status()).toBe(201);
    const sessionData = await sessionResp.json();
    const sessionId = sessionData.session.id;
    const initialVersionId = sessionData.active_version.id;
    const firstPageId = sessionData.vdm.pages[0].page_id;
    expect(sessionData.vdm.page_count).toBe(10);
    expect(sessionData.vdm.pages).toHaveLength(10);
    console.log(`[E2E SETUP] Created Studio V2 Session through UI upload: ${sessionId} (Ver: ${initialVersionId})`);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('request', (req) => {
      console.log(`[BROWSER REQ] ${req.method()} ${req.url()}`);
    });

    // Track tile network requests
    const tileRequests: { url: string; status: number; contentType: string }[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/tile')) {
        tileRequests.push({
          url,
          status: response.status(),
          contentType: response.headers()['content-type'] || '',
        });
      }
    });

    // -------------------------------------------------------------------------
    // STEP A: Open Studio V2 with Real Session
    // -------------------------------------------------------------------------
    console.log(`[E2E STEP A] Navigating to /studio-v2?session_id=${sessionId}`);
    await page.goto(`/studio-v2?session_id=${sessionId}`);
    await page.waitForLoadState('networkidle');

    // Verify Header Branding & File Metadata
    await expect(page.locator('header')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('PLATEN', { exact: true })).toBeVisible();
    await expect(page.getByText('PDF Studio', { exact: true })).toBeVisible();
    await expect(page.getByText('standard_a4_10p.pdf', { exact: false })).toBeVisible();

    // -------------------------------------------------------------------------
    // STEP B: Real Page Rendering & Tile Pipeline Verification
    // -------------------------------------------------------------------------
    console.log('[E2E STEP B] Verifying Real PDF Page Rendering on Canvas...');
    const canvasMain = page.locator('main');
    await expect(canvasMain).toBeVisible();

    // Verify rendered image elements in canvas
    const renderedImages = canvasMain.locator('img');
    await expect(renderedImages.first()).toBeVisible({ timeout: 15_000 });

    // Assert that the image has non-zero natural dimensions (real rendered graphic)
    const initialTileDimensions = await renderedImages.first().evaluate((img: HTMLImageElement) => {
      return { complete: img.complete, width: img.naturalWidth, height: img.naturalHeight };
    });
    expect(initialTileDimensions.complete).toBe(true);
    expect(initialTileDimensions.width).toBeGreaterThan(0);
    expect(initialTileDimensions.height).toBeGreaterThan(initialTileDimensions.width);

    // Verify tile network responses returned image/jpeg
    expect(tileRequests.length).toBeGreaterThan(0);
    const successfulTiles = tileRequests.filter((r) => r.status === 200 && r.contentType.includes('image/jpeg'));
    expect(successfulTiles.length).toBeGreaterThan(0);
    console.log(`[E2E STEP B] Successfully rendered ${successfulTiles.length} page tile(s) via real backend & worker!`);

    // -------------------------------------------------------------------------
    // STEP C: Page Selection & Navigation
    // -------------------------------------------------------------------------
    console.log('[E2E STEP C] Navigating & Selecting Page 2 on Canvas...');
    const pageImage2 = page.locator('main img[alt="Page 2"]').first();
    await expect(pageImage2).toBeVisible({ timeout: 5_000 });
    await pageImage2.click({ force: true });
    console.log('[E2E STEP C] Page 2 selected on Canvas!');

    // -------------------------------------------------------------------------
    // STEP D: Real Studio VDM Mutation (Rotate Page 1 by 90°)
    // -------------------------------------------------------------------------
    console.log('[E2E STEP D] Executing Real VDM Mutation: Rotate Page 1 by 90°...');
    const commandPayload = {
      base_version_id: initialVersionId,
      idempotency_key: 'op-rotate-p1-' + Date.now(),
      operation: 'rotate_page',
      parameters: { page_ids: [firstPageId], delta_degrees: 90 },
    };

    const opResp = await page.request.post(`${BACKEND_URL}/studio/v1/sessions/${sessionId}/commands`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `auth_token=${authToken}`,
      },
      data: commandPayload,
    });
    expect(opResp.ok()).toBe(true);
    const opData = await opResp.json();
    const rotatedVersionId = opData.version.id;
    expect(opData.vdm.page_count).toBe(10);
    expect(opData.vdm.pages[0].page_id).toBe(firstPageId);
    expect(opData.vdm.pages[0].rotation).toBe(90);
    expect(opData.vdm.pages.slice(1).every((page: { rotation: number }) => page.rotation === 0)).toBe(true);
    console.log(`[E2E STEP D] Created Mutation Version: ${rotatedVersionId} (Version #${opData.version.version_number})`);

    // Reload or refresh session in UI
    await page.goto(`/studio-v2?session_id=${sessionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify Version 1 badge in Header
    await expect(page.getByText('Version 1', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Status: Saved', { exact: false }).first()).toBeVisible();
    const rotatedPageImage = page.locator('main img[alt="Page 1"]').first();
    await expect(rotatedPageImage).toBeVisible({ timeout: 15_000 });
    const rotatedTileDimensions = await rotatedPageImage.evaluate((img: HTMLImageElement) => ({
      complete: img.complete,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }));
    expect(rotatedTileDimensions.complete).toBe(true);
    expect(rotatedTileDimensions.width).toBeGreaterThan(rotatedTileDimensions.height);

    // -------------------------------------------------------------------------
    // STEP E: Undo & Redo Workflow
    // -------------------------------------------------------------------------
    console.log('[E2E STEP E] Testing Undo & Redo Actions...');
    const undoButton = page.locator('button[aria-label="Undo"]');
    await expect(undoButton).toBeEnabled({ timeout: 5_000 });

    // Click Undo
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/undo') && resp.status() === 200,
        { timeout: 10_000 }
      ),
      undoButton.click(),
    ]);

    // Verify reverted to Version 0
    await expect(page.getByText('Version 0', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    console.log('[E2E STEP E] Undo successfully restored Version 0!');

    // Click Redo
    const redoButton = page.locator('button[aria-label="Redo"]');
    await expect(redoButton).toBeEnabled({ timeout: 5_000 });
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/redo') && resp.status() === 200,
        { timeout: 10_000 }
      ),
      redoButton.click(),
    ]);

    // Verify reapplied Version 1
    await expect(page.getByText('Version 1', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    console.log('[E2E STEP E] Redo successfully restored Version 1!');

    // -------------------------------------------------------------------------
    // STEP F: Verify Render for Rotated Version
    // -------------------------------------------------------------------------
    console.log('[E2E STEP F] Verifying Preview Tile Rendering for Rotated Version 1...');
    const rotatedTiles = tileRequests.filter(
      (r) => r.url.includes('/tile') && r.url.includes(rotatedVersionId) && r.status === 200
    );
    expect(rotatedTiles.length).toBeGreaterThan(0);
    console.log(`[E2E STEP F] Rotated Version 1 successfully rendered ${rotatedTiles.length} tile(s) over real preview pipeline!`);

    // Verify 0 critical console errors
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration') && !e.includes('AbortError')
    );
    expect(fatalErrors.length).toBe(0);
    console.log('[E2E STEP G] Whole-Stack E2E Test Completed with 100% Success!');
  });
});
