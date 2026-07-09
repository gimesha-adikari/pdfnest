"use client";

import { useEffect, useMemo, useState } from "react";

interface PreviewOptions {
    activeFile: File | null;
    pageNumber: number;
    onError: (message: string) => void;
}

export function useStudioPreview({
                                     activeFile,
                                     pageNumber,
                                     onError,
                                 }: PreviewOptions) {
    const [previewSrc, setPreviewSrc] = useState("");
    const [isRendering, setIsRendering] = useState(false);

    const baseUrl = useMemo(
        () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
        []
    );

    const clearPreview = () => {
        setPreviewSrc((previous) => {
            if (previous) {
                URL.revokeObjectURL(previous);
            }
            return "";
        });
    };

    const resetPreview = () => {
        clearPreview();
    };

    useEffect(() => {
        if (!activeFile) {
            clearPreview();
            return;
        }

        let cancelled = false;

        const file =activeFile;

        async function renderPreview() {
            setIsRendering(true);

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("page", String(pageNumber));
                formData.append("scale", "2.0");

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

                setPreviewSrc((previous) => {
                    if (previous) {
                        URL.revokeObjectURL(previous);
                    }
                    return URL.createObjectURL(blob);
                });
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
            if (previewSrc) {
                URL.revokeObjectURL(previewSrc);
            }
        };
    }, [previewSrc]);

    return {
        previewSrc,
        isRendering,
        clearPreview,
        resetPreview,
    };
}