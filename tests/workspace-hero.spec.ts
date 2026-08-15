import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PdfToolHero Workspace Integration Suite', () => {

  test('Mount /add-page-numbers/workspace and verify Hash icon renders without runtime errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');

    // 1. Navigate to tool landing page
    await page.goto('/add-page-numbers');
    await page.waitForLoadState('networkidle');

    // 2. Upload PDF file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(fixturePath);

    // 3. Should transition to /add-page-numbers/workspace
    await expect(page).toHaveURL(/\/add-page-numbers\/workspace/);

    // 4. Verify PdfToolHero renders with Hash icon
    await expect(page.locator('h1')).toContainText('Configure Page Numbers');
    await expect(page.getByText('Embed automatic sequential pagination elements')).toBeVisible();
    await expect(page.locator('.text-center svg.lucide-hash')).toBeVisible();

    // 5. Verify Workspace Controls & ProcessingModeSelector render
    await expect(page.getByText('Stylistic Typeface Profiles')).toBeVisible();
    await expect(page.getByText('Insert Sequence Tracking')).toBeVisible();
    await expect(page.getByText('Execution Venue')).toBeVisible();

    // 6. Verify 0 uncaught React runtime errors
    expect(pageErrors).toEqual([]);
  });

  test('Mount /sign-pdf/workspace and verify PenTool icon renders without runtime errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/sample.pdf');

    // 1. Navigate to tool landing page
    await page.goto('/sign-pdf');
    await page.waitForLoadState('networkidle');

    // 2. Upload PDF file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(fixturePath);

    // 3. Should transition to /sign-pdf/workspace
    await expect(page).toHaveURL(/\/sign-pdf\/workspace/);

    // 4. Verify PdfToolHero renders with PenTool icon
    await expect(page.locator('h1')).toContainText('e-Sign PDF Document');
    await expect(page.getByText('Place your signature on any page.')).toBeVisible();
    await expect(page.locator('.text-center svg.lucide-pen-tool')).toBeVisible();

    // 5. Verify 0 uncaught React runtime errors
    expect(pageErrors).toEqual([]);
  });

});
