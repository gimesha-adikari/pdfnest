import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { authenticateProUser } from '../helpers/auth';

const FIXTURE_PATH = path.resolve(__dirname, '../../../benchmarks/rendering/corpus/standard_a4_10p.pdf');

async function openAuthenticatedStudio(page: Page) {
  await authenticateProUser(page);
  await page.goto('/studio-v2');
  await expect(page.getByRole('heading', { name: 'Open a PDF in Studio' })).toBeVisible();
  const upload = page.waitForResponse(
    (response) => response.url().includes('/studio/v1/sessions/from-upload') && response.request().method() === 'POST',
  );
  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);
  const uploadResponse = await upload;
  expect(uploadResponse.status()).toBe(201);
  await expect(page.locator('header')).toBeVisible();
}

test.describe('Studio V2 F3 finalization', () => {
  test('redirects unauthenticated visitors before mounting Studio', async ({ page }) => {
    await page.goto('/studio-v2');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fstudio-v2/);
    await expect(page.getByText('Checking Studio access…')).not.toBeVisible();
  });

  test('keeps the inspector category-scoped and exposes one accessible search', async ({ page }) => {
    await openAuthenticatedStudio(page);

    const expectedSections: Record<string, string> = {
      pages: 'studio-inspector-section-document',
      organize: 'studio-inspector-section-page',
      edit: 'studio-inspector-section-text',
      annotate: 'studio-inspector-section-markup',
      layers: 'studio-inspector-section-layers',
    };
    for (const [category, section] of Object.entries(expectedSections)) {
      await page.getByTestId(`studio-category-${category}`).click();
      await expect(page.getByTestId(section)).toBeVisible();
      for (const [otherCategory, otherSection] of Object.entries(expectedSections)) {
        if (otherCategory !== category) {
          await expect(page.getByTestId(otherSection)).not.toBeVisible();
        }
      }
    }

    await expect(page.getByTestId('studio-header-search')).toBeVisible();
    await expect(page.getByPlaceholder('Type a command or search action...')).not.toBeVisible();
    await page.getByTestId('studio-header-search').click();
    await expect(page.getByPlaceholder('Type a command or search action...')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('studio-header-search')).toBeFocused();
  });

  test('uses shared leave/help dialogs and keeps failed session discard retryable', async ({ page }) => {
    await openAuthenticatedStudio(page);

    await page.getByTestId('studio-header-help').click();
    await expect(page.getByRole('dialog', { name: 'Studio Help' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Studio Help' }).click();

    await page.getByTestId('studio-settings').click();
    await expect(page.getByRole('dialog', { name: 'Open Settings?' })).toBeVisible();
    await page.getByRole('button', { name: 'Stay' }).click();
    await expect(page.getByRole('dialog', { name: 'Open Settings?' })).not.toBeVisible();

    let deleteAttempts = 0;
    await page.route('**/studio/v1/sessions/*', async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue();
        return;
      }
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'temporary failure' }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
      }
    });

    await page.getByTestId('studio-trash').click();
    const trashDialog = page.getByRole('dialog', { name: 'Discard this Studio session?' });
    await expect(trashDialog).toBeVisible();
    await trashDialog.getByRole('button', { name: 'Discard session' }).click();
    await expect(trashDialog).toBeVisible();
    await expect(page.getByText('temporary failure')).toBeVisible();

    await trashDialog.getByRole('button', { name: 'Discard session' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(deleteAttempts).toBe(2);
  });
});
