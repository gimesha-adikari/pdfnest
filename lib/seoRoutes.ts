const NON_INDEXABLE_SITEMAP_PREFIXES = [
    "/login",
    "/register",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/ocr-pdf",
    "/logout",
    "/auth",
    "/oauth",
    "/callback",
    "/api",
    "/dashboard",
    "/account",
    "/settings",
    "/profile",
    "/billing",
    "/admin",
    "/studio",
    "/studio-v2",
    "/subscribe",
] as const;

/**
 * Sitemap entries are public, parameter-free landing pages only.
 * Query/state variants remain functional in the application, but never gain
 * an independent sitemap identity.
 */
export function isIndexableSitemapPath(href: string): boolean {
    if (!href || href.includes("?") || href.includes("#")) return false;

    const pathname = href.startsWith("/") ? href : `/${href}`;
    return !NON_INDEXABLE_SITEMAP_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}
