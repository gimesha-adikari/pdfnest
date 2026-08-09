import { Page } from '@playwright/test';

/**
 * Authenticates the Playwright browser context as a PRO / Admin user.
 * Sets the auth_token cookie on the browser context for domain 'localhost',
 * ensuring all API requests carry the PRO admin authentication token.
 */
export async function authenticateProUser(page: Page): Promise<void> {
  try {
    const response = await page.request.post('http://localhost:8080/api/auth/login', {
      data: {
        email: 'gimeshaadikari23@gmail.com',
        password: '1234',
      },
    });

    const setCookie = response.headers()['set-cookie'] || '';
    let token = '';
    const match = setCookie.match(/auth_token=([^;]+)/);
    if (match) {
      token = match[1];
    } else {
      const cookies = await page.context().cookies('http://localhost:8080');
      const found = cookies.find(c => c.name === 'auth_token');
      if (found) token = found.value;
    }

    if (token) {
      await page.context().addCookies([
        {
          name: 'auth_token',
          value: token,
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'auth_token',
          value: token,
          url: 'http://localhost:3000',
        },
        {
          name: 'auth_token',
          value: token,
          url: 'http://localhost:8080',
        },
      ]);
      console.log('[AUTH] Set auth_token cookie for domain localhost');
    } else {
      console.warn(`[AUTH] Login returned status ${response.status()} but no auth_token cookie found.`);
    }
  } catch (err) {
    console.error('[AUTH] Failed to authenticate PRO user:', err);
  }
}
