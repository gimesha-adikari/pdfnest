// pdfnest/lib/preview/ServerPdfRenderer.ts

import { PreviewRenderer, PreviewRequest, PreviewResource } from "./types";

export interface ServerPdfRendererOptions {
    /**
     * Base URL for the backend API.
     * Defaults to NEXT_PUBLIC_API_URL env variable or "http://localhost:8080".
     */
    baseUrl?: string;

    /** Injected fetch implementation — useful for testing without real network calls. */
    fetchImpl?: typeof fetch;
}

interface PreviewSession {
    sessionId: string;
}

/** Checks whether an unknown value is an AbortError without any cast. */
function isAbortError(err: unknown): boolean {
    return (
        err instanceof DOMException && err.name === "AbortError" ||
        err instanceof Error && err.name === "AbortError"
    );
}

/**
 * Thin server-side renderer adapter wrapping the backend preview session REST API.
 *
 * Session lifecycle: A session is created once per document identity (file name + size +
 * lastModified + type) and reused for subsequent page requests. On a 404 (session expired),
 * the renderer creates a new session and retries the page fetch exactly once.
 *
 * Session-creation deduplication: concurrent render calls share one in-flight session promise.
 * The promise is intentionally created without any caller's AbortSignal so that one caller
 * aborting cannot cancel shared work that another active caller is still awaiting. Each caller
 * independently checks its own signal after the shared promise settles.
 *
 * Resource lifecycle: Returns PreviewResource { type: "image-url", url, revoke } where
 * revoke() calls URL.revokeObjectURL(url) exactly once (idempotent). PreviewCache/PreviewManager
 * are responsible for invoking revoke() when reference count reaches zero.
 */
export class ServerPdfRenderer implements PreviewRenderer {
    readonly id = "server-pymupdf";
    readonly capabilities = {
        client: false,
        server: true,
    };

    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;

    /** Active session keyed by file identity. */
    private _session: PreviewSession | null = null;
    private _sessionFileIdentity: string | null = null;
    /** In-flight session creation promise — deduplicated across concurrent render calls. */
    private _sessionPromise: Promise<PreviewSession> | null = null;

    constructor(options?: ServerPdfRendererOptions) {
        this.baseUrl =
            options?.baseUrl ??
            (typeof process !== "undefined"
                ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
                : "http://localhost:8080");

        this.fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    }

    canRender(request: PreviewRequest): boolean {
        return Boolean(request.document?.file);
    }

    async render(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResource> {
        if (!request.document?.file) {
            throw new Error("ServerPdfRenderer requires request.document.file");
        }

        if (signal.aborted) {
            throw this._abortError();
        }

        const file = request.document.file;
        const scale = this._resolveScale(request);

        // Await the shared session promise independently — see _ensureSession for signal contract.
        const session = await this._ensureSession(file, signal);

        if (signal.aborted) {
            throw this._abortError();
        }

        let response = await this._fetchPage(session.sessionId, request.page, scale, signal);

        if (signal.aborted) {
            throw this._abortError();
        }

        // On session expiry, create a fresh session and retry once.
        if (response.status === 404) {
            this._invalidateSession(file);
            const fresh = await this._ensureSession(file, signal); // caller's signal still respected here
            if (signal.aborted) {
                throw this._abortError();
            }
            response = await this._fetchPage(fresh.sessionId, request.page, scale, signal);
            if (signal.aborted) {
                throw this._abortError();
            }
        }

        if (!response.ok) {
            const message = await this._readErrorMessage(response, `Preview fetch failed (${response.status})`);
            const err = new Error(message) as Error & { status?: number };
            err.status = response.status;
            throw err;
        }

        const blob = await response.blob();

        if (signal.aborted) {
            throw this._abortError();
        }

        const url = URL.createObjectURL(blob);
        let revoked = false;

        return {
            type: "image-url",
            url,
            renderedBy: this.id,
            revoke: () => {
                if (revoked) return;
                revoked = true;
                URL.revokeObjectURL(url);
            },
        };
    }

    // ---------------------------------------------------------------------------
    // Session management
    // ---------------------------------------------------------------------------

    private _fileIdentity(file: File): string {
        return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    }

    private _invalidateSession(file: File): void {
        const identity = this._fileIdentity(file);
        if (this._sessionFileIdentity === identity) {
            this._session = null;
            this._sessionPromise = null;
            this._sessionFileIdentity = null;
        }
    }

    /**
     * Returns an existing session or awaits the shared in-flight creation promise.
     * Session creation runs without the caller's signal so that one caller aborting
     * cannot cancel work that concurrent callers are still awaiting. The caller's
     * signal is checked immediately after the shared promise settles.
     */
    private async _ensureSession(file: File, signal: AbortSignal): Promise<PreviewSession> {
        const identity = this._fileIdentity(file);

        // File changed — discard previous session.
        if (this._sessionFileIdentity !== identity) {
            this._session = null;
            this._sessionPromise = null;
            this._sessionFileIdentity = identity;
        }

        if (this._session) {
            if (signal.aborted) throw this._abortError();
            return this._session;
        }

        if (!this._sessionPromise) {
            // Start session creation without any caller signal — intentional.
            // Capture the promise reference so .then() closures can compare it correctly.
            const promise = this._createSession(file);
            this._sessionPromise = promise;
            promise.then(
                (created) => {
                    if (this._sessionFileIdentity === identity) {
                        this._session = created;
                    }
                    if (this._sessionPromise === promise) {
                        this._sessionPromise = null;
                    }
                },
                () => {
                    if (this._sessionPromise === promise) {
                        this._sessionPromise = null;
                    }
                },
            );
        }

        // Await the shared promise. If this caller's signal aborts while waiting,
        // throw AbortError — but the underlying fetch continues for other waiters.
        const sharedPromise = this._sessionPromise;
        try {
            const result = await Promise.race([
                sharedPromise,
                new Promise<never>((_, reject) => {
                    if (signal.aborted) {
                        reject(this._abortError());
                        return;
                    }
                    signal.addEventListener("abort", () => reject(this._abortError()), { once: true });
                }),
            ]);
            if (signal.aborted) throw this._abortError();
            return result;
        } catch (err) {
            // Only clear the shared promise if it failed for a non-abort reason
            // (abort only affects this caller — the shared promise keeps running).
            if (!isAbortError(err) && this._sessionPromise === sharedPromise) {
                this._sessionPromise = null;
            }
            throw err;
        }
    }

    /** Creates a backend preview session. Runs without any caller AbortSignal by design. */
    private async _createSession(file: File): Promise<PreviewSession> {
        const formData = new FormData();
        formData.append("file", file);

        const response = await this.fetchImpl(
            `${this.baseUrl}/api/conversion/preview/session`,
            { method: "POST", body: formData, credentials: "include" },
        );

        if (!response.ok) {
            const message = await this._readErrorMessage(
                response,
                `Preview session creation failed (${response.status})`,
            );
            throw new Error(message);
        }

        const data: unknown = await response.json();

        if (
            data === null ||
            typeof data !== "object" ||
            !("session_id" in data) ||
            typeof (data as Record<string, unknown>).session_id !== "string" ||
            (data as Record<string, unknown>).session_id === ""
        ) {
            throw new Error("Preview session response did not contain a valid session ID.");
        }

        return { sessionId: (data as Record<string, string>).session_id };
    }

    // ---------------------------------------------------------------------------
    // Page fetch
    // ---------------------------------------------------------------------------

    private _fetchPage(
        sessionId: string,
        page: number,
        scale: number,
        signal: AbortSignal,
    ): Promise<Response> {
        const url =
            `${this.baseUrl}/api/conversion/preview/session/` +
            `${encodeURIComponent(sessionId)}/page/${page}` +
            `?scale=${encodeURIComponent(scale)}`;

        try {
            return this.fetchImpl(url, { method: "GET", credentials: "include", signal });
        } catch (err) {
            if (isAbortError(err) || signal.aborted) {
                return Promise.reject(this._abortError());
            }
            return Promise.reject(err);
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /**
     * Resolves the numeric scale to pass to the backend.
     * Explicit request.scale takes priority. Falls back to 2.0 (144 DPI equivalent).
     * width/height dimension hints are not applicable for server-side rendering because
     * the backend controls rasterization resolution independently.
     */
    private _resolveScale(request: PreviewRequest): number {
        return request.scale ?? 2.0;
    }

    private async _readErrorMessage(response: Response, fallback: string): Promise<string> {
        try {
            const data: unknown = await response.json();
            if (
                data !== null &&
                typeof data === "object" &&
                "message" in data &&
                typeof (data as Record<string, unknown>).message === "string"
            ) {
                return (data as Record<string, string>).message;
            }
        } catch {
            // Body could not be parsed as JSON — use fallback.
        }
        return fallback;
    }

    private _abortError(): Error {
        const err = new DOMException("The operation was aborted.", "AbortError");
        return err;
    }
}
