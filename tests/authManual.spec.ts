import { test, expect } from '@playwright/test';

test('manual UI authentication flow', async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    test.skip(!email || !password, 'Skipped: E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables not provided');

    await page.goto('/');

    await page.getByRole('link', { name: 'Sign In' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(email!);
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    const modalContainer = page.locator('.fixed.inset-0.z-\\[100\\]');
    await expect(modalContainer).not.toBeVisible();

    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();
    await expect(page.getByText('Pro Workspace', { exact: true })).toBeVisible();
});