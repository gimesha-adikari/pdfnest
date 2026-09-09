import { test, expect } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('preserves every image selected on the landing page in the workspace', async ({ page }) => {
  await page.goto('/searchable-pdf-v2');

  const files = [1, 2, 3].map((pageNumber) => ({
    name: `searchable-handoff-${pageNumber}.png`,
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  }));

  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page).toHaveURL(/\/searchable-pdf-v2\/workspace$/);
  await expect(page.getByText(/3 pages will be submitted in exactly this order\./)).toBeVisible();
  await expect(page.getByRole('img', { name: /Preview of page \d+, searchable-handoff-/ })).toHaveCount(3);

  for (const file of files) {
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
  }
});
