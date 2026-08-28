import { Page } from '@playwright/test';

export interface AuthSessionDetails {
  userId: string;
  role: string;
  tier: string;
  status: string;
  proEntitlement: boolean;
  authMode: 'PRO SUBSCRIBER' | 'ADMIN ELEVATED ACCESS' | 'STANDARD USER';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getE2EFrontendBaseUrl(): string {
  return trimTrailingSlash(process.env.E2E_BASE_URL || 'http://localhost:3000');
}

export function getE2EApiBaseUrl(): string {
  const configured = trimTrailingSlash(
    process.env.E2E_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'
  );
  return configured.endsWith('/api') ? configured : `${configured}/api`;
}

/**
 * Authenticates the Playwright browser context using dedicated E2E test credentials.
 *
 * Hierarchy:
 * 1. Shell / CI environment: E2E_TEST_EMAIL & E2E_TEST_PASSWORD
 * 2. Dedicated git-ignored file: pdfnest/.env.test.local
 * 3. Pre-minted auth token: E2E_AUTH_TOKEN
 *
 * NO backend environment variables (ADMIN_EMAIL/ADMIN_PASSWORD) are loaded.
 * NO credential literals or fallbacks exist in source code.
 */
export async function authenticateProUser(page: Page): Promise<AuthSessionDetails> {
  let token = process.env.E2E_AUTH_TOKEN || '';

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!token && (!email || !password)) {
    throw new Error(
      '[AUTH FATAL] Dedicated E2E credentials missing. ' +
      'Please configure E2E_TEST_EMAIL and E2E_TEST_PASSWORD in shell/CI or git-ignored pdfnest/.env.test.local file.'
    );
  }

  if (!token && email && password) {
    const apiBaseUrl = getE2EApiBaseUrl();
    const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
      data: { email, password },
    });

    if (!response.ok()) {
      throw new Error(`[AUTH FATAL] Login endpoint returned HTTP ${response.status()} ${response.statusText()}`);
    }

    const setCookie = response.headers()['set-cookie'] || '';
    const match = setCookie.match(/auth_token=([^;]+)/);
    if (match) {
      token = match[1];
    } else {
      const cookies = await page.context().cookies(getE2EApiBaseUrl());
      const found = cookies.find(c => c.name === 'auth_token');
      if (found) token = found.value;
    }
  }

  if (!token) {
    throw new Error('[AUTH FATAL] Could not obtain valid auth_token cookie from login endpoint.');
  }

  // Set auth_token cookie on browser context across origin domains
  const frontendBaseUrl = getE2EFrontendBaseUrl();
  const apiBaseUrl = getE2EApiBaseUrl();
  await page.context().addCookies([
    { name: 'auth_token', value: token, url: frontendBaseUrl },
    { name: 'auth_token', value: token, url: new URL(apiBaseUrl).origin },
  ]);

  // Full Authentication & Entitlement Chain Verification
  const sessionRes = await page.request.get(`${apiBaseUrl}/auth/session`);
  if (!sessionRes.ok()) {
    throw new Error(`[AUTH FATAL] Session verification endpoint returned HTTP ${sessionRes.status()}`);
  }

  const sessionData = await sessionRes.json().catch(() => null);
  if (!sessionData || !sessionData.authenticated || sessionData.type !== 'user' || !sessionData.user?.id) {
    throw new Error(`[AUTH FATAL] Session verification failed: identity did not resolve to a real database user.`);
  }

  const role = sessionData.user.role || 'user';
  const tier = sessionData.subscription?.tier || 'free';
  const status = sessionData.subscription?.status || 'active';
  const proEntitlement = role === 'admin' || tier === 'pro' || tier === 'plus' || tier === 'unlimited';

  let authMode: AuthSessionDetails['authMode'] = 'STANDARD USER';
  if (role === 'admin') {
    authMode = 'ADMIN ELEVATED ACCESS';
  } else if (tier === 'pro' || tier === 'plus' || tier === 'unlimited') {
    authMode = 'PRO SUBSCRIBER';
  }

  const details: AuthSessionDetails = {
    userId: sessionData.user.id,
    role,
    tier,
    status,
    proEntitlement,
    authMode,
  };

  console.log(`[AUTH SUCCESS] AUTHENTICATION MODE: ${details.authMode}`);
  console.log(`[AUTH DETAILS] User ID: ${details.userId} | Role: ${details.role} | Tier: ${details.tier} | Status: ${details.status} | Pro Entitlement: ${details.proEntitlement}`);

  return details;
}
