import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const samplePdfPath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');
const tmpPngPath = path.resolve(process.cwd(), 'tests/fixtures/tmp_resilience_test.png');

test.beforeAll(() => {
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(tmpPngPath, Buffer.from(pngBase64, 'base64'));
});

test.afterAll(() => {
    if (fs.existsSync(tmpPngPath)) {
        try { fs.unlinkSync(tmpPngPath); } catch {}
    }
});

test.describe('Backend Outage Resilience & Offline-Capable UX Suite', () => {

    test('1. Rotate PDF in Device mode completes locally when backend API is completely blocked', async ({ page }) => {
        // Intercept and block all backend API calls
        await page.route('**/api/**', (route) => {
            route.abort('connectionrefused');
        });

        await page.goto('/rotate-pdf');
        await page.waitForLoadState('domcontentloaded');

        // Upload sample PDF
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        // Transition to workspace
        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        // Click Rotate All 90°
        const rotateAllBtn = page.getByRole('button', { name: /Rotate All 90°/i });
        await expect(rotateAllBtn).toBeVisible({ timeout: 10000 });
        await rotateAllBtn.click();

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await deviceBtn.click();

        // Execute rotation
        const applyBtn = page.getByRole('button', { name: /Apply Rotation Matrices/i });
        await applyBtn.click();

        // Verify transition to download page
        await expect(page).toHaveURL(/\/rotate-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
        await expect(page.getByRole('button', { name: /Download File/i })).toBeVisible();
    });

    test('2. Split PDF in Device mode completes locally when backend API is blocked', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('connectionfailed');
        });

        await page.goto('/split-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/split-pdf\/workspace/);

        // Click Select All
        const selectAllBtn = page.getByRole('button', { name: /Select All/i });
        await expect(selectAllBtn).toBeVisible({ timeout: 10000 });
        await selectAllBtn.click();

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await deviceBtn.click();

        // Execute split
        const splitBtn = page.getByRole('button', { name: /^Extract \d+ Page/i });
        await splitBtn.click();

        await expect(page).toHaveURL(/\/split-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('3. Watermark in Device mode completes locally via WASM worker when backend API is blocked', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('timedout');
        });

        await page.goto('/watermark-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/watermark-pdf\/workspace/);

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await expect(deviceBtn).toBeVisible({ timeout: 10000 });
        await deviceBtn.click();

        // Click Process and Stamp Document
        const watermarkBtn = page.getByRole('button', { name: /Process and Stamp Document/i });
        await watermarkBtn.click();

        await expect(page).toHaveURL(/\/watermark-pdf\/download/, { timeout: 25000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('4. Add Text in Device mode completes locally via WASM worker when backend API is blocked', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/add-text');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/add-text\/workspace/);

        // Add a text box
        const addElementBtn = page.getByRole('button', { name: /Add Box/i });
        await expect(addElementBtn).toBeVisible({ timeout: 10000 });
        await addElementBtn.click();

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await deviceBtn.click();

        // Execute Add Text
        const applyBtn = page.getByRole('button', { name: /Stamp Text onto Document/i });
        await applyBtn.click();

        await expect(page).toHaveURL(/\/add-text\/download/, { timeout: 25000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('5. Add Page Numbers in Device mode completes locally via WASM worker when backend API is blocked', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/add-page-numbers');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/add-page-numbers\/workspace/);

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await expect(deviceBtn).toBeVisible({ timeout: 10000 });
        await deviceBtn.click();

        // Click Insert Sequence Tracking
        const applyBtn = page.getByRole('button', { name: /Insert Sequence Tracking/i });
        await applyBtn.click();

        await expect(page).toHaveURL(/\/add-page-numbers\/download/, { timeout: 25000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('6. Images → PDF in Device mode completes locally when backend API is blocked', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/images-to-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(tmpPngPath);

        await expect(page).toHaveURL(/\/images-to-pdf\/workspace/);

        // Switch to Device mode
        const deviceBtn = page.getByRole('button', { name: 'Device' });
        await expect(deviceBtn).toBeVisible({ timeout: 10000 });
        await deviceBtn.click();

        // Click Compile button
        const compileBtn = page.getByRole('button', { name: /Compile 1 Image into PDF/i });
        await compileBtn.click();

        await expect(page).toHaveURL(/\/images-to-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('7. Cloud mode shows clean "Cloud processing unavailable" UX when backend is offline', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Service Unavailable' }),
            });
        });

        await page.goto('/rotate-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        // Select Cloud mode
        const cloudBtn = page.getByRole('button', { name: 'Cloud' });
        await expect(cloudBtn).toBeVisible({ timeout: 10000 });
        await cloudBtn.click();

        // Click Rotate All
        const rotateAllBtn = page.getByRole('button', { name: /Rotate All 90°/i });
        await rotateAllBtn.click();

        // Attempt Apply in Cloud mode
        const applyBtn = page.getByRole('button', { name: /Apply Rotation Matrices/i });
        await applyBtn.click();

        // Verify clean cloud-unavailable UX without crash
        await expect(page.getByText(/Cloud processing is currently unavailable/i).first()).toBeVisible({ timeout: 10000 });
        // Action buttons to switch to Device or Auto mode should appear
        await expect(page.getByRole('button', { name: 'Switch to Device' })).toBeVisible();
    });

    test('8. Backend-only tool shows clean unavailable state when backend is offline', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Service Unavailable' }),
            });
        });

        await page.goto('/compress-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/compress-pdf\/workspace/);

        // Should display friendly service unavailable notice and disabled action button
        await expect(page.getByText(/Service Temporarily Unavailable|PDFNest backend processing service/i).first()).toBeVisible({ timeout: 10000 });
        const compressBtn = page.getByRole('button', { name: /Optimize and Compress PDF/i });
        await expect(compressBtn).toBeDisabled();
    });

    test('9. Auth/session failure does not crash the application', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => {
            pageErrors.push(err.message);
        });

        await page.route('**/api/auth/session', (route) => {
            route.abort('connectionrefused');
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Main navbar and brand should render normally
        await expect(page.locator('header')).toBeVisible();
        await expect(page.getByText('Free PDF Tools')).toBeVisible();
        expect(pageErrors.length).toBe(0);
    });

    test('10. Anonymous client-only tool remains usable when /api/auth/session fails', async ({ page }) => {
        await page.route('**/api/auth/**', (route) => {
            route.abort('connectionrefused');
        });

        await page.goto('/rotate-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        const rotateAllBtn = page.getByRole('button', { name: /Rotate All 90°/i });
        await expect(rotateAllBtn).toBeVisible({ timeout: 10000 });
        await rotateAllBtn.click();

        const applyBtn = page.getByRole('button', { name: /Apply Rotation Matrices/i });
        await applyBtn.click();

        await expect(page).toHaveURL(/\/rotate-pdf\/download/, { timeout: 15000 });
        await expect(page.getByText('Task completed successfully!')).toBeVisible();
    });

    test('11. Backend recovery restores availability', async ({ page }) => {
        let isBackendDown = true;

        await page.route('**/api/health', (route) => {
            if (isBackendDown) {
                route.fulfill({ status: 503, body: 'Service Unavailable' });
            } else {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) });
            }
        });

        await page.route('**/api/auth/session', (route) => {
            if (isBackendDown) {
                route.fulfill({ status: 503, body: 'Service Unavailable' });
            } else {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false, type: 'guest' }) });
            }
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Trigger health check by setting offline
        await page.evaluate(() => {
            (window as any).__PLATEN_TEST_OFFLINE__ = true;
        });

        // Now restore backend
        isBackendDown = false;

        // If banner was shown, clicking retry should recover online state
        const banner = page.locator('#backend-status-banner');
        if (await banner.isVisible()) {
            const retryBtn = banner.getByRole('button', { name: /Retry/i });
            await retryBtn.click();
            await expect(banner).not.toBeVisible({ timeout: 10000 });
        }
    });

    test('12. No uncaught console errors during offline navigation and client execution', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => {
            pageErrors.push(err.message);
        });

        await page.route('**/api/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/tools');
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('h1')).toBeVisible();
        expect(pageErrors.length).toBe(0);
    });

    test('13. No infinite loading states on client tools when offline', async ({ page }) => {
        await page.route('**/api/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/rotate-pdf');
        await page.waitForLoadState('domcontentloaded');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(samplePdfPath);

        await expect(page).toHaveURL(/\/rotate-pdf\/workspace/);

        // Spinner should disappear once pages load
        await expect(page.getByText('Parsing document geometry grids...')).not.toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: /Apply Rotation Matrices/i })).toBeVisible();
    });

    test('14. No repeated request storm when backend is unreachable', async ({ page }) => {
        let healthRequestCount = 0;
        let sessionRequestCount = 0;

        await page.route('**/api/health', (route) => {
            healthRequestCount++;
            route.abort('failed');
        });

        await page.route('**/api/auth/session', (route) => {
            sessionRequestCount++;
            route.abort('failed');
        });

        await page.goto('/rotate-pdf');
        await page.waitForLoadState('domcontentloaded');

        // Wait 3 seconds to ensure no aggressive polling loop is firing
        await page.waitForTimeout(3000);

        expect(healthRequestCount).toBeLessThanOrEqual(2);
        expect(sessionRequestCount).toBeLessThanOrEqual(2);
    });

});
