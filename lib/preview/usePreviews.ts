// pdfnest/lib/preview/usePreviews.ts

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PreviewHandle, PreviewManager } from "./PreviewManager";
import {
    createPreviewKey,
    DocumentHandle,
    PreviewError,
    PreviewRendererPreference,
    PreviewRequest,
    PreviewResource,
    PreviewResult,
} from "./types";
import { getDefaultPreviewManager } from "./usePreview";

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * One item in the collection passed to usePreviews.
 *
 * file:null or enabled:false designates a disabled slot — no PreviewManager
 * request is issued and the corresponding result has src="" / isLoading=false /
 * error=null.
 */
export interface PreviewItemRequest {
    /** PDF file to render. null means this slot is disabled. */
    file: File | null;
    /** 1-based page number within the file. */
    page: number;
    /** Render scale. Defaults to 0.3 (suitable for thumbnail grids). */
    scale?: number;
    /** Renderer preference. Defaults to "client". */
    renderer?: PreviewRendererPreference;
    /**
     * Explicit enable flag. When false (or file is null) the slot is skipped —
     * no request is issued and the result is immediately non-loading.
     * Defaults to true.
     */
    enabled?: boolean;
}

/** Per-slot result, parallel to the requests array. */
export interface PreviewItemResult {
    /** Object URL or data URL of the rendered page, or "" while loading/error. */
    src: string;
    /** True until this slot's render completes (success or error). */
    isLoading: boolean;
    /** Non-null only when this slot's render failed. */
    error: PreviewError | null;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildDocumentHandle(file: File): DocumentHandle {
    return {
        id: `${file.name}:${file.size}:${file.lastModified}:${file.type}`,
        version: String(file.lastModified),
        pageCount: 0,
        file,
    };
}

function buildFullRequest(req: PreviewItemRequest): PreviewRequest {
    return {
        document: buildDocumentHandle(req.file!),
        page: req.page,
        scale: req.scale ?? 0.3,
        mode: "thumbnail",
        renderer: req.renderer ?? "client",
    };
}

function extractSrcFromResource(resource: PreviewResource | null): string {
    if (!resource) return "";
    if (resource.url) return resource.url;
    if (resource.canvas && typeof (resource.canvas as any).toDataURL === "function") {
        try {
            return (resource.canvas as any).toDataURL("image/png");
        } catch {
            return "";
        }
    }
    return "";
}

function itemIsActive(req: PreviewItemRequest): boolean {
    return req.file !== null && req.enabled !== false;
}

function computeItemKey(req: PreviewItemRequest): string {
    // Disabled/null slots get a deterministic non-colliding sentinel string.
    if (!itemIsActive(req)) {
        return `__disabled__p${req.page}`;
    }
    return createPreviewKey(buildFullRequest(req));
}

function computeRequestsKeyString(reqs: PreviewItemRequest[]): string {
    if (reqs.length === 0) return "__empty__";
    return reqs.map(computeItemKey).join("|");
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * usePreviews — generic collection preview hook.
 *
 * Manages a variable-length set of preview requests against the shared
 * PreviewManager. Returns a results array that is index-parallel to the
 * requests array, with each slot independently tracking its loading/success/
 * error state.
 *
 * ## Lifecycle design: how subscriptions survive equivalent array-reference changes
 *
 * The core requirement is: an inline (non-memoized) `requests` array rebuilt
 * each render with identical effective content must NOT tear down and re-establish
 * active subscriptions.
 *
 * ### Solution: content-derived string dependency
 *
 * 1. `requestsKeyString` is derived from request *content* via `useMemo`.
 *    It is a primitive string that changes only when file identity, page,
 *    scale, renderer, or enabled actually change.
 *
 * 2. `useEffect` depends on `[requestsKeyString, manager]` — NOT on the
 *    `requests` reference. Because `requestsKeyString` is a primitive string,
 *    React's `Object.is` comparison evaluates the *value*, not object identity.
 *    When a new inline `requests` array is created with the same effective
 *    content, `useMemo` recomputes (cheap string join) but returns the same
 *    string value → effect dependency is unchanged → effect does NOT fire →
 *    no cleanup, no re-subscription, active subscriptions stay alive.
 *
 * 3. `requestsRef.current` is updated synchronously on every render. When the
 *    effect *does* fire (because key string or manager changed), reading
 *    `requestsRef.current` inside the effect gives the fresh, correct requests
 *    without needing `requests` in the dep array.
 *
 * ### Sequences
 *
 * Inline array, same content (ref A → ref B, key "k1" → "k1"):
 *   useMemo recomputes → "k1" (same value) → effect dep unchanged →
 *   effect does NOT fire → no cleanup → subscriptions alive ✅
 *
 * Content change (page 1 → page 2, key "k1" → "k2"):
 *   useMemo → "k2" → effect dep changed → cleanup runs (old handles
 *   unsubscribed) → new effect → new handles set up ✅
 *
 * Manager change:
 *   manager dep changes → effect fires → cleanup unsubscribes handles on
 *   old manager → new handles created on new manager ✅
 *
 * Unmount:
 *   effect cleanup → all active handles unsubscribed ✅
 */
export function usePreviews(
    requests: PreviewItemRequest[],
    options?: { manager?: PreviewManager }
): PreviewItemResult[] {
    const manager = options?.manager;

    // Stable content-derived key string. useMemo fires when `requests` reference
    // changes, but the returned STRING VALUE only changes when effective request
    // content changes. useEffect([requestsKeyString]) therefore only re-runs on
    // actual content changes — not on array-reference changes with same content.
    const requestsKeyString = useMemo(
        () => computeRequestsKeyString(requests),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [requests]
    );

    // Always-current ref: read inside effects to avoid stale closures without
    // adding `requests` to the effect dep array (which would defeat key-stability).
    const requestsRef = useRef<PreviewItemRequest[]>(requests);
    requestsRef.current = requests;

    const [results, setResults] = useState<PreviewItemResult[]>([]);

    useEffect(() => {
        const currentRequests = requestsRef.current;
        const activeManager = manager ?? getDefaultPreviewManager();

        // Empty collection → empty results, no subscriptions.
        if (currentRequests.length === 0) {
            setResults([]);
            return;
        }

        // Initialise all slots synchronously before any async results arrive.
        // Disabled/null slots are immediately non-loading; active slots start loading.
        setResults(
            currentRequests.map((req) =>
                itemIsActive(req)
                    ? { src: "", isLoading: true, error: null }
                    : { src: "", isLoading: false, error: null }
            )
        );

        // Issue one PreviewManager request per active slot and subscribe.
        // The Map is closed over in the cleanup function below.
        const handles = new Map<number, PreviewHandle>();

        currentRequests.forEach((req, idx) => {
            if (!itemIsActive(req)) return;

            const handle = activeManager.request(buildFullRequest(req));
            handles.set(idx, handle);

            handle.subscribe((result: PreviewResult) => {
                setResults((prev) => {
                    // Guard: prev may have been replaced by a newer request set
                    // (length changed) — ignore stale callbacks in that case.
                    if (idx >= prev.length) return prev;
                    const next = [...prev];
                    if (result.status === "success") {
                        next[idx] = {
                            src: extractSrcFromResource(result.resource),
                            isLoading: false,
                            error: null,
                        };
                    } else if (result.status === "error") {
                        next[idx] = {
                            src: "",
                            isLoading: false,
                            error: result.error ?? {
                                code: "UNKNOWN",
                                message: "Preview failed",
                            },
                        };
                    }
                    return next;
                });
            });
        });

        // Cleanup: unsubscribe every handle created by THIS effect invocation.
        //
        // This runs when requestsKeyString or manager changes (immediately before
        // the next effect fires — which WILL set up new handles) and on unmount.
        //
        // Because the effect deps are [requestsKeyString, manager] rather than
        // [requests], this cleanup does NOT run when the requests reference
        // changes with identical effective content.
        return () => {
            for (const handle of handles.values()) {
                handle.unsubscribe();
            }
        };

    // Intentionally exclude the `requests` reference — stability is achieved
    // through requestsKeyString (content-derived stable string).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestsKeyString, manager]);

    return results;
}
