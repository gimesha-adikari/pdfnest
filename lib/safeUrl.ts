const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "169.254.169.254",
]);

const PRIVATE_HOST_PATTERNS = [
    /^10\./,
    /^127\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /\.local$/,
    /\.internal$/,
];

/**
 * Client-side guard for user supplied capture targets: only public http(s)
 * URLs are accepted. The backend must enforce the same policy, this only
 * avoids sending obviously internal targets to the conversion service.
 */
export function isPublicHttpUrl(value: string): boolean {
    let parsed: URL;

    try {
        parsed = new URL(value.trim());
    } catch {
        return false;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|]$/g, "");

    if (!hostname) return false;
    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return false;

    return true;
}
