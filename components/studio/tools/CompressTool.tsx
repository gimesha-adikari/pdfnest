"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, FileBox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";

interface CompressToolProps {
    baseFile: File | null;
    onCompressedFile: (file: File) => Promise<void>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function CompressTool({ baseFile, onCompressedFile }: CompressToolProps) {
    const { requireAuth } = useAuth();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const originalSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return formatMB(baseFile.size);
    }, [baseFile]);

    const handleCompression = () => {
        if (!baseFile) return;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", baseFile);

                const typedFile = baseFile as FileWithPassword;
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/optimize/compress", formData);
                const compressedFile = new File(
                    [responseBlob],
                    `optimized_${baseFile.name}`,
                    { type: "application/pdf" }
                );

                await onCompressedFile(compressedFile);
                setSuccess(true);
                notify("Compressed PDF loaded back into Studio.");
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
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
                        Reduce file size by removing redundant objects and unused metadata.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[color:var(--background)]/40">
                        <p className="text-sm text-[color:var(--muted)]">Original file size</p>
                        <p className="mt-1 text-2xl font-bold text-red-500/90">{originalSizeMB} MB</p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[color:var(--background)]/40">
                        <p className="text-sm text-[color:var(--muted)]">Status</p>
                        <p className="mt-1 text-2xl font-bold text-indigo-500">
                            {success ? "Optimized" : "Ready"}
                        </p>
                    </div>
                </div>

                {success && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                        <div>
                            <p className="text-sm font-semibold">Document optimization complete!</p>
                            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                The compressed file has been loaded back into Studio.
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
