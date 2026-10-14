/**
 * The real-backend preview suite must never infer its target from application
 * defaults. Restrict all targets to an explicit IPv4 loopback HTTP origin.
 */
export function requireExplicitLoopbackOrigin(raw: string | undefined, name: string): string {
    if (!raw?.trim()) {
        throw new Error(`${name} must be explicitly set for the opt-in preview integration suite.`);
    }

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error(`${name} must be an absolute loopback HTTP URL with an explicit port.`);
    }

    if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        !url.port ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new Error(`${name} must be a plain http://127.0.0.1:<port> origin with no path or credentials.`);
    }

    return url.origin;
}

export function requireRevision(raw: string | undefined, name: string): string {
    if (!raw || !/^[a-f0-9]{40}$/i.test(raw)) {
        throw new Error(`${name} must be the 40-character Git revision actually under test.`);
    }
    return raw.toLowerCase();
}
