import assert from "node:assert/strict";
import { isIndexableSitemapPath } from "../../lib/seoRoutes";
import { safeRedirectPath } from "../../lib/safeRedirect";
import robots from "../../app/robots";
import nextConfig from "../../next.config";
import { NAV_TOOLS_FALLBACK } from "../../lib/toolsData";

for (const privatePath of [
    "/login",
    "/login?callbackUrl=/ocr-pdf",
    "/ocr-pdf",
    "/register",
    "/verify-email?token=secret",
    "/dashboard",
    "/dashboard/studio-sessions",
    "/admin/content",
    "/billing/complete",
    "/studio-v2",
]) {
    assert.equal(isIndexableSitemapPath(privatePath), false, privatePath);
}

for (const publicPath of ["/", "/about", "/image-to-searchable-pdf", "/word-to-pdf", "/reorder-pages"]) {
    assert.equal(isIndexableSitemapPath(publicPath), true, publicPath);
}

assert.equal(safeRedirectPath("/ocr-pdf"), "/ocr-pdf");
assert.equal(safeRedirectPath("/word-to-pdf"), "/word-to-pdf");
assert.equal(safeRedirectPath("https://evil.example/"), "/");
assert.equal(
    NAV_TOOLS_FALLBACK.flatMap((tool) => tool.related ?? []).includes("/ocr-pdf"),
    false
);

const robotsRules = robots().rules;
const wildcardRule = Array.isArray(robotsRules)
    ? robotsRules.find((rule) => rule.userAgent === "*")
    : undefined;
assert.ok(wildcardRule);
assert.equal(wildcardRule?.disallow?.includes("/login"), false);

async function runRedirectAssertions() {
    const redirects = await nextConfig.redirects?.();
    const legacyOcrRedirect = redirects?.find((redirect) => redirect.source === "/ocr-pdf");
    assert.equal(legacyOcrRedirect?.destination, "/image-to-searchable-pdf");
    assert.equal(legacyOcrRedirect?.permanent, true);

    console.log("SEO route and callback URL tests passed.");
}

runRedirectAssertions().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
