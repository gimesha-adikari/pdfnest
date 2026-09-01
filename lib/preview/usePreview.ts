// pdfnest/lib/preview/usePreview.ts

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    DocumentHandle,
    PreviewError,
    PreviewMode,
    PreviewMetadata,
    PreviewRendererPreference,
    PreviewRequest,
    PreviewResult,
} from "./types";
import { PreviewManager, PreviewHandle } from "./PreviewManager";
import { ClientPdfRenderer } from "./ClientPdfRenderer";
import { ServerPdfRenderer } from "./ServerPdfRenderer";

export interface UsePreviewOptions {
    file: File | null;
    page: number;
    scale?: number;
    mode?: PreviewMode;
    renderer?: PreviewRendererPreference;
    enabled?: boolean;
    onError?: (error: PreviewError) => void;
    manager?: PreviewManager;
}

export interface UsePreviewResult {
    src: string;
    isLoading: boolean;
    error: PreviewError | null;
    metadata: PreviewMetadata | null;
    retry: () => void;
    reset: () => void;
}

/** Module-level singleton instance for shared cache & request deduplication. */
let defaultManager: PreviewManager | null = null;

/**
 * Returns or creates the default PreviewManager singleton registered with
 * both ClientPdfRenderer and ServerPdfRenderer.
 */
export function getDefaultPreviewManager(): PreviewManager {
    if (!defaultManager) {
        defaultManager = new PreviewManager();
        defaultManager.registerRenderer(new ClientPdfRenderer());
        defaultManager.registerRenderer(new ServerPdfRenderer());
    }
    return defaultManager;
}

/**
 * React hook bridging components to the PreviewManager subsystem.
 *
 * Resource ownership: PreviewManager owns the underlying PreviewResource lifecycle
 * (caching, retain/release, revocation). The hook subscribes on mount/input changes
 * and unsubscribes on unmount/input changes without revoking the resource directly.
 */
export function usePreview(options: UsePreviewOptions): UsePreviewResult {
    const {
        file,
        page,
        enabled = true,
        onError,
        manager,
    } = options;

    // Parameter defaults & mode mappings
    const resolvedMode: PreviewMode = options.mode ?? "page";
    const resolvedRenderer: PreviewRendererPreference =
        options.renderer ?? (resolvedMode === "thumbnail" ? "client" : "server");
    const resolvedScale: number =
        options.scale ?? (resolvedMode === "thumbnail" ? 0.3 : 2.0);

    const [src, setSrc] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<PreviewError | null>(null);
    const [metadata, setMetadata] = useState<PreviewMetadata | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);

    const handleRef = useRef<PreviewHandle | null>(null);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const isEnabled = enabled && file !== null && page >= 1;

    const reset = useCallback(() => {
        if (handleRef.current) {
            handleRef.current.unsubscribe();
            handleRef.current = null;
        }
        setSrc("");
        setIsLoading(false);
        setError(null);
        setMetadata(null);
    }, []);

    const retry = useCallback(() => {
        setRetryNonce((current) => current + 1);
    }, []);

    useEffect(() => {
        if (!isEnabled || !file) {
            if (handleRef.current) {
                handleRef.current.unsubscribe();
                handleRef.current = null;
            }
            // Reset the hook's externally-owned resource state when its input is disabled.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSrc("");
            setIsLoading(false);
            setError(null);
            setMetadata(null);
            return;
        }

        // Prepare state for active request
        // A new document/page request must clear the previous resource before subscribing.
        setSrc("");
        setIsLoading(true);
        setError(null);
        setMetadata(null);

        const doc: DocumentHandle = {
            id: `${file.name}:${file.size}:${file.lastModified}:${file.type}`,
            version: String(file.lastModified),
            pageCount: 0,
            file: file,
        };

        const request: PreviewRequest = {
            document: doc,
            page,
            mode: resolvedMode,
            renderer: resolvedRenderer,
            scale: resolvedScale,
        };

        const activeManager = manager ?? getDefaultPreviewManager();
        const handle = activeManager.request(request);
        handleRef.current = handle;

        let cancelled = false;

        handle.subscribe((result: PreviewResult) => {
            if (cancelled) return;

            if (result.status === "success" && result.resource) {
                const url = result.resource.url ?? "";
                setSrc(url);
                setIsLoading(false);
                setError(null);
                setMetadata(result.resource.metadata ?? null);
            } else if (result.status === "error") {
                setSrc("");
                setIsLoading(false);
                setMetadata(null);
                const previewErr = result.error ?? {
                    code: "UNKNOWN",
                    message: "Preview failed",
                };
                setError(previewErr);
                onErrorRef.current?.(previewErr);
            }
        });

        return () => {
            cancelled = true;
            handle.unsubscribe();
            if (handleRef.current === handle) {
                handleRef.current = null;
            }
        };
    }, [
        file,
        page,
        resolvedMode,
        resolvedRenderer,
        resolvedScale,
        isEnabled,
        manager,
        retryNonce,
    ]);

    return {
        src,
        isLoading,
        error,
        metadata,
        retry,
        reset,
    };
}
