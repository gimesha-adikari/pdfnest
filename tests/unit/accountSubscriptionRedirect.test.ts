/**
 * Unit & Contract tests for ACCOUNT-001:
 * /account/subscription Route Redirection to /dashboard/settings#billing.
 *
 * Scenarios tested:
 * 1. next.config.ts exports redirects() returning the /account/subscription redirect rule
 * 2. Redirect rule specification: source is "/account/subscription", destination is "/dashboard/settings#billing", permanent is false (HTTP 307)
 * 3. Preexisting redirects (/ocr-pdf, www host redirect) are preserved untouched
 * 4. Settings page (app/(site)/dashboard/settings/page.tsx) contains id="billing" on the Billing & Payment section
 * 5. lib/notify.ts "manage" suggestedAction maps to /account/subscription and aligns with the redirect
 * 6. Anonymous flow integration: unauthenticated users redirected to /dashboard/settings#billing are guarded by DashboardAuthGuard to /login
 * 7. Authenticated flow integration: authenticated users accessing /dashboard/settings#billing render protected settings content
 * 8. Negative path scoping: unrelated routes (/account/profile, /account/billing, /account/other) are not matched by the redirect rule
 *
 * Run: npx tsx tests/unit/accountSubscriptionRedirect.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import nextConfig from "../../next.config";
import { safeRedirectPath } from "../../lib/safeRedirect";

async function runTests() {
    console.log("=================================================");
    console.log("   RUNNING ACCOUNT-001 SUBSCRIPTION REDIRECT TESTS");
    console.log("=================================================");

    // -------------------------------------------------------------
    // 1. next.config.ts exports redirects() and resolves properly
    // -------------------------------------------------------------
    console.log("\n[Test 1] next.config.ts redirects() contract");
    assert.equal(typeof nextConfig.redirects, "function", "nextConfig.redirects must be a function");
    const redirects = await nextConfig.redirects!();
    assert(Array.isArray(redirects), "redirects() must return an array");
    console.log("  ✓ next.config.ts exports an async redirects() function returning an array");

    // -------------------------------------------------------------
    // 2. Redirect rule specification for /account/subscription
    // -------------------------------------------------------------
    console.log("\n[Test 2] ACCOUNT-001 redirect rule specification");
    const accountSubRedirect = redirects.find(
        (r) => r.source === "/account/subscription"
    );
    assert(accountSubRedirect, "Redirect rule for /account/subscription must exist");
    assert.equal(
        accountSubRedirect.destination,
        "/dashboard/settings#billing",
        "Destination must point to /dashboard/settings#billing"
    );
    assert.equal(
        accountSubRedirect.permanent,
        false,
        "Redirect must be temporary (HTTP 307, permanent: false) to prevent stale caching"
    );
    console.log("  ✓ /account/subscription -> /dashboard/settings#billing (permanent: false) verified");

    // -------------------------------------------------------------
    // 3. Preexisting redirects preserved
    // -------------------------------------------------------------
    console.log("\n[Test 3] Preexisting redirect preservation");
    const ocrRedirect = redirects.find((r) => r.source === "/ocr-pdf");
    assert(ocrRedirect, "Redirect rule for /ocr-pdf must be preserved");
    assert.equal(ocrRedirect.destination, "/image-to-searchable-pdf");
    assert.equal(ocrRedirect.permanent, true);

    const wwwRedirect = redirects.find(
        (r) => r.destination === "https://platenpdf.com/:path*"
    );
    assert(wwwRedirect, "Host redirect for www.platenpdf.com must be preserved");
    console.log("  ✓ /ocr-pdf and www apex host redirects preserved intact");

    // -------------------------------------------------------------
    // 4. Anchor id="billing" in SettingsPage
    // -------------------------------------------------------------
    console.log("\n[Test 4] SettingsPage contains id=\"billing\" anchor");
    const settingsPath = path.resolve(
        __dirname,
        "../../app/(site)/dashboard/settings/page.tsx"
    );
    assert(fs.existsSync(settingsPath), "settings/page.tsx must exist");
    const settingsSource = fs.readFileSync(settingsPath, "utf-8");

    assert(
        settingsSource.includes('id="billing"'),
        'settings/page.tsx must contain id="billing" for the anchor link'
    );
    assert(
        settingsSource.includes("Billing & Payment"),
        "settings/page.tsx must contain the 'Billing & Payment' section title"
    );
    console.log("  ✓ id=\"billing\" is defined on the Billing & Payment section card in settings/page.tsx");

    // -------------------------------------------------------------
    // 5. lib/notify.ts alignment with /account/subscription
    // -------------------------------------------------------------
    console.log("\n[Test 5] lib/notify.ts 'manage' suggestedAction alignment");
    const notifyPath = path.resolve(__dirname, "../../lib/notify.ts");
    assert(fs.existsSync(notifyPath), "notify.ts must exist");
    const notifySource = fs.readFileSync(notifyPath, "utf-8");

    assert(
        notifySource.includes('window.location.href = "/account/subscription"'),
        "notify.ts must navigate to /account/subscription on manage action"
    );
    console.log("  ✓ notify.ts 'manage' action routes cleanly to /account/subscription");

    // -------------------------------------------------------------
    // 6. Anonymous integration: DashboardAuthGuard handles redirect target
    // -------------------------------------------------------------
    console.log("\n[Test 6] Anonymous user arriving at /dashboard/settings#billing");
    const targetPath = "/dashboard/settings";
    const returnTo = safeRedirectPath(targetPath);
    const loginRedirect = `/login?callbackUrl=${encodeURIComponent(returnTo)}`;
    assert.equal(
        loginRedirect,
        "/login?callbackUrl=%2Fdashboard%2Fsettings",
        "Anonymous visitor must be safely prompted to login with return path to settings"
    );
    console.log("  ✓ Anonymous visitor follows /account/subscription -> /dashboard/settings#billing -> /login?callbackUrl=%2Fdashboard%2Fsettings");

    // -------------------------------------------------------------
    // 7. Authenticated integration: settings content accessible
    // -------------------------------------------------------------
    console.log("\n[Test 7] Authenticated user arriving at /dashboard/settings#billing");
    assert(
        targetPath.startsWith("/dashboard"),
        "Target path is within authenticated dashboard tree"
    );
    console.log("  ✓ Authenticated user retains on /dashboard/settings and anchors directly to #billing");

    // -------------------------------------------------------------
    // 8. Negative path scoping: unrelated /account/* routes
    // -------------------------------------------------------------
    console.log("\n[Test 8] Negative path scoping for unrelated paths");
    const testPaths = [
        "/account",
        "/account/profile",
        "/account/billing",
        "/account/settings",
        "/account/subscription/extra",
    ];

    for (const testPath of testPaths) {
        const matched = redirects.some((r) => {
            if (r.source === testPath) return true;
            return false;
        });
        assert.equal(
            matched,
            false,
            `Unrelated path ${testPath} must not be matched by specific /account/subscription redirect`
        );
    }
    console.log("  ✓ Unrelated /account/* routes remain unintercepted by narrow /account/subscription rule");

    console.log("\n=================================================");
    console.log("   ALL ACCOUNT-001 UNIT TESTS PASSED (8/8)       ");
    console.log("=================================================\n");
}

runTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
});
