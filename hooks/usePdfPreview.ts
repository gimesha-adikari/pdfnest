"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PreviewSession {
    sessionId: string;
    pageCount: number;
}

interface UsePdfPreviewOptions {
    file: File | null;
    pageNumber: number;
    scale?: string;
    enabled?: boolean;
    onError?: (message: string) => void;
}

interface UsePdfPreviewResult {
    previewSrc: string;
    isLoading: boolean;
    sessionId: string | null;
    pageCount: number;
    clearCache: () => void;
    resetPreview: () => void;
}

function getFileIdentity(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function getPreviewKey(
    sessionId: string,
    pageNumber: number,
    scale: string,
): string {
    return `${sessionId}:${pageNumber}:${scale}`;
}

function getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

export function usePdfPreview({
                                  file,
                                  pageNumber,
                                  scale = "2.0",
                                  enabled = true,
                                  onError,
                              }: UsePdfPreviewOptions): UsePdfPreviewResult {
    const [previewSrc, setPreviewSrc] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [session, setSession] = useState<PreviewSession | null>(null);

    const sessionRef = useRef<PreviewSession | null>(null);
    const sessionPromiseRef = useRef<Promise<PreviewSession> | null>(null);
    const fileIdentityRef = useRef<string | null>(null);
    const cacheRef = useRef<Map<string, string>>(new Map());
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const clearObjectUrlCache = useCallback(() => {
        for (const url of cacheRef.current.values()) {
            URL.revokeObjectURL(url);
        }

        cacheRef.current.clear();
    }, []);

    const createSession = useCallback(
        async (targetFile: File): Promise<PreviewSession> => {
            const formData = new FormData();
            formData.append("file", targetFile);

            const response = await fetch(
                `${getBaseUrl()}/api/conversion/preview/session`,
                {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                },
            );

            if (!response.ok) {
                let message = `Preview session creation failed (${response.status})`;

                try {
                    const data = await response.json();

                    if (typeof data?.message === "string") {
                        message = data.message;
                    }
                } catch {
                }

                throw new Error(message);
            }

            const data = await response.json();

            if (
                !data ||
                typeof data.session_id !== "string" ||
                data.session_id.length === 0
            ) {
                throw new Error(
                    "Preview session response did not contain a valid session ID.",
                );
            }

            return {
                sessionId: data.session_id,
                pageCount:
                    typeof data.page_count === "number"
                        ? data.page_count
                        : 0,
            };
        },
        [],
    );

    const ensureSession = useCallback(
        async (targetFile: File): Promise<PreviewSession> => {
            const identity = getFileIdentity(targetFile);

            if (fileIdentityRef.current !== identity) {
                clearObjectUrlCache();

                sessionRef.current = null;
                sessionPromiseRef.current = null;
                fileIdentityRef.current = identity;

                setSession(null);
                setPreviewSrc("");
            }

            if (sessionRef.current) {
                return sessionRef.current;
            }

            if (sessionPromiseRef.current) {
                return sessionPromiseRef.current;
            }

            const promise = createSession(targetFile);

            sessionPromiseRef.current = promise;

            try {
                const createdSession = await promise;

                if (fileIdentityRef.current !== identity) {
                    return createdSession;
                }

                sessionRef.current = createdSession;
                setSession(createdSession);

                return createdSession;
            } catch (error) {
                if (sessionPromiseRef.current === promise) {
                    sessionPromiseRef.current = null;
                }

                throw error;
            } finally {
                if (sessionPromiseRef.current === promise) {
                    sessionPromiseRef.current = null;
                }
            }
        },
        [clearObjectUrlCache, createSession],
    );

    const loadPreview = useCallback(
        async (
            targetFile: File,
            requestedPage: number,
            signal: AbortSignal,
        ) => {
            let activeSession = await ensureSession(targetFile);

            if (signal.aborted) {
                return;
            }

            const request = async (
                currentSession: PreviewSession,
            ): Promise<Response> => {
                const url =
                    `${getBaseUrl()}/api/conversion/preview/session/` +
                    `${encodeURIComponent(currentSession.sessionId)}` +
                    `/page/${requestedPage}` +
                    `?scale=${encodeURIComponent(scale)}`;

                return fetch(url, {
                    method: "GET",
                    credentials: "include",
                    signal,
                });
            };

            let response = await request(activeSession);

            if (signal.aborted) {
                return;
            }

            if (response.status === 404) {
                sessionRef.current = null;
                sessionPromiseRef.current = null;
                setSession(null);

                clearObjectUrlCache();

                activeSession = await createSession(targetFile);

                if (signal.aborted) {
                    return;
                }

                sessionRef.current = activeSession;
                setSession(activeSession);

                response = await request(activeSession);
            }

            if (!response.ok) {
                let message = `Preview failed (${response.status})`;

                try {
                    const data = await response.json();

                    if (typeof data?.message === "string") {
                        message = data.message;
                    }
                } catch {
                }

                throw new Error(message);
            }

            const blob = await response.blob();

            if (signal.aborted) {
                return;
            }

            const currentSession = sessionRef.current;

            if (
                !currentSession ||
                currentSession.sessionId !== activeSession.sessionId
            ) {
                return;
            }

            const objectUrl = URL.createObjectURL(blob);

            const cacheKey = getPreviewKey(
                activeSession.sessionId,
                requestedPage,
                scale,
            );

            const previousUrl = cacheRef.current.get(cacheKey);

            if (previousUrl) {
                URL.revokeObjectURL(previousUrl);
            }

            cacheRef.current.set(cacheKey, objectUrl);

            setPreviewSrc(objectUrl);
        },
        [
            clearObjectUrlCache,
            createSession,
            ensureSession,
            scale,
        ],
    );

    useEffect(() => {
        if (!file || !enabled || pageNumber < 1) {
            if (!file) {
                clearObjectUrlCache();

                sessionRef.current = null;
                sessionPromiseRef.current = null;
                fileIdentityRef.current = null;

                setSession(null);
                setPreviewSrc("");
            }

            setIsLoading(false);
            return;
        }

        const targetFile = file;
        const controller = new AbortController();

        setIsLoading(true);

        void loadPreview(
            targetFile,
            pageNumber,
            controller.signal,
        )
            .catch((error) => {
                if (
                    controller.signal.aborted ||
                    error instanceof DOMException &&
                    error.name === "AbortError"
                ) {
                    return;
                }

                console.error("PDF preview failed:", error);

                onErrorRef.current?.(
                    error instanceof Error
                        ? error.message
                        : "Failed to load PDF preview.",
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => {
            controller.abort();
        };
    }, [
        file,
        pageNumber,
        enabled,
        loadPreview,
        clearObjectUrlCache,
    ]);

    const clearCache = useCallback(() => {
        clearObjectUrlCache();
    }, [clearObjectUrlCache]);

    const resetPreview = useCallback(() => {
        clearObjectUrlCache();

        sessionRef.current = null;
        sessionPromiseRef.current = null;
        fileIdentityRef.current = null;

        setSession(null);
        setPreviewSrc("");
        setIsLoading(false);
    }, [clearObjectUrlCache]);

    useEffect(() => {
        return () => {
            clearObjectUrlCache();
        };
    }, [clearObjectUrlCache]);

    return {
        previewSrc,
        isLoading,
        sessionId: session?.sessionId ?? null,
        pageCount: session?.pageCount ?? 0,
        clearCache,
        resetPreview,
    };
}