import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

import { authenticateProUser, getE2EApiBaseUrl, getE2EFrontendBaseUrl } from "../helpers/auth";

const evidenceDir = process.env.E2E_AUTH_EVIDENCE_DIR || path.resolve(process.cwd(), "../output/playwright/auth-browser-state");

test.describe.serial("local browser-visible authentication", () => {
  test("shared helper establishes the session used by both OCR workspaces", async ({ page }) => {
    const authResponses: Array<{ url: string; status: number }> = [];
    const consoleMessages: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/auth/session")) {
        authResponses.push({ url: response.url(), status: response.status() });
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleMessages.push(`${message.type()}:${message.text()}`);
      }
    });

    const session = await authenticateProUser(page);
    const cookiesBeforeNavigation = await page.context().cookies([getE2EFrontendBaseUrl(), getE2EApiBaseUrl()]);
    let cookiesAfterNavigation = cookiesBeforeNavigation;
    let browserSession: unknown = null;
    let browserResources: string[] = [];

    try {
      const browserSessionResponse = page.waitForResponse(
        (response) => response.url().endsWith("/api/auth/session"),
        { timeout: 10_000 }
      );
      await page.goto("/ocr-text-v2/workspace");
      await browserSessionResponse;
      browserSession = await page.evaluate(() => (window as Window & { __PLATEN_SESSION__?: unknown }).__PLATEN_SESSION__ ?? null);
      browserResources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("/api/") || name.includes("/auth/")));
      await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Choose PDF" })).toBeVisible();

      await page.goto("/searchable-pdf-v2/workspace");
      await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
      await expect(page.locator('input[type="file"]').first()).toBeAttached();
      await expect(page.getByRole("button", { name: "Choose images" })).toBeVisible();
    } finally {
      cookiesAfterNavigation = await page.context().cookies([getE2EFrontendBaseUrl(), getE2EApiBaseUrl()]);
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, "browser-auth-smoke.json"), `${JSON.stringify({
        browser_origin: getE2EFrontendBaseUrl(),
        helper_api_origin: getE2EApiBaseUrl(),
        session: { role: session.role, tier: session.tier, pro_entitlement: session.proEntitlement },
        browser_session: browserSession,
        auth_responses: authResponses,
        browser_auth_resources: browserResources,
        console_messages: consoleMessages,
        cookies_before_navigation: cookiesBeforeNavigation.map(({ name, domain, path: cookiePath, sameSite, secure, httpOnly, expires }) => ({ name, domain, path: cookiePath, sameSite, secure, httpOnly, expires })),
        cookies_after_navigation: cookiesAfterNavigation.map(({ name, domain, path: cookiePath, sameSite, secure, httpOnly, expires }) => ({ name, domain, path: cookiePath, sameSite, secure, httpOnly, expires })),
      }, null, 2)}\n`, "utf8");
    }
  });
});
