import { expect, test, type Page, type Route } from "@playwright/test";

const normalPolicy = {
  mode: "normal",
  processing_unit_limits_enforced: true,
  purchases_enabled: true,
};

const freePolicy = {
  mode: "free",
  processing_unit_limits_enforced: false,
  purchases_enabled: false,
};

function guestSession(billingPolicy: typeof normalPolicy | typeof freePolicy) {
  return {
    authenticated: true,
    type: "guest",
    guest: { id: "e2e-guest", trust: 1 },
    billing_policy: billingPolicy,
  };
}

function userSession(
  billingPolicy: typeof normalPolicy | typeof freePolicy,
  tier: "free" | "pro" = "free",
) {
  return {
    authenticated: true,
    type: "user",
    user: { id: "e2e-user", email: "billing@example.test", role: "user", google_id: "" },
    subscription: {
      role: "user",
      tier,
      status: tier === "pro" ? "active" : "free",
      billing_interval: tier === "pro" ? "yearly" : "monthly",
      current_period_end: "2030-01-01T00:00:00Z",
      custom_credits: 120,
      used_units_3h: 3,
      used_units_daily: 5,
      used_units_monthly: 8,
      update_url: "https://billing.example.test/update",
      cancel_url: "https://billing.example.test/cancel",
    },
    billing_policy: billingPolicy,
  };
}

async function mockSession(page: Page, session: ReturnType<typeof guestSession> | ReturnType<typeof userSession>) {
  await page.route("**/auth/session", (route: Route) => route.fulfill({ json: session }));
  await page.route("**/site-content/subscribe", (route: Route) => route.fulfill({ json: {} }));
  await page.route("**/tools", async (route: Route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    return route.continue();
  });
}

test.describe("GIM-10 free-mode billing presentation", () => {
  test("free guest Home copy reflects policy without quota or upgrade prompts", async ({ page }) => {
    await mockSession(page, guestSession(freePolicy));
    await page.goto("/");
    await expect(page.getByText(/cloud processing is currently free for everyone/i).first()).toBeVisible();
    await expect(page.getByText(/20 processing units per day|400 processing units per day/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /upgrade/i })).toHaveCount(0);
  });

  test("free guest sees current access and cannot start subscription checkout", async ({ page }) => {
    await mockSession(page, guestSession(freePolicy));
    let checkoutRequests = 0;
    await page.route("**/billing/checkout", async (route) => {
      checkoutRequests += 1;
      await route.fulfill({ status: 403, json: { code: "PURCHASES_DISABLED", message: "disabled" } });
    });

    await page.goto("/subscribe");
    await expect(page.getByRole("status").filter({ hasText: /processing is currently free/i }).first()).toBeVisible();

    const monthly = page.getByRole("button", { name: /monthly/i }).first();
    await expect(monthly).toBeDisabled();
    await expect(page.getByText(/20 processing units per day/i)).toHaveCount(0);
    await expect(page.getByText(/7-day free trial/i)).toHaveCount(0);
    await monthly.click({ force: true });
    expect(checkoutRequests).toBe(0);
  });

  test("unknown policy keeps checkout unavailable until session policy is known", async ({ page }) => {
    await page.route("**/auth/session", (route) => route.fulfill({
      json: {
        authenticated: true,
        type: "guest",
        guest: { id: "e2e-guest-unknown", trust: 1 },
      },
    }));
    await page.route("**/site-content/subscribe", (route) => route.fulfill({ json: {} }));
    let checkoutRequests = 0;
    await page.route("**/billing/checkout", async (route) => {
      checkoutRequests += 1;
      await route.fulfill({ status: 403, json: { code: "PURCHASES_DISABLED", message: "disabled" } });
    });

    await page.goto("/subscribe");
    await expect(page.getByRole("status").filter({ hasText: /purchase availability is currently unknown/i }).first()).toBeVisible();
    const monthly = page.getByRole("button", { name: /monthly/i }).first();
    await expect(monthly).toBeDisabled();
    await monthly.click({ force: true });
    expect(checkoutRequests).toBe(0);
  });

  test("normal authenticated account retains an actionable subscription purchase path", async ({ page }) => {
    await mockSession(page, userSession(normalPolicy));
    let checkoutRequests = 0;
    await page.route("**/billing/checkout", async (route) => {
      checkoutRequests += 1;
      await route.fulfill({ status: 502, json: { code: "PADDLE_TEST_UNAVAILABLE", message: "test boundary" } });
    });

    await page.goto("/subscribe");
    const monthly = page.getByRole("button", { name: /monthly/i }).first();
    await expect(monthly).toBeEnabled();
    await monthly.click();
    await expect.poll(() => checkoutRequests).toBe(1);
  });

  test("PURCHASES_DISABLED refreshes normal policy to free without a page reload", async ({ page }) => {
    let sessionRequests = 0;
    let policySwitched = false;
    await page.route("**/auth/session", (route) => {
      sessionRequests += 1;
      return route.fulfill({ json: userSession(policySwitched ? freePolicy : normalPolicy) });
    });
    await page.route("**/site-content/subscribe", (route) => route.fulfill({ json: {} }));

    let checkoutRequests = 0;
    await page.route("**/billing/checkout", async (route) => {
      checkoutRequests += 1;
      policySwitched = true;
      await route.fulfill({
        status: 403,
        json: {
          code: "PURCHASES_DISABLED",
          message: "New purchases are currently unavailable while processing is free.",
        },
      });
    });

    let documentNavigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) documentNavigations += 1;
    });

    await page.goto("/subscribe");
    await expect(page.getByRole("button", { name: /monthly/i }).first()).toBeEnabled();
    const initialDocumentNavigations = documentNavigations;

    await page.getByRole("button", { name: /monthly/i }).first().click();

    await expect.poll(() => sessionRequests).toBeGreaterThan(1);
    await expect(page.getByRole("status").filter({ hasText: /processing is currently free/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /monthly/i }).first()).toBeDisabled();
    expect(checkoutRequests).toBe(1);
    expect(documentNavigations).toBe(initialDocumentNavigations);
  });

  test("normal authenticated dashboard keeps credit-pack checkout available", async ({ page }) => {
    await mockSession(page, userSession(normalPolicy));
    await page.route("**/billing/transactions", (route) => route.fulfill({ json: [] }));
    await page.route("**/studio-v2/sessions**", (route) => route.fulfill({ json: { sessions: [], total: 0 } }));

    let creditCheckoutRequests = 0;
    await page.route("**/billing/checkout-credits", async (route) => {
      creditCheckoutRequests += 1;
      await route.fulfill({
        status: 502,
        json: { code: "PADDLE_TEST_UNAVAILABLE", message: "test boundary" },
      });
    });

    await page.goto("/dashboard");
    const creditPack = page.getByRole("button", { name: /10 credits pack/i });
    await expect(creditPack).toBeEnabled();
    await creditPack.click();
    await expect.poll(() => creditCheckoutRequests).toBe(1);
  });

  test("free-mode dashboard preserves stored credits without offering top-ups", async ({ page }) => {
    await mockSession(page, userSession(freePolicy, "pro"));
    await page.route("**/billing/transactions", (route) => route.fulfill({ json: [] }));
    await page.route("**/studio-v2/sessions**", (route) => route.fulfill({ json: { sessions: [], total: 0 } }));

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /pro tier/i })).toBeVisible();
    await expect(page.getByText("120", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /credits pack/i })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /no purchase is needed/i })).toBeVisible();
  });

  test("free-mode Pro member retains subscription management controls and stored tier", async ({ page }) => {
    await mockSession(page, userSession(freePolicy, "pro"));
    await page.route("**/user/settings/preferences", (route) => route.fulfill({
      json: {
        email_notifications: true,
        product_updates: true,
        billing_emails: true,
        security_alerts: true,
        theme: "system",
        language: "en",
      },
    }));

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: /billing & payment/i })).toBeVisible();
    await expect(page.locator('input[value="pro"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /update payment method/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /view billing portal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /manage subscription/i })).toBeVisible();
    await expect(page.getByText(/processing is currently free for everyone/i).first()).toBeVisible();
  });
});
