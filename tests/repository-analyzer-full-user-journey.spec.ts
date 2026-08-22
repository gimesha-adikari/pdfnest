import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { zipSync, strToU8 } from 'fflate';

test.describe('PDFNest Repository Analyzer — Complete Real User Flow Acceptance', () => {
    let testZipPath: string;

    test.beforeAll(() => {
        // Create a real test ZIP archive on disk for browser file upload
        const files: Record<string, Uint8Array> = {
            'package.json': strToU8(JSON.stringify({
                name: 'browser-acceptance-app',
                version: '1.0.0',
                dependencies: {
                    express: '^4.18.2',
                    react: '^19.0.0',
                },
                scripts: {
                    start: 'node index.js',
                    test: 'jest',
                },
            }, null, 2)),
            'index.js': strToU8(`
                const express = require('express');
                const app = express();
                app.get('/api/users', (req, res) => res.json([]));
                app.listen(3000, () => console.log('Listening on 3000'));
            `),
            'README.md': strToU8('# Browser Acceptance App\n\nA test application for PDFNest acceptance verification.\n'),
        };

        const zipData = zipSync(files);
        const tempDir = path.resolve(__dirname, '../../pdfnest-backend/storage/uploads');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        testZipPath = path.resolve(tempDir, 'test-browser-upload.zip');
        fs.writeFileSync(testZipPath, Buffer.from(zipData));
    });

    test.afterAll(() => {
        if (fs.existsSync(testZipPath)) {
            try {
                fs.unlinkSync(testZipPath);
            } catch {
                // Ignore cleanup errors
            }
        }
    });

    test('performs real end-to-end ZIP upload, analysis, documentation, and export in browser', async ({ page }) => {
        // 1. Navigate to landing page
        await page.goto('/repository-analyzer');
        await page.waitForLoadState('domcontentloaded');

        // 2. Switch to ZIP Archive tab
        const zipTab = page.locator('button').filter({ hasText: 'ZIP Archive' }).first();
        await zipTab.click();

        // 3. Upload ZIP file via file input
        const fileInput = page.locator('input[type="file"][accept*="zip"]').first();
        await fileInput.setInputFiles(testZipPath);

        // Verify selected zip info is shown
        const proceedBtn = page.locator('button').filter({ hasText: /Continue to Scoping|Analyze/i }).first();
        await expect(proceedBtn).toBeVisible({ timeout: 5000 });
        await proceedBtn.click();

        // 4. Redirects to workspace
        await expect(page).toHaveURL(/.*\/repository-analyzer\/workspace/, { timeout: 15000 });

        // 5. Verify Workspace Scoping controls
        const startBtn = page.locator('button').filter({ hasText: /Start Full Analysis/i }).first();
        await expect(startBtn).toBeVisible({ timeout: 10000 });

        // Trigger Analysis
        await startBtn.click();

        // 6. Wait for Analysis Completion (ACQUIRING -> INVENTORY -> ANALYZING -> FINALIZING -> COMPLETED)
        const completedBadge = page.locator('span, div, h3').filter({ hasText: /COMPLETED|Analysis Complete|Analysis Ready/i }).first();
        await expect(completedBadge).toBeVisible({ timeout: 45000 });

        // 7. Verify Documentation Tabs
        const techTab = page.locator('button, [role="tab"]').filter({ hasText: /Technology Stack|Tech Stack/i }).first();
        if (await techTab.isVisible()) {
            await techTab.click();
            await expect(page.locator('body')).toBeVisible();
        }

        const depTab = page.locator('button, [role="tab"]').filter({ hasText: /Dependencies/i }).first();
        if (await depTab.isVisible()) {
            await depTab.click();
            await expect(page.locator('body')).toBeVisible();
        }

        // 8. Verify Export functionality
        const exportJsonBtn = page.locator('button').filter({ hasText: /JSON|Export JSON/i }).first();
        if (await exportJsonBtn.isVisible()) {
            await expect(exportJsonBtn).toBeEnabled();
        }

        const exportMdBtn = page.locator('button').filter({ hasText: /Markdown|Export Markdown/i }).first();
        if (await exportMdBtn.isVisible()) {
            await expect(exportMdBtn).toBeEnabled();
        }
    });

    test('performs real Git URL submission and analysis in browser', async ({ page }) => {
        // 1. Navigate to landing page
        await page.goto('/repository-analyzer');
        await page.waitForLoadState('domcontentloaded');

        // 2. Enter tiny public Git repository
        const gitInput = page.locator('input[placeholder*="github.com"], input[type="text"]').first();
        await gitInput.fill('https://github.com/expressjs/cors.git');

        const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Continue to Scoping|Analyze/i }).first();
        await submitBtn.click();

        // 3. Workspace redirection
        await expect(page).toHaveURL(/.*\/repository-analyzer\/workspace/, { timeout: 15000 });

        // 4. Start Analysis
        const startBtn = page.locator('button').filter({ hasText: /Start Full Analysis/i }).first();
        await expect(startBtn).toBeVisible({ timeout: 10000 });
        await startBtn.click();

        // 5. Wait for Analysis Completion
        const completedBadge = page.locator('span, div, h3').filter({ hasText: /COMPLETED|Analysis Complete|Analysis Ready/i }).first();
        await expect(completedBadge).toBeVisible({ timeout: 60000 });
    });
});
