"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, FileText } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";
import {useAuth} from "@/context/AuthContext";

interface PdfSimpleActionProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    apiEndpoint: string;
    actionText: string;
    loadingText: string;
    successMessage: string;
}

export default function PdfSimpleAction({
                                            title, description, icon, apiEndpoint, actionText, loadingText, successMessage
                                        }: PdfSimpleActionProps) {
    const { requireAuth } = useAuth();

    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const onDrop = (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        setFile(acceptedFiles[0]);
        setSuccess(false);
    };

    const handleProcess = async () => {
        requireAuth(async () => {

            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);

                const responseBlob = await uploadAndDownloadFile(apiEndpoint, formData);

                const downloadUrl = window.URL.createObjectURL(responseBlob);
                const link = document.createElement("a");
                link.href = downloadUrl;

                const prefix = apiEndpoint.split('/').pop() || "processed";
                link.download = `${prefix}_${file.name}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);

                setSuccess(true);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    return (
        <PdfToolLayout>
            <PdfToolHero title={title} description={description} icon={icon} />

            <div className="mt-12 rounded-3xl border border-border bg-card p-8 shadow-lg max-w-4xl mx-auto">
                {!file ? (
                    <PdfUploader
                        onFilesAccepted={onDrop}
                        title={`Upload PDF to ${actionText}`}
                        description="Supports standard PDF documents"
                        multiple={false}
                        accept=".pdf"
                    />
                ) : (
                    <div className="space-y-6 animate-in fade-in">
                        <PdfFileInfo file={file} onClear={() => { setFile(null); setSuccess(false); }} />

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                <div>
                                    <p className="text-sm font-semibold">Processing Complete!</p>
                                    <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                        {successMessage}
                                    </p>
                                </div>
                            </div>
                        )}

                        <PdfActionButton
                            text={actionText}
                            loadingText={loadingText}
                            loading={isProcessing}
                            disabled={isProcessing}
                            onClick={handleProcess}
                        />
                    </div>
                )}
            </div>
            <PdfFeatures />
        </PdfToolLayout>
    );
}