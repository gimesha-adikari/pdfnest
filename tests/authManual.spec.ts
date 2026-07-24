import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Sign In' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill('gimeshaadikari23@gmail.com');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('1234');
    await page.getByRole('button', { name: 'Sign In' }).click();

    const modalContainer = page.locator('.fixed.inset-0.z-\\[100\\]');
    await expect(modalContainer).not.toBeVisible();

    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();

    await expect(page.getByText('Pro Workspace', { exact: true })).toBeVisible();

    await expect(page.getByText('PRO WORKSPACE ACTIVE')).toBeVisible();
    await expect(page.getByText('ALL PREMIUM WORKSPACES & ADVANCED TOOLS')).toBeVisible();

    await expect(page.getByRole('link', { name: /Admin Panel/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /PRO ACCOUNT/i })).toBeVisible();
});