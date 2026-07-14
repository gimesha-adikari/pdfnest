"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface PreviewOptions {
    activeFile: File | null;
    pageNumber: number;
    onError: (message: string) => void;
}

function getPreviewKey(file: File, pageNumber: number, scale: string) {
    return [file.name, file.size, file.lastModified, pageNumber, scale].join("|");
}

export function useStudioPreview({
                                     activeFile,
                                     pageNumber,
                                     onError,
                                 }: PreviewOptions) {
    const [previewSrc, setPreviewSrc] = useState("");
    const [isRendering, setIsRendering] = useState(false);

    const cacheRef = useRef<Map<string, string>>(new Map());

    const baseUrl = useMemo(
        () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
        []
    );

    const clearPreview = () => {
        setPreviewSrc("");
    };

    const clearPreviewCache = () => {
        for (const url of cacheRef.current.values()) {
            URL.revokeObjectURL(url);
        }
        cacheRef.current.clear();
        setPreviewSrc("");
    };

    const resetPreview = () => {
        clearPreviewCache();
    };

    useEffect(() => {
        if (!activeFile) {
            clearPreviewCache();
            return;
        }

        let cancelled = false;
        const file = activeFile;
        const scale = "2.0";
        const cacheKey = getPreviewKey(file, pageNumber, scale);

        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
            setPreviewSrc(cached);
            setIsRendering(false);
            return;
        }

        async function renderPreview() {
            setIsRendering(true);

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("page", String(pageNumber));
                formData.append("scale", scale);

                const response = await fetch(
                    `${baseUrl}/api/conversion/preview/page`,
                    {
                        method: "POST",
                        body: formData,
                        credentials: "include",
                    }
                );

                if (!response.ok) {
                    throw new Error(`Preview failed (${response.status})`);
                }

                const blob = await response.blob();
                if (cancelled) return;

                const objectUrl = URL.createObjectURL(blob);
                cacheRef.current.set(cacheKey, objectUrl);
                setPreviewSrc(objectUrl);
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                    onError("Failed to load preview for the selected page.");
                }
            } finally {
                if (!cancelled) {
                    setIsRendering(false);
                }
            }
        }

        renderPreview();

        return () => {
            cancelled = true;
        };
    }, [activeFile, pageNumber, baseUrl, onError]);

    useEffect(() => {
        return () => {
            clearPreviewCache();
        };
    }, []);

    return {
        previewSrc,
        isRendering,
        clearPreview,
        resetPreview,
        clearPreviewCache,
    };
}