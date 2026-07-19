"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function WordToPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!file) {
            setSuccess(false);
        }
    }, [file]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleConversionProcessing = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);

                const responseBlob = await uploadAndDownloadFile(
                    "/api/conversion/word-to-pdf",
                    formData
                );

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${file.name.replace(/\.(doc|docx)$/i, "")}.pdf`
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
                title="Convert Word to PDF"
                description="Transform Microsoft Word templates (.docx) into exact standardized document formats instantly."
                icon={<FileText size={32} className="text-blue-500" />}
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full max-w-4xl mx-auto">
                <div className="space-y-6">
                    <PdfFileInfo file={file} onClear={() => {
                        setFile(null);
                        router.push(`/${toolId}`);
                    }} />

                    <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/40 flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[color:var(--foreground)]">Format Conversion Staging Area</h3>
                            <p className="text-xs text-[color:var(--muted)] mt-0.5">Your office file will be compiled securely into a sanitized vector document on our backend container nodes.</p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                        <p className="text-sm text-[color:var(--muted)]">Source document template payload footprint</p>
                        <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                    </div>

                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Document schema generation complete!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    The Word text components and visual layouts have been bound and rendered into a unified layout structure successfully.
                                </p>
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text="Convert to PDF Format"
                        loadingText="Rendering Document Geometry Layers..."
                        loading={isProcessing}
                        disabled={isProcessing}
                        onClick={handleConversionProcessing}
                    />
                </div>
            </div>
        </>
    );
}