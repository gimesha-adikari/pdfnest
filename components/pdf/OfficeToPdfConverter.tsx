"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileText, ShieldCheck, Loader2 } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {handleClientError} from "@/lib/errorHandler";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";

interface OfficeToPdfConverterProps {
    sourceType: "word" | "excel" | "powerpoint";
    allowedExtensions: string;
    title: string;
    description: string;
    icon: React.ReactNode;
}

export default function OfficeToPdfConverter({
                                                 sourceType,
                                                 allowedExtensions,
                                                 title,
                                                 description,
                                                 icon
                                             }: OfficeToPdfConverterProps) {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const generateLiveOfficePreview = async (targetFile: File) => {
        try {
            setIsPreviewLoading(true);
            const formData = new FormData();
            formData.append("file", targetFile);

            const responseBlob = await uploadAndDownloadFile("/api/conversion/preview/page", formData);
            const blobUrl = URL.createObjectURL(responseBlob);
            setPreviewUrl(blobUrl);
        } catch (err) {
            console.error("Preview sub-system bypass:", err);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleConversion = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setUploadProgress(10);

                const formData = new FormData();
                formData.append("file", file);

                const progressTimer = setInterval(() => {
                    setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
                }, 150);

                const apiEndpoint = `/api/conversion/${sourceType}-to-pdf`;
                const responseBlob = await uploadAndDownloadFile(apiEndpoint, formData);

                clearInterval(progressTimer);
                setUploadProgress(100);

                const baseName = file.name.substring(0, file.name.lastIndexOf("."));

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${baseName}.pdf`
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

    const clearWorkspace = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(null);
        setPreviewUrl(null);
        setSuccess(false);
        setUploadProgress(0);
        router.push(`/${toolId}`);
    };

    if (!file) return null;

    return (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
            {/* Interactive Left Column */}
            <div className="lg:col-span-5 space-y-6">
                <PdfFileInfo file={file} onClear={clearWorkspace} />

                {success && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                        <div>
                            <p className="text-sm font-semibold">Document compiled perfectly!</p>
                            <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                The document structure layout arrays were safely flattened into standard PDF syntax.
                            </p>
                        </div>
                    </div>
                )}

                <PdfActionButton
                    text="Convert to PDF"
                    loadingText="Processing Layout Anchors..."
                    loading={isProcessing}
                    disabled={isProcessing}
                    onClick={handleConversion}
                />
            </div>

            {/* Rendering Centerstage Preview Frame */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-dashed border-[color:var(--border)] rounded-2xl p-4 text-center min-h-[340px] relative overflow-hidden">
                {isPreviewLoading && (
                    <div className="absolute inset-0 bg-[var(--card)]/80 flex flex-col items-center justify-center gap-2 z-10">
                        <Loader2 className="animate-spin text-indigo-500" size={24} />
                        <p className="text-xs font-medium text-[color:var(--muted)]">Generating canvas view tracks...</p>
                    </div>
                )}

                {isProcessing && (
                    <div className="absolute inset-0 bg-[var(--card)]/90 flex flex-col items-center justify-center gap-3 z-20 p-6 animate-in fade-in">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs font-semibold text-[color:var(--muted)]">
                            {uploadProgress < 90 ? `Streaming Document Tracks (${uploadProgress}%)` : "Invoking Server-Side Office Subprocesses..."}
                        </p>
                    </div>
                )}

                {previewUrl ? (
                    <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                        <img src={previewUrl} alt="Office Document Layout Preview" className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl" />
                    </div>
                ) : (
                    <div className="text-center p-8 space-y-2">
                        <FileText size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                        <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging area empty. Drop an active office layout frame onto the left workspace dashboard. </p>
                    </div>
                )}
            </div>
        </div>
    );
}