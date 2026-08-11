"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PreviewOptions {
    activeFile: File | null;
    pageNumber: number;
    onError: (message: string) => void;
}

interface PreviewSession {
    sessionId: string;
    pageCount: number;
}

function getFileIdentity(file: File) {
    return [
        file.name,
        file.size,
        file.lastModified,
    ].join("|");
}

function getPreviewKey(
    sessionId: string,
    pageNumber: number,
    scale: string,
) {
    return [
        sessionId,
        pageNumber,
        scale,
    ].join("|");
}

export function useStudioPreview({
                                     activeFile,
                                     pageNumber,
                                     onError,
                                 }: PreviewOptions) {
    const [previewSrc, setPreviewSrc] = useState("");
    const [isRendering, setIsRendering] = useState(false);
    const [session, setSession] =
        useState<PreviewSession | null>(null);

    const cacheRef = useRef<Map<string, string>>(
        new Map(),
    );

    const sessionRef =
        useRef<PreviewSession | null>(null);

    const sessionPromiseRef =
        useRef<Promise<PreviewSession> | null>(null);

    const activeFileIdentityRef =
        useRef<string | null>(null);

    const onErrorRef =
        useRef(onError);

    const baseUrl = useMemo(
        () =>
            process.env.NEXT_PUBLIC_API_URL ??
            "http://localhost:8080",
        [],
    );

    const scale = "2.0";

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const revokeCache = useCallback(() => {
        for (const objectUrl of cacheRef.current.values()) {
            URL.revokeObjectURL(objectUrl);
        }

        cacheRef.current.clear();
    }, []);

    const clearPreview = useCallback(() => {
        setPreviewSrc("");
    }, []);

    const clearPreviewCache = useCallback(() => {
        revokeCache();
        setPreviewSrc("");
    }, [revokeCache]);

    const resetPreview = useCallback(() => {
        revokeCache();
        setPreviewSrc("");
        setSession(null);
        sessionRef.current = null;
        sessionPromiseRef.current = null;
        activeFileIdentityRef.current = null;
    }, [revokeCache]);

    const createSession = useCallback(
        async (file: File): Promise<PreviewSession> => {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(
                `${baseUrl}/api/conversion/preview/session`,
                {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Preview session creation failed (${response.status})`,
                );
            }

            const data = await response.json();

            if (
                !data ||
                typeof data.session_id !== "string" ||
                !data.session_id
            ) {
                throw new Error(
                    "Preview session response did not contain a valid session ID.",
                );
            }

            return {
                sessionId: data.session_id,
                pageCount: Number(data.page_count ?? 0),
            };
        },
        [baseUrl],
    );

    const ensureSession = useCallback(
        async (file: File): Promise<PreviewSession> => {
            const identity = getFileIdentity(file);

            if (
                activeFileIdentityRef.current !== identity
            ) {
                revokeCache();

                setPreviewSrc("");
                setSession(null);

                sessionRef.current = null;
                sessionPromiseRef.current = null;

                activeFileIdentityRef.current = identity;
            }

            const existing = sessionRef.current;

            if (existing) {
                return existing;
            }

            if (sessionPromiseRef.current) {
                return sessionPromiseRef.current;
            }

            const promise = createSession(file);

            sessionPromiseRef.current = promise;

            try {
                const nextSession = await promise;

                sessionRef.current = nextSession;
                setSession(nextSession);

                return nextSession;
            } finally {
                sessionPromiseRef.current = null;
            }
        },
        [createSession, revokeCache],
    );

    const loadPreview = useCallback(
        async (
            file: File,
            requestedPage: number,
        ) => {
            const currentSession =
                await ensureSession(file);

            const cacheKey = getPreviewKey(
                currentSession.sessionId,
                requestedPage,
                scale,
            );

            const cached =
                cacheRef.current.get(cacheKey);

            if (cached) {
                setPreviewSrc(cached);
                return;
            }

            const requestPage = async (
                activeSession: PreviewSession,
            ) => {
                const response = await fetch(
                    `${baseUrl}/api/conversion/preview/session/` +
                    `${encodeURIComponent(
                        activeSession.sessionId,
                    )}/page/${requestedPage}` +
                    `?scale=${encodeURIComponent(scale)}`,
                    {
                        method: "GET",
                        credentials: "include",
                    },
                );

                return response;
            };

            let response = await requestPage(
                currentSession,
            );

            if (response.status === 404) {
                sessionRef.current = null;
                sessionPromiseRef.current = null;
                setSession(null);

                revokeCache();

                const recreatedSession =
                    await createSession(file);

                sessionRef.current =
                    recreatedSession;

                setSession(recreatedSession);

                response = await requestPage(
                    recreatedSession,
                );
            }

            if (!response.ok) {
                throw new Error(
                    `Preview failed (${response.status})`,
                );
            }

            const blob = await response.blob();

            const objectUrl =
                URL.createObjectURL(blob);

            cacheRef.current.set(
                getPreviewKey(
                    sessionRef.current!.sessionId,
                    requestedPage,
                    scale,
                ),
                objectUrl,
            );

            setPreviewSrc(objectUrl);
        },
        [
            baseUrl,
            createSession,
            ensureSession,
            revokeCache,
            scale,
        ],
    );

    useEffect(() => {
        if (!activeFile) {
            revokeCache();
            setPreviewSrc("");
            setSession(null);

            sessionRef.current = null;
            sessionPromiseRef.current = null;
            activeFileIdentityRef.current = null;

            return;
        }

        const file = activeFile;
        let cancelled = false;

        async function run() {
            setIsRendering(true);

            try {
                await loadPreview(file, pageNumber);

                if (cancelled) {
                    return;
                }
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error("Studio preview failed:", error);

                onErrorRef.current(
                    "Failed to load preview for the selected page.",
                );
            } finally {
                if (!cancelled) {
                    setIsRendering(false);
                }
            }
        }

        run();

        return () => {
            cancelled = true;
        };
    }, [
        activeFile,
        pageNumber,
        loadPreview,
        revokeCache,
    ]);

    useEffect(() => {
        return () => {
            revokeCache();
        };
    }, [revokeCache]);

    return {
        previewSrc,
        isRendering,
        sessionId: session?.sessionId ?? null,
        pageCount: session?.pageCount ?? 0,
        clearPreview,
        resetPreview,
        clearPreviewCache,
    };
}