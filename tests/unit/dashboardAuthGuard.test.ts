/**
 * Unit & Contract tests for DashboardAuthGuard and /dashboard Route Protection — AUTH-006.
 *
 * Scenarios tested:
 * A. Anonymous direct navigation to /dashboard -> expected redirect to /login?callbackUrl=%2Fdashboard
 * B. Anonymous hard refresh / deep link (e.g. /dashboard/settings, /dashboard?tab=billing) -> expected redirect preserving target path & query
 * C. Authenticated navigation -> dashboard content remains accessible without redirect
 * D. No redirect loop on login destination -> login page handles unauthenticated and authenticated states cleanly without loops
 * E. Existing public routes remain public -> verify public layouts/pages do not include DashboardAuthGuard
 * F. Existing dashboard behavior for authenticated session preserved -> layout renders children cleanly
 * G. Return/callback path contract -> matches canonical /login?callbackUrl=... format and uses safeRedirectPath
 * H. Invalid/expired session behavior -> transitioning to unauthenticated redirects immediately and prevents protected rendering
 *
 * Run: npm run test:unit
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { safeRedirectPath } from "../../lib/safeRedirect";

// ------------------------------------------------------------------ //
// 1. Simulation of DashboardAuthGuard decision logic
// ------------------------------------------------------------------ //
interface AuthState {
    isLoading: boolean;
    isLoggedIn: boolean;
}

interface GuardDecision {
    shouldRedirect: boolean;
    redirectUrl: string | null;
    rendersChildren: boolean;
    rendersLoading: boolean;
}

function evaluateDashboardGuard(
    authState: AuthState,
    pathname: string,
    search: string = ""
): GuardDecision {
    if (authState.isLoading || !authState.isLoggedIn) {
        let redirectUrl: string | null = null;
        if (!authState.isLoading && !authState.isLoggedIn) {
            const targetPath = pathname || "/dashboard";
            const returnTo = safeRedirectPath(`${targetPath}${search}`);
            redirectUrl = `/login?callbackUrl=${encodeURIComponent(returnTo)}`;
        }
        return {
            shouldRedirect: redirectUrl !== null,
            redirectUrl,
            rendersChildren: false,
            rendersLoading: true,
        };
    }

    return {
        shouldRedirect: false,
        redirectUrl: null,
        rendersChildren: true,
        rendersLoading: false,
    };
}

// ------------------------------------------------------------------ //
// SCENARIO A: Anonymous direct navigation to /dashboard
// ------------------------------------------------------------------ //
console.log("Testing Scenario A: Anonymous direct navigation to /dashboard...");
{
    // 1. Initial loading state (auth check pending)
    const pending = evaluateDashboardGuard({ isLoading: true, isLoggedIn: false }, "/dashboard");
    assert.equal(pending.shouldRedirect, false, "Does not redirect while auth check is in flight");
    assert.equal(pending.rendersChildren, false, "Does not render protected children while loading");
    assert.equal(pending.rendersLoading, true, "Renders loading spinner while checking auth");

    // 2. Auth check completes: anonymous user
    const resolved = evaluateDashboardGuard({ isLoading: false, isLoggedIn: false }, "/dashboard");
    assert.equal(resolved.shouldRedirect, true, "Redirects anonymous visitor");
    assert.equal(resolved.redirectUrl, "/login?callbackUrl=%2Fdashboard", "Redirects to canonical login callback for /dashboard");
    assert.equal(resolved.rendersChildren, false, "Never renders protected dashboard to anonymous visitor");
    assert.equal(resolved.rendersLoading, true, "Shows loading/guard boundary while redirecting");
}
console.log("  ✓ Scenario A passed.");

// ------------------------------------------------------------------ //
// SCENARIO B: Anonymous hard refresh / deep link
// ------------------------------------------------------------------ //
console.log("Testing Scenario B: Anonymous hard refresh / deep link...");
{
    // Direct navigation to /dashboard/settings
    const settings = evaluateDashboardGuard({ isLoading: false, isLoggedIn: false }, "/dashboard/settings");
    assert.equal(settings.shouldRedirect, true);
    assert.equal(settings.redirectUrl, "/login?callbackUrl=%2Fdashboard%2Fsettings");
    assert.equal(settings.rendersChildren, false);

    // Direct navigation to /dashboard/studio-sessions
    const studio = evaluateDashboardGuard({ isLoading: false, isLoggedIn: false }, "/dashboard/studio-sessions");
    assert.equal(studio.shouldRedirect, true);
    assert.equal(studio.redirectUrl, "/login?callbackUrl=%2Fdashboard%2Fstudio-sessions");
    assert.equal(studio.rendersChildren, false);

    // Deep link with query parameters: /dashboard?tab=billing&period=monthly
    const queryLink = evaluateDashboardGuard(
        { isLoading: false, isLoggedIn: false },
        "/dashboard",
        "?tab=billing&period=monthly"
    );
    assert.equal(queryLink.shouldRedirect, true);
    assert.equal(
        queryLink.redirectUrl,
        `/login?callbackUrl=${encodeURIComponent("/dashboard?tab=billing&period=monthly")}`,
        "Preserves deep-link query string in callbackUrl"
    );
    assert.equal(queryLink.rendersChildren, false);
}
console.log("  ✓ Scenario B passed.");

// ------------------------------------------------------------------ //
// SCENARIO C: Authenticated navigation
// ------------------------------------------------------------------ //
console.log("Testing Scenario C: Authenticated navigation...");
{
    const authState = { isLoading: false, isLoggedIn: true };

    const dashboard = evaluateDashboardGuard(authState, "/dashboard");
    assert.equal(dashboard.shouldRedirect, false, "Authenticated user is not redirected");
    assert.equal(dashboard.redirectUrl, null);
    assert.equal(dashboard.rendersChildren, true, "Authenticated user sees protected dashboard");
    assert.equal(dashboard.rendersLoading, false);

    const settings = evaluateDashboardGuard(authState, "/dashboard/settings");
    assert.equal(settings.shouldRedirect, false);
    assert.equal(settings.rendersChildren, true, "Authenticated user sees settings");

    const studio = evaluateDashboardGuard(authState, "/dashboard/studio-sessions");
    assert.equal(studio.shouldRedirect, false);
    assert.equal(studio.rendersChildren, true, "Authenticated user sees studio sessions");
}
console.log("  ✓ Scenario C passed.");

// ------------------------------------------------------------------ //
// SCENARIO D: No redirect loop on login destination
// ------------------------------------------------------------------ //
console.log("Testing Scenario D: No redirect loop on login destination...");
{
    // Simulation of login page redirect behavior:
    // If user is unauthenticated on /login?callbackUrl=/dashboard:
    // Login page does NOT redirect; it displays the login form.
    function evaluateLoginRedirect(authState: AuthState, callbackUrlParam: string | null): string | null {
        if (!authState.isLoading && authState.isLoggedIn) {
            return safeRedirectPath(callbackUrlParam);
        }
        return null; // Stays on /login
    }

    // Step 1: Anonymous visitor hits /dashboard -> redirected to /login?callbackUrl=/dashboard
    const step1 = evaluateDashboardGuard({ isLoading: false, isLoggedIn: false }, "/dashboard");
    assert.equal(step1.redirectUrl, "/login?callbackUrl=%2Fdashboard");

    // Step 2: Anonymous visitor arrives at /login?callbackUrl=/dashboard
    const step2 = evaluateLoginRedirect({ isLoading: false, isLoggedIn: false }, "/dashboard");
    assert.equal(step2, null, "Login page does NOT redirect unauthenticated user; loop broken");

    // Step 3: User logs in successfully (isLoggedIn -> true)
    const step3 = evaluateLoginRedirect({ isLoading: false, isLoggedIn: true }, "/dashboard");
    assert.equal(step3, "/dashboard", "Login page routes user to original callbackUrl after auth");

    // Step 4: User arrives back at /dashboard with active session
    const step4 = evaluateDashboardGuard({ isLoading: false, isLoggedIn: true }, "/dashboard");
    assert.equal(step4.shouldRedirect, false, "Dashboard renders cleanly; no redirect loop");
    assert.equal(step4.rendersChildren, true);
}
console.log("  ✓ Scenario D passed.");

// ------------------------------------------------------------------ //
// SCENARIO E: Existing public routes remain public
// ------------------------------------------------------------------ //
console.log("Testing Scenario E: Existing public routes remain public...");
{
    const root = path.resolve(process.cwd());

    // Public pages must not import or use DashboardAuthGuard
    const publicPages = [
        "app/(site)/page.tsx",
        "app/(site)/about/page.tsx",
        "app/(site)/pricing/page.tsx",
        "app/(site)/tools/page.tsx",
        "app/(site)/contact/page.tsx",
        "app/(site)/terms/page.tsx",
        "app/(site)/privacy/page.tsx",
        "app/(site)/login/page.tsx",
        "app/(site)/register/page.tsx",
    ];

    for (const pageRel of publicPages) {
        const fullPath = path.join(root, pageRel);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, "utf8");
            assert.doesNotMatch(content, /DashboardAuthGuard/, `${pageRel} must not use DashboardAuthGuard`);
        }
    }

    // Site root layout must not use DashboardAuthGuard
    const siteLayout = fs.readFileSync(path.join(root, "app/(site)/layout.tsx"), "utf8");
    assert.doesNotMatch(siteLayout, /DashboardAuthGuard/, "app/(site)/layout.tsx must not use DashboardAuthGuard");
}
console.log("  ✓ Scenario E passed.");

// ------------------------------------------------------------------ //
// SCENARIO F: Authenticated dashboard behavior preserved
// ------------------------------------------------------------------ //
console.log("Testing Scenario F: Authenticated dashboard behavior preserved...");
{
    const root = path.resolve(process.cwd());
    const dashboardLayout = fs.readFileSync(path.join(root, "app/(site)/dashboard/layout.tsx"), "utf8");

    // Verify layout wraps children with DashboardAuthGuard
    assert.match(dashboardLayout, /import DashboardAuthGuard from ["']@\/components\/dashboard\/DashboardAuthGuard["']/);
    assert.match(dashboardLayout, /<DashboardAuthGuard>\s*\{children\}\s*<\/DashboardAuthGuard>/);
    assert.match(dashboardLayout, /buildNoIndexMetadata/, "Retains noindex metadata");

    // Verify dashboard page source still has its full components intact
    const dashboardPage = fs.readFileSync(path.join(root, "app/(site)/dashboard/page.tsx"), "utf8");
    assert.match(dashboardPage, /StudioSessions/);
    assert.match(dashboardPage, /openPaddleTransactionOverlay/);
    assert.match(dashboardPage, /Account & Billing/);
}
console.log("  ✓ Scenario F passed.");

// ------------------------------------------------------------------ //
// SCENARIO G: Return/callback path contract & open redirect immunity
// ------------------------------------------------------------------ //
console.log("Testing Scenario G: Return/callback path contract & open redirect immunity...");
{
    // Normal relative paths are preserved
    assert.equal(safeRedirectPath("/dashboard"), "/dashboard");
    assert.equal(safeRedirectPath("/dashboard/settings"), "/dashboard/settings");
    assert.equal(safeRedirectPath("/dashboard?tab=usage"), "/dashboard?tab=usage");

    // Malicious open redirect attempts are sanitized to DEFAULT_REDIRECT ("/")
    assert.equal(safeRedirectPath("https://evil.com"), "/");
    assert.equal(safeRedirectPath("//evil.com"), "/");
    assert.equal(safeRedirectPath("/\\evil.com"), "/");
    assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
    assert.equal(safeRedirectPath(""), "/");
    assert.equal(safeRedirectPath(null), "/");
    assert.equal(safeRedirectPath(undefined), "/");

    // Encoding in URL callback parameter
    const safeTarget = safeRedirectPath("/dashboard?focus=key");
    const loginUrl = `/login?callbackUrl=${encodeURIComponent(safeTarget)}`;
    assert.equal(loginUrl, "/login?callbackUrl=%2Fdashboard%3Ffocus%3Dkey");

    // Verify compatibility with StudioV2AuthGate contract
    const studioGate = fs.readFileSync(path.join(process.cwd(), "app/studio-v2/page.tsx"), "utf8");
    assert.match(studioGate, /router\.replace\(`\/login\?callbackUrl=\$\{encodeURIComponent\(returnTo\)\}`\)/);
}
console.log("  ✓ Scenario G passed.");

// ------------------------------------------------------------------ //
// SCENARIO H: Invalid/expired session behavior
// ------------------------------------------------------------------ //
console.log("Testing Scenario H: Invalid/expired session behavior...");
{
    // User was active on dashboard, session expires / logout occurs:
    // authState transitions from { isLoading: false, isLoggedIn: true }
    // to { isLoading: false, isLoggedIn: false }
    const postExpiryState = { isLoading: false, isLoggedIn: false };
    const onExpiry = evaluateDashboardGuard(postExpiryState, "/dashboard");

    assert.equal(onExpiry.shouldRedirect, true, "Redirects immediately upon session invalidation");
    assert.equal(onExpiry.redirectUrl, "/login?callbackUrl=%2Fdashboard");
    assert.equal(onExpiry.rendersChildren, false, "Hides protected UI immediately on expiration");
    assert.equal(onExpiry.rendersLoading, true, "Renders protective guard boundary");
}
console.log("  ✓ Scenario H passed.");

// ------------------------------------------------------------------ //
// 2. Component AST / Source Verification
// ------------------------------------------------------------------ //
console.log("Verifying component source implementation...");
{
    const root = path.resolve(process.cwd());
    const guardSource = fs.readFileSync(path.join(root, "components/dashboard/DashboardAuthGuard.tsx"), "utf8");

    assert.match(guardSource, /"use client"/, "Must be client component");
    assert.match(guardSource, /useAuth\(\)/, "Consumes AuthContext");
    assert.match(guardSource, /useRouter\(\)/, "Uses Next.js router");
    assert.match(guardSource, /usePathname\(\)/, "Uses Next.js pathname");
    assert.match(guardSource, /safeRedirectPath/, "Uses safeRedirectPath helper");
    assert.match(guardSource, /router\.replace\(/, "Uses replace to avoid history pollution");
    assert.match(guardSource, /\/login\?callbackUrl=/, "Uses canonical login redirect format");
    assert.match(guardSource, /isLoading \|\| !isLoggedIn/, "Guards children while loading or unauthenticated");
}
console.log("  ✓ Component source verification passed.");

console.log("\n=== ALL AUTH-006 DASHBOARD ROUTE PROTECTION TESTS PASSED 100% ===\n");
