export const PRODUCTION_SITE_URL = "https://platenpdf.com";

/**
 * Normalize the configured public URL without deriving it from the request
 * host. Preview and local URLs remain usable, while the former production
 * www hostname is always mapped to the canonical apex hostname.
 */
export function normalizeSiteUrl(rawUrl?: string): string {
    const url = new URL(rawUrl?.trim() || PRODUCTION_SITE_URL);

    if (url.hostname.toLowerCase() === "www.platenpdf.com") {
        url.hostname = "platenpdf.com";
    }

    return url.toString().replace(/\/$/, "");
}

export function getSiteUrl(): string {
    const isProduction = [process.env.APP_ENV, process.env.VERCEL_ENV].some(
        (value) => value?.toLowerCase() === "production"
    );

    if (isProduction) {
        return PRODUCTION_SITE_URL;
    }

    return normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}

export function toSiteUrl(pathname: string): string {
    return new URL(
        pathname.startsWith("/") ? pathname : `/${pathname}`,
        getSiteUrl()
    ).toString();
}
