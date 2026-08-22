import React from "react";
import { Evidence, EpistemicConfidence } from "../../../types/analyzer";
import { ShieldCheck, ShieldAlert, ShieldQuestion, FileCode, CheckCircle2, X } from "lucide-react";

interface EvidenceExplorerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    evidenceList: Evidence[];
    negativeAssertions?: string[];
}

export default function EvidenceExplorer({
    isOpen,
    onClose,
    title,
    evidenceList,
    negativeAssertions = [],
}: EvidenceExplorerProps) {
    if (!isOpen) return null;

    const getConfidenceIcon = (confidence: EpistemicConfidence) => {
        switch (confidence) {
            case "CONFIRMED":
                return <ShieldCheck className="text-emerald-500" size={16} />;
            case "STRONGLY_INFERRED":
                return <ShieldAlert className="text-amber-500" size={16} />;
            case "WEAKLY_INFERRED":
                return <ShieldQuestion className="text-rose-500" size={16} />;
            default:
                return <ShieldQuestion className="text-gray-500" size={16} />;
        }
    };

    const getConfidenceColor = (confidence: EpistemicConfidence) => {
        switch (confidence) {
            case "CONFIRMED":
                return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            case "STRONGLY_INFERRED":
                return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
            case "WEAKLY_INFERRED":
                return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
            default:
                return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20";
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="flex w-full max-w-2xl flex-col max-h-[85vh] rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--border)] p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
                            <FileCode size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                Evidence Explorer
                            </h3>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                Inspecting: <span className="font-semibold text-[color:var(--foreground)]">{title}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-[color:var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[color:var(--foreground)] transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Negative Assertions */}
                    {negativeAssertions && negativeAssertions.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)] flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500" />
                                Passed Negative Assertions
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {negativeAssertions.map((assertion, idx) => (
                                    <span key={idx} className="inline-flex items-center rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                        {assertion}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Evidence List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                                Collected Evidence ({evidenceList.length})
                            </h4>
                        </div>
                        
                        {evidenceList.length === 0 ? (
                            <p className="text-sm text-[color:var(--muted-foreground)] italic p-4 text-center rounded-xl border border-dashed border-[color:var(--border)]">
                                No specific evidence trails provided.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {evidenceList.map((ev) => (
                                    <div
                                        key={ev.id}
                                        className="flex flex-col rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getConfidenceColor(ev.confidence)}`}>
                                                        {getConfidenceIcon(ev.confidence)}
                                                        {ev.confidence.replace("_", " ")}
                                                    </span>
                                                    <span className="rounded-md bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--primary)] uppercase">
                                                        {ev.detector}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-[color:var(--foreground)]">
                                                    {ev.description}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)] p-3">
                                            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-[color:var(--muted-foreground)]">
                                                <FileCode size={12} />
                                                <span className="truncate">{ev.filePath}</span>
                                                {ev.lineStart && (
                                                    <span className="shrink-0">
                                                        :{ev.lineStart}{ev.lineEnd && ev.lineEnd !== ev.lineStart ? `-${ev.lineEnd}` : ""}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Note: snippet is not natively on the Evidence type in analyzer.ts (only in EvidenceItem which is older), but if it exists we show it, else we just show the fact */}
                                            {ev.symbol && (
                                                <div className="text-[11px] font-mono bg-[var(--accent)] p-2 rounded text-[color:var(--foreground)]">
                                                    Symbol: {ev.symbol}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
