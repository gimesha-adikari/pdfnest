"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, FileBox, Sparkles, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";

interface CompressToolProps {
    baseFile: File | null;
    onCompressedFile: (file: File) => Promise<void>;
}

type CompressionLevel = "low" | "medium" | "high";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CompressTool({ baseFile, onCompressedFile }: CompressToolProps) {
    const { requireAuth } = useAuth();

    const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>("medium");
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [reductionInfo, setReductionInfo] = useState<string | null>(null);

    const originalFormatted = useMemo(() => {
        if (!baseFile) return "0 B";
        return formatBytes(baseFile.size);
    }, [baseFile]);

    const handleCompression = () => {
        if (!baseFile) return;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);
                setReductionInfo(null);

                const typedFile = baseFile as FileWithPassword;
                const password = typedFile.originalPassword;

                const result = await ExecutionManager.run({
                    tool: "compress",
                    files: [baseFile],
                    params: { level: compressionLevel },
                    mode: "auto",
                    password,
                });

                const compressedFile = new File(
                    [result.blob],
                    `optimized_${baseFile.name}`,
                    { type: "application/pdf" }
                );

                const origSz = baseFile.size;
                const compSz = compressedFile.size;
                const pct = origSz > compSz ? Math.round(((origSz - compSz) / origSz) * 1000) / 10 : 0;
                setReductionInfo(
                    pct > 0
                        ? `Reduced by ${pct}% (${formatBytes(origSz)} → ${formatBytes(compSz)})`
                        : "Already fully optimized"
                );

                await onCompressedFile(compressedFile);
                setSuccess(true);
                notify("Compressed PDF loaded back into Studio.", "success");
            } catch (err) {
                console.error("Studio compress error:", err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-6 text-sm text-[color:var(--muted)]">
                <div className="text-center">
                    <FileBox size={18} className="mx-auto mb-2 opacity-60" />
                    <p>Select or upload a PDF to start.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-4">
            <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-4 shadow-sm">
                <div>
                    <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
                        Compress PDF
                    </h3>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">
                        Reduce file size with lossless structural compaction and multi-level optimization.
                    </p>
                </div>

                {/* Level selector */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-[color:var(--foreground)] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        Compression Level
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {(["low", "medium", "high"] as CompressionLevel[]).map((lvl) => (
                            <button
                                key={lvl}
                                type="button"
                                disabled={isProcessing}
                                onClick={() => setCompressionLevel(lvl)}
                                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                                    compressionLevel === lvl
                                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/20"
                                        : "border-[color:var(--border)] hover:border-indigo-300 dark:hover:border-indigo-700 bg-transparent"
                                }`}
                            >
                                <span className="text-xs font-bold capitalize text-[color:var(--foreground)]">
                                    {lvl}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--border)] p-3 bg-[color:var(--background)]/40">
                        <p className="text-xs text-[color:var(--muted)]">Original file size</p>
                        <p className="mt-1 text-lg font-bold text-red-500/90">{originalFormatted}</p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--border)] p-3 bg-[color:var(--background)]/40">
                        <p className="text-xs text-[color:var(--muted)]">Status</p>
                        <p className="mt-1 text-lg font-bold text-indigo-500">
                            {success ? "Optimized" : "Ready"}
                        </p>
                    </div>
                </div>

                {success && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                        <div>
                            <p className="text-xs font-semibold">Optimization complete!</p>
                            <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-200/70">
                                {reductionInfo || "Loaded back into Studio."}
                            </p>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleCompression}
                    disabled={isProcessing}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isProcessing ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : null}
                    Optimize and Compress PDF
                </button>
            </div>
        </div>
    );
}
