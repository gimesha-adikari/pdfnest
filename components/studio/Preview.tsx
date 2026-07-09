"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    RefreshCw,
    ZoomIn,
    ZoomOut,
} from "lucide-react";

export function StudioCanvasPreview({
                                        activeFile,
                                        pageNumber,
                                        totalPages,
                                        previewSrc,
                                        isScanning,
                                        isRendering,
                                        zoom,
                                        onZoomIn,
                                        onZoomOut,
                                        onZoomReset,
                                        onPrevPage,
                                        onNextPage,
                                    }: {
    activeFile: File | null;
    pageNumber: number;
    totalPages: number;
    previewSrc: string;
    isScanning: boolean;
    isRendering: boolean;
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onPrevPage: () => void;
    onNextPage: () => void;
}) {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        setNaturalSize({ width: 0, height: 0 });
    }, [previewSrc]);

    const handleImageLoad = () => {
        const img = imgRef.current;
        if (!img) return;

        setNaturalSize({
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
        });
    };

    const baseWidth = 850;
    const aspectRatio =
        naturalSize.width > 0 && naturalSize.height > 0
            ? naturalSize.height / naturalSize.width
            : 1.414; // fallback close to A4-ish ratio
    const baseHeight = Math.round(baseWidth * aspectRatio);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-4">
                <div>
                    <h2 className="text-sm font-bold text-[color:var(--foreground)]">
                        Document Canvas
                    </h2>
                    <p className="text-xs text-[color:var(--muted)]">
                        {activeFile ? activeFile.name : "No document loaded"}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onZoomOut}
                        className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:bg-[var(--card)]"
                    >
                        <ZoomOut size={14} />
                        Zoom out
                    </button>

                    <button
                        type="button"
                        onClick={onZoomReset}
                        className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:bg-[var(--card)]"
                    >
                        <RefreshCw size={14} />
                        {Math.round(zoom * 100)}%
                    </button>

                    <button
                        type="button"
                        onClick={onZoomIn}
                        className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:bg-[var(--card)]"
                    >
                        <ZoomIn size={14} />
                        Zoom in
                    </button>

                    <div className="mx-1 h-6 w-px bg-[color:var(--border)]" />

                    <button
                        type="button"
                        onClick={onPrevPage}
                        disabled={pageNumber <= 1}
                        className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)] disabled:opacity-30"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <button
                        type="button"
                        onClick={onNextPage}
                        disabled={pageNumber >= totalPages}
                        className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)] disabled:opacity-30"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="relative flex flex-1 overflow-hidden">
                {(isScanning || isRendering) && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/10 backdrop-blur-sm">
                        <div className="flex items-center gap-3 rounded-xl bg-[var(--card)] px-4 py-3 shadow-xl">
                            <Loader2 className="animate-spin text-indigo-500" size={18} />
                            {isScanning ? "Reading PDF..." : "Loading preview..."}
                        </div>
                    </div>
                )}

                <div className="absolute inset-0 overflow-auto">
                    <div className="flex min-h-full min-w-full items-start justify-center p-8 lg:p-10">
                        {previewSrc ? (
                            <div
                                className="relative shrink-0 rounded-lg bg-white shadow-2xl"
                                style={{
                                    width: `${baseWidth * zoom}px`,
                                    height: `${baseHeight * zoom}px`,
                                }}
                            >
                                <img
                                    ref={imgRef}
                                    src={previewSrc}
                                    alt={`Preview page ${pageNumber}`}
                                    onLoad={handleImageLoad}
                                    className="absolute inset-0 h-full w-full rounded-lg object-contain"
                                />
                            </div>
                        ) : (
                            <div className="flex min-h-[50vh] w-full items-center justify-center text-center text-sm text-[color:var(--muted)]">
                                <div>
                                    <FileText className="mx-auto mb-2" size={28} />
                                    Preview will appear here.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}