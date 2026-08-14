"use client";

import { ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";
import type { UseMarkupEditorResult } from "@/hooks/useMarkupEditor";
import MarkupBoxOverlay from "./MarkupBoxOverlay";

interface MarkupCanvasStageProps {
    editor: UseMarkupEditorResult;
    /** Classes for the drawing surface wrapper, so studio and workspace keep their own framing. */
    stageClassName?: string;
}

/**
 * Page navigation plus the interactive drawing surface: rendered PDF page (or
 * server-rendered preview for scanned pages) with the drawn markup boxes.
 */
export default function MarkupCanvasStage({ editor, stageClassName = "" }: MarkupCanvasStageProps) {
    const {
        config,
        canvasRef,
        containerRef,
        scaleFactor,
        currentPage,
        totalPages,
        goToPage,
        isRenderingCanvas,
        isScannedPage,
        scannedPreviewSrc,
        scannedPreviewLoading,
        currentPageBoxes,
        activeId,
        setActiveId,
        onPointerDown,
        onPointerMove,
        onPointerUp,
    } = editor;

    return (
        <>
            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-sm font-bold text-[color:var(--foreground)]">
                <span className="flex items-center gap-2">
                    <Eye size={16} className="text-indigo-500" /> {config.canvasTitle}
                </span>

                {totalPages > 0 && (
                    <div className="flex select-none items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted)]">
                        <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => goToPage(currentPage - 1)}
                            className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span>
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => goToPage(currentPage + 1)}
                            className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>

            <div
                className={`relative min-h-[420px] w-full rounded-xl border border-[color:var(--border)] bg-gray-500/5 p-4 dark:bg-black/20 ${stageClassName}`}
                onClick={() => setActiveId(null)}
            >
                {(isRenderingCanvas || scannedPreviewLoading) && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-[color:var(--background)]/40 text-xs font-medium text-[color:var(--muted)] backdrop-blur-sm">
                        <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                        {isScannedPage ? "Loading scanned preview..." : "Synchronizing view matrix framework..."}
                    </div>
                )}

                <div
                    ref={containerRef}
                    className="relative inline-block max-w-none cursor-crosshair overflow-hidden rounded border border-gray-400/20 bg-white shadow-xl select-none touch-none"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onClick={(e) => e.stopPropagation()}
                >
                    <canvas
                        ref={canvasRef}
                        className={`block h-auto max-w-full rounded pointer-events-none ${
                            isScannedPage ? "opacity-0" : "opacity-100"
                        }`}
                    />

                    {isScannedPage && scannedPreviewSrc && (
                        <img
                            src={scannedPreviewSrc}
                            alt={`Scanned page preview ${currentPage}`}
                            className="pointer-events-none absolute inset-0 h-full w-full rounded object-contain"
                        />
                    )}

                    {isScannedPage && !scannedPreviewSrc && (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-[color:var(--muted)]">
                            Preparing scanned preview...
                        </div>
                    )}

                    {currentPageBoxes.map((box) => (
                        <MarkupBoxOverlay
                            key={box.id}
                            box={box}
                            isActive={activeId === box.id}
                            scaleFactor={scaleFactor}
                            overlayStyle={config.overlayStyle}
                            onSelect={() => setActiveId(box.id)}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}
