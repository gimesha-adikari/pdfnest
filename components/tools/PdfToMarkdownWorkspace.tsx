"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    FileText,
    FileCode2,
    ArrowRight,
    Sparkles,
    Check,
    AlertTriangle,
    RotateCcw,
    X,
    Loader2,
    Braces,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { notify } from "@/lib/notify";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { useAsyncTask } from "@/hooks/useAsyncTask";

export default function PdfToMarkdownWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const currentFileRef = useRef<File | null>(file);
    useEffect(() => {
        if (file) {
            currentFileRef.current = file;
        }
    }, [file]);

    const handleTaskComplete = async (downloadUrl: string) => {
        try {
            const res = await fetch(downloadUrl, { credentials: "include" });
            if (res.ok) {
                const responseBlob = await res.blob();
                const activeFile = currentFileRef.current || file;
                const stem = activeFile?.name ? activeFile.name.replace(/\.pdf$/i, "") : "document";
                const mdDownloadName = `${stem}.md`;

                setDownloadData({
                    blob: responseBlob,
                    fileName: mdDownloadName,
                });

                notify("PDF successfully converted to Markdown!", "success");
                router.push(`/${toolId}/download`);
            } else {
                notify("Failed to download converted Markdown artifact.", "error");
            }
        } catch (err: any) {
            notify("Error fetching completed Markdown output.", "error");
        }
    };

    const {
        taskId,
        submitTask,
        isSubmitting,
        progress,
        status,
        error,
        cancelTask,
        isCancelling,
        resetTask,
    } = useAsyncTask("pdf-to-markdown", handleTaskComplete);

    const handleConvert = async () => {
        if (!file) return;
        resetTask();

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("lang", "eng");

            const typedFile = file as any;
            if (typedFile.originalPassword) {
                formData.append("password", typedFile.originalPassword);
                formData.append("file_password", typedFile.originalPassword);
            }

            await submitTask("/api/conversion/pdf-to-markdown-async", formData);
        } catch (err: any) {
            notify(err?.message || "PDF to Markdown conversion failed.", "error");
        }
    };

    const handleClearOrReset = () => {
        resetTask();
        setFile(null);
        setDownloadData(null);
        router.push(`/${toolId}`);
    };

    if (!file) {
        return (
            <PdfToolHero
                title="Convert PDF to Markdown"
                description="Convert PDF documents into clean, formatted GitHub-Flavored Markdown text."
            />
        );
    }

    const isPolling = isSubmitting || status === "PENDING" || status === "PROCESSING";

    return (
        <div className="w-full max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-8 min-h-[520px] flex flex-col justify-center">
            {/* 1. Selected Document Card Panel */}
            <div className="bg-card border border-[color:var(--border)] rounded-2xl p-5 md:p-6 shadow-sm relative overflow-hidden transition-all">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[color:var(--border)]/60">
                    <div className="flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                            Document Ready
                        </span>
                    </div>
                    <span className="text-xs font-medium text-[color:var(--muted)] bg-zinc-800/50 dark:bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-700/40">
                        PDF Input
                    </span>
                </div>

                <PdfFileInfo file={file} onClear={handleClearOrReset} />
            </div>

            {/* 2. Conversion Visual Transformation Node */}
            {!isPolling && (
                <div className="bg-gradient-to-br from-zinc-900/80 via-zinc-900/40 to-zinc-900/80 border border-[color:var(--border)] rounded-2xl p-6 shadow-md relative">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        {/* Source Format */}
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-[color:var(--foreground)]">
                                    PDF Document
                                </h4>
                                <p className="text-xs text-[color:var(--muted)] mt-0.5">
                                    Source binary document
                                </p>
                            </div>
                        </div>

                        {/* Arrow Transformation Connector */}
                        <div className="flex items-center justify-center my-1 md:my-0">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                                <ArrowRight size={18} className="hidden md:block" />
                                <ArrowRight size={18} className="block md:hidden rotate-90" />
                            </div>
                        </div>

                        {/* Target Format */}
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                <FileCode2 size={24} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-[color:var(--foreground)]">
                                    Markdown Output
                                </h4>
                                <p className="text-xs text-[color:var(--muted)] mt-0.5">
                                    GitHub-Flavored (.md)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Primary Action Button */}
                    <div className="mt-8">
                        <PdfActionButton
                            onClick={handleConvert}
                            loading={isSubmitting}
                            disabled={isSubmitting}
                            text="Convert to Markdown"
                            loadingText="Converting to Markdown..."
                        />
                    </div>

                    {/* Subtle Capability Hints */}
                    <div className="mt-6 pt-4 border-t border-[color:var(--border)]/40 flex flex-wrap items-center justify-center gap-4 text-xs text-[color:var(--muted)]">
                        <span className="flex items-center gap-1.5">
                            <Check size={14} className="text-emerald-500" />
                            GitHub-Flavored Markdown
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Check size={14} className="text-emerald-500" />
                            Structured layout extraction
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Check size={14} className="text-emerald-500" />
                            Preserves document hierarchy
                        </span>
                    </div>
                </div>
            )}

            {/* 3. Dedicated Error Card Panel */}
            {error && !isPolling && (
                <div
                    data-testid="pdf-to-markdown-error-banner"
                    className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 md:p-6 text-red-400 space-y-4 shadow-sm"
                >
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0 mt-0.5">
                            <AlertTriangle size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-red-300">
                                Conversion couldn&apos;t be completed
                            </h4>
                            <p className="text-sm text-red-200/90 mt-1 leading-relaxed">
                                {error}
                            </p>
                            <p className="text-xs text-red-300/70 mt-2">
                                Your PDF file remains safely loaded in the workspace.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2 border-t border-red-500/20">
                        <button
                            type="button"
                            onClick={handleConvert}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all shadow-sm"
                        >
                            <RotateCcw size={14} />
                            Try Again
                        </button>
                        <button
                            type="button"
                            onClick={handleClearOrReset}
                            className="px-4 py-2 text-xs font-medium text-red-300/80 hover:text-red-200 transition-colors"
                        >
                            Remove File
                        </button>
                    </div>
                </div>
            )}

            {/* 4. Dedicated Processing State Panel */}
            {isPolling && (
                <div className="bg-card border border-[color:var(--border)] rounded-2xl p-6 md:p-8 space-y-6 shadow-md relative overflow-hidden">
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                            <FileText size={28} className="text-indigo-400 animate-pulse" />
                            <div className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-purple-600 text-white shadow-sm">
                                <Braces size={14} />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-base font-semibold text-[color:var(--foreground)]">
                                Converting your document
                            </h3>
                            <p className="text-xs text-[color:var(--muted)] mt-1">
                                {status === "PENDING"
                                    ? "Preparing document for conversion..."
                                    : "Extracting structure and generating Markdown..."}
                            </p>
                        </div>
                    </div>

                    {/* Progress Bar & Percentage */}
                    <div className="space-y-2 max-w-md mx-auto">
                        <div className="flex items-center justify-between text-xs text-[color:var(--muted)] font-medium">
                            <span>Processing task</span>
                            <span className="text-[color:var(--foreground)] font-semibold">
                                {progress || 0}%
                            </span>
                        </div>
                        <div className="w-full h-2.5 bg-zinc-800/80 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
                            />
                        </div>
                    </div>

                    {/* Secondary Cancel Action */}
                    <div className="flex justify-center pt-2">
                        <button
                            type="button"
                            onClick={cancelTask}
                            disabled={isCancelling}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-[color:var(--muted)] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-50"
                        >
                            {isCancelling ? (
                                <>
                                    <Loader2 size={14} className="animate-spin text-amber-500" />
                                    Cancelling conversion...
                                </>
                            ) : (
                                <>
                                    <X size={14} />
                                    Cancel conversion
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
