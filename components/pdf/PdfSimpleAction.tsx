"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";

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
                                            title,
                                            description,
                                            icon,
                                            apiEndpoint,
                                            actionText,
                                            loadingText,
                                            successMessage
                                        }: PdfSimpleActionProps) {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleProcess = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);

                const responseBlob = await uploadAndDownloadFile(apiEndpoint, formData);

                const prefix = apiEndpoint.split('/').pop() || "processed";

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${prefix}_${file.name}`
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <div className="space-y-6 animate-in fade-in w-full">
            <PdfFileInfo file={file} onClear={() => {
                setFile(null);
                setSuccess(false);
                router.push(`/${toolId}`);
            }} />

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
    );
}