const DEFAULT_REDIRECT = "/";

/**
 * Returns `value` only when it is a same-origin, relative path.
 *
 * Rejects absolute URLs, protocol-relative paths (`//evil.com`),
 * scheme-like values (`javascript:`, `data:`) and backslash variants so a
 * `callbackUrl` query parameter cannot be used for an open redirect.
 */
export function safeRedirectPath(value: string | null | undefined): string {
    if (!value) return DEFAULT_REDIRECT;

    const candidate = value.trim();

    if (!candidate.startsWith("/")) return DEFAULT_REDIRECT;
    if (candidate.startsWith("//") || candidate.startsWith("/\\")) return DEFAULT_REDIRECT;
    if (/[\u0000-\u001f\u007f]/.test(candidate)) return DEFAULT_REDIRECT;

    return candidate;
}
