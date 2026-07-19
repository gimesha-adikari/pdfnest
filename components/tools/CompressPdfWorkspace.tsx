"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function CompressPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const originalSizeMB = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleCompression = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);

                const typedFile = file as FileWithPassword;
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/optimize/compress", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `optimized_${file.name}`
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Compress PDF"
                description="Reduce file sizes instantly by stripping redundancy parameters, unneeded object trees, and embedded system metadata fonts."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <div className="mt-8 space-y-6">
                    <PdfFileInfo file={file} onClear={() => {
                        setFile(null);
                        router.push(`/${toolId}`);
                    }} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Original file size</p>
                            <p className="mt-1 text-2xl font-bold text-red-500/90">{originalSizeMB} MB</p>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Status</p>
                            <p className="mt-1 text-2xl font-bold text-indigo-500">{success ? "Optimized" : "Ready"}</p>
                        </div>
                    </div>
                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Document optimization complete!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    File system weights were stripped cleanly via the native Go optimizer binary runtime.
                                </p>
                            </div>
                        </div>
                    )}
                    <PdfActionButton
                        text="Optimize and Compress PDF"
                        loadingText="Executing Object Stream Reductions..."
                        loading={isProcessing}
                        disabled={success}
                        onClick={handleCompression}
                    />
                </div>
            </div>
        </>
    );
}