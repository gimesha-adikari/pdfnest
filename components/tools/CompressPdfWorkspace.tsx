"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ShieldCheck,
    AlertTriangle,
    Check,
    Sparkles,
} from "lucide-react";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

type CompressionLevel = "low" | "medium" | "high";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CompressPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");
    const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>("medium");

    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [success, setSuccess] = useState(false);
    const [resultMetrics, setResultMetrics] = useState<{
        originalSize: number;
        compressedSize: number;
        reductionPercent: number;
        bytesSaved: number;
        zeroExpansionApplied: boolean;
        hasRasterLimitation?: boolean;
    } | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    const originalFormatted = useMemo(() => {
        if (!file) return "0 B";
        return formatBytes(file.size);
    }, [file]);

    const handleCancel = () => {
        if (!isProcessing || isCancelling) return;
        setIsCancelling(true);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        notify("Cancelling PDF compression...", "info");
    };

    const handleCompression = async () => {
        requireAuth(async () => {
            if (!file) return;

            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsProcessing(true);
            setProgress(5);
            setStatusMessage("Analyzing document structure & object streams...");
            setIsCancelling(false);
            setSuccess(false);
            setResultMetrics(null);

            try {
                const typedFile = file as FileWithPassword;
                const password = typedFile.originalPassword;

                const result = await ExecutionManager.run({
                    tool: "compress",
                    files: [file],
                    params: {
                        level: compressionLevel,
                    },
                    mode: processingMode,
                    password,
                    signal: controller.signal,
                    onProgress: (pct) => {
                        setProgress(pct);
                        if (pct < 30) {
                            setStatusMessage("Scanning document streams & xref tables...");
                        } else if (pct < 70) {
                            setStatusMessage("Applying structural compaction & stream deflation...");
                        } else {
                            setStatusMessage("Validating PDF integrity & catalog streams...");
                        }
                    },
                });

                const outputBlob = result.blob;
                const originalSize = (outputBlob as any).originalSize ?? file.size;
                const compressedSize = (outputBlob as any).compressedSize ?? outputBlob.size;
                const reductionPercent =
                    (outputBlob as any).reductionPercent ??
                    (originalSize > compressedSize
                        ? Math.round(((originalSize - compressedSize) / originalSize) * 1000) / 10
                        : 0);
                const bytesSaved = Math.max(0, originalSize - compressedSize);
                const zeroExpansionApplied =
                    (outputBlob as any).zeroExpansionApplied ?? compressedSize >= originalSize;
                const hasRasterLimitation = (outputBlob as any).hasRasterLimitation ?? false;

                setResultMetrics({
                    originalSize,
                    compressedSize,
                    reductionPercent,
                    bytesSaved,
                    zeroExpansionApplied,
                    hasRasterLimitation,
                });

                setDownloadData({
                    blob: outputBlob,
                    fileName: result.fileName || `compressed_${file.name}`,
                });

                setSuccess(true);
                notify(
                    zeroExpansionApplied
                        ? "Document already fully optimized."
                        : `PDF compressed by ${reductionPercent}%!`,
                    "success"
                );
                router.push(`/${toolId}/download`);
            } catch (err: any) {
                if (
                    err?.name === "AbortError" ||
                    err?.code === "USER_CANCELLATION" ||
                    err?.message?.toLowerCase().includes("cancel")
                ) {
                    notify("Compression cancelled.", "info");
                } else {
                    console.error("Compression error:", err);
                    handleClientError(err);
                }
            } finally {
                setIsProcessing(false);
                setIsCancelling(false);
                setProgress(0);
                setStatusMessage(null);
                abortControllerRef.current = null;
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Compress PDF"
                description="Optimize and shrink PDF documents instantly with lossless structural compaction and multi-level compression."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <div className="mt-8 space-y-6">
                    <PdfFileInfo
                        file={file}
                        onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }}
                    />

                    {/* Processing Mode Selector */}
                    <div className="pt-2">
                        <ProcessingModeSelector
                            mode={processingMode}
                            onChange={setProcessingMode}
                            disabled={isProcessing}
                        />
                    </div>

                    {/* Compression Level Selector */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-[color:var(--foreground)] flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            Compression Level
                        </label>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {/* LOW */}
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setCompressionLevel("low")}
                                className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all ${
                                    compressionLevel === "low"
                                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20"
                                        : "border-[color:var(--border)] hover:border-indigo-300 dark:hover:border-indigo-700 bg-transparent"
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="font-bold text-sm text-[color:var(--foreground)]">
                                        Low
                                    </span>
                                    {compressionLevel === "low" && (
                                        <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">
                                    Best quality · minimal size reduction
                                </p>
                                <span className="mt-3 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    100% Lossless
                                </span>
                            </button>

                            {/* MEDIUM */}
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setCompressionLevel("medium")}
                                className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all ${
                                    compressionLevel === "medium"
                                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20"
                                        : "border-[color:var(--border)] hover:border-indigo-300 dark:hover:border-indigo-700 bg-transparent"
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="font-bold text-sm text-[color:var(--foreground)]">
                                        Medium
                                    </span>
                                    {compressionLevel === "medium" && (
                                        <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">
                                    Balanced quality and file size
                                </p>
                                <span className="mt-3 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                                    Recommended
                                </span>
                            </button>

                            {/* HIGH */}
                            <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setCompressionLevel("high")}
                                className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all ${
                                    compressionLevel === "high"
                                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20"
                                        : "border-[color:var(--border)] hover:border-indigo-300 dark:hover:border-indigo-700 bg-transparent"
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="font-bold text-sm text-[color:var(--foreground)]">
                                        High
                                    </span>
                                    {compressionLevel === "high" && (
                                        <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">
                                    Smallest files · greater image quality loss
                                </p>
                                <span className="mt-3 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                    Max Reduction
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Notice for HIGH + Device Mode */}
                    {compressionLevel === "high" && processingMode === "device" && (
                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3">
                            <AlertTriangle className="text-amber-500 mt-0.5 shrink-0" size={18} />
                            <div className="text-xs space-y-1">
                                <p className="font-semibold">Local Execution Limitation</p>
                                <p className="text-amber-800/90 dark:text-amber-200/80">
                                    Device mode executes fast lossless structural optimization locally.
                                    Aggressive raster image downsampling (72 DPI) requires Cloud mode.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Live Progress Tracker */}
                    {isProcessing && (
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[var(--card)]">
                            <PdfProgressTracker
                                taskId="compress-task"
                                progress={progress}
                                status={statusMessage || "Optimizing PDF..."}
                                onCancel={handleCancel}
                                isCancelling={isCancelling}
                            />
                        </div>
                    )}

                    {/* File Size & Status Cards */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Original file size</p>
                            <p className="mt-1 text-2xl font-bold text-red-500/90">
                                {originalFormatted}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Status</p>
                            <p className="mt-1 text-2xl font-bold text-indigo-500">
                                {success ? "Optimized" : "Ready"}
                            </p>
                        </div>
                    </div>

                    {/* Success Notice with Real Metrics */}
                    {success && resultMetrics && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={20} />
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Document optimization complete!</p>
                                {resultMetrics.zeroExpansionApplied ? (
                                    <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                        This document was already fully optimized. Original file
                                        preserved without byte bloat.
                                    </p>
                                ) : (
                                    <p className="text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                        Reduced from {formatBytes(resultMetrics.originalSize)} to{" "}
                                        {formatBytes(resultMetrics.compressedSize)} (
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                            {resultMetrics.reductionPercent}% reduction
                                        </span>
                                        , saved {formatBytes(resultMetrics.bytesSaved)}).
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text="Optimize and Compress PDF"
                        loadingText="Optimizing PDF..."
                        loading={isProcessing}
                        disabled={isProcessing}
                        onClick={handleCompression}
                    />
                </div>
            </div>
        </>
    );
}