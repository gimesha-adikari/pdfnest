import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');
const STORAGE_DIR = '/tmp/platen_storage/assets';

test.describe('Studio V2 Whole-Stack Real PDF E2E Validation', () => {
  test('executes whole-stack Studio V2 user journey with real PDF rendering, mutations, and undo/redo', async ({ page }) => {
    // 1. Authenticate user context with full session cookies across localhost:3000 and localhost:8080
    console.log('[E2E SETUP] Authenticating user session...');
    const authSession = await authenticateProUser(page);
    console.log(`[E2E SETUP] Authenticated as ${authSession.authMode} (User ID: ${authSession.userId})`);

    // 2. Ensure real PDF fixture exists in storage directory for Go backend resolver
    if (!fs.existsSync(FIXTURE_PATH)) {
      throw new Error(`Real PDF fixture not found at: ${FIXTURE_PATH}`);
    }
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const targetAssetPath = path.join(STORAGE_DIR, 'standard_a4_10p.pdf');
    fs.copyFileSync(FIXTURE_PATH, targetAssetPath);

    const pdfStats = fs.statSync(FIXTURE_PATH);
    const assetId = 'asset-playwright-10p-' + Date.now();

    // 3. Initialize Real Session via Go Studio API
    const pages = [];
    for (let i = 1; i <= 10; i++) {
      pages.push({
        page_id: `p${i}`,
        source_asset_id: assetId,
        source_page_number: i,
        rotation: 0,
        is_blank: false,
        dimensions: { width: 595.28, height: 841.89 },
        overlays: [],
      });
    }

    const payload = {
      file_name: 'standard_a4_10p.pdf',
      file_size: pdfStats.size,
      initial_page_count: 10,
      source_asset_id: assetId,
      source_r2_key: 'assets/standard_a4_10p.pdf',
      initial_vdm: {
        page_count: 10,
        pages: pages,
      },
    };

    const cookies = await page.context().cookies('http://localhost:8080');
    const authToken = cookies.find((c) => c.name === 'auth_token')?.value || '';

    console.log('[E2E SETUP] Creating Studio session via backend API...');
    const sessionResp = await page.request.post(`${BACKEND_URL}/studio/v1/sessions`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `auth_token=${authToken}`,
      },
      data: payload,
    });

    expect(sessionResp.ok()).toBe(true);
    const sessionData = await sessionResp.json();
    const sessionId = sessionData.session.id;
    const documentId = sessionData.document.id;
    const initialVersionId = sessionData.active_version.id;
    console.log(`[E2E SETUP] Created Studio V2 Session: ${sessionId} (Doc: ${documentId}, Ver: ${initialVersionId})`);

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
    const isImageValid = await renderedImages.first().evaluate((img: HTMLImageElement) => {
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    });
    expect(isImageValid).toBe(true);

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
    const opPayload = {
      base_version_id: initialVersionId,
      idempotency_key: 'op-rotate-p1-' + Date.now(),
      operation_name: 'rotate_page',
      parameters: { page_id: 'p1', angle: 90 },
      target_page_ids: ['p1'],
      new_virtual_model: {
        document_id: documentId,
        page_count: 10,
        pages: [
          {
            page_id: 'p1',
            source_asset_id: assetId,
            source_page_number: 1,
            rotation: 90, // Rotated 90°
            is_blank: false,
            dimensions: { width: 595.28, height: 841.89 },
            overlays: [],
          },
          ...Array.from({ length: 9 }, (_, idx) => ({
            page_id: `p${idx + 2}`,
            source_asset_id: assetId,
            source_page_number: idx + 2,
            rotation: 0,
            is_blank: false,
            dimensions: { width: 595.28, height: 841.89 },
            overlays: [],
          })),
        ],
      },
      is_materialized: false,
    };

    const opResp = await page.request.post(`${BACKEND_URL}/studio/v1/sessions/${sessionId}/operations`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `auth_token=${authToken}`,
      },
      data: opPayload,
    });
    expect(opResp.ok()).toBe(true);
    const opData = await opResp.json();
    const rotatedVersionId = opData.version.id;
    console.log(`[E2E STEP D] Created Mutation Version: ${rotatedVersionId} (Version #${opData.version.version_number})`);

    // Reload or refresh session in UI
    await page.goto(`/studio-v2?session_id=${sessionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('header')).toBeVisible({ timeout: 15_000 });

    // Verify Version 1 badge in Header
    await expect(page.getByText('Version 1', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Status: Saved', { exact: false }).first()).toBeVisible();

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
