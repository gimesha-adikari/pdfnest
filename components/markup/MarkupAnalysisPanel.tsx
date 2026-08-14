"use client";

import { Loader2, MousePointer2, ScanText, Sparkles } from "lucide-react";
import type { UseMarkupEditorResult } from "@/hooks/useMarkupEditor";
import { prettyKind } from "@/lib/markup/types";

/**
 * Analysis feedback for the current page: progress, failures and the
 * text/scanned verdict with its mode shortcuts.
 */
export default function MarkupAnalysisPanel({ editor }: { editor: UseMarkupEditorResult }) {
    const {
        config,
        isAnalyzing,
        analysisError,
        analysisLoaded,
        currentPageAnalysis,
        currentPage,
        pageKind,
        isScannedPage,
        isTextPage,
        isMixedPage,
        mode,
        setMode,
    } = editor;

    return (
        <>
            {isAnalyzing && (
                <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                    <Loader2 className="mt-0.5 animate-spin text-indigo-500" size={16} />
                    <div className="text-xs text-[color:var(--foreground)]/90">
                        <p className="font-semibold">Analyzing page structure...</p>
                        <p className="mt-0.5 text-[color:var(--muted)]">{config.analysisHint}</p>
                    </div>
                </div>
            )}

            {analysisError && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-semibold">Analysis unavailable</p>
                    <p className="mt-0.5 opacity-80">{analysisError}</p>
                </div>
            )}

            {analysisLoaded && currentPageAnalysis && (
                <div
                    className={`rounded-xl border p-4 ${
                        isScannedPage
                            ? "border-amber-500/20 bg-amber-500/10"
                            : "border-emerald-500/20 bg-emerald-500/10"
                    }`}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            {isScannedPage ? (
                                <ScanText className="mt-0.5 text-amber-600" size={18} />
                            ) : (
                                <Sparkles className="mt-0.5 text-emerald-500" size={18} />
                            )}
                            <div className="text-xs">
                                <p className="font-semibold">
                                    Page {currentPage} is {prettyKind(pageKind)}
                                </p>
                                <p className="mt-0.5 opacity-80">
                                    {isScannedPage
                                        ? `This page has no selectable text. Choose ${config.manualModeLabel} or Recognize Text.`
                                        : isMixedPage
                                            ? `Could be scanned document. ${config.manualModeLabel} or Recognize Text is recommended.`
                                            : isTextPage
                                                ? "Selectable text detected. Smart mode is recommended."
                                                : "No clear text structure detected on this page."}
                                </p>
                            </div>
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                            {currentPageAnalysis.wordCount} words
                        </div>
                    </div>

                    {(isScannedPage || isMixedPage) && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setMode("manual")}
                                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                    mode === "manual"
                                        ? "border-indigo-500 bg-indigo-500 text-white"
                                        : "border-[color:var(--border)] bg-white/60 hover:border-indigo-500 dark:bg-black/10"
                                }`}
                            >
                                <MousePointer2 size={14} />
                                {config.manualModeLabel}
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("ocr")}
                                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                    mode === "ocr"
                                        ? "border-indigo-500 bg-indigo-500 text-white"
                                        : "border-[color:var(--border)] bg-white/60 hover:border-indigo-500 dark:bg-black/10"
                                }`}
                            >
                                <ScanText size={14} />
                                Recognize Text
                            </button>
                        </div>
                    )}

                    {isTextPage && (
                        <div className="mt-3 text-[10px] text-[color:var(--muted)]">
                            Smart mode will use native text before any fallback behavior.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
