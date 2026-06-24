"use client";

import {useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {FileText, Loader2, ShieldCheck} from "lucide-react";
import {uploadAndDownloadFile} from "@/lib/api";
import {getFriendlyErrorMessage} from "@/lib/errorHandler";
import {useSharedTool} from "@/app/[toolId]/layout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import {notify} from "@/lib/notify";
import {FileWithPassword} from "@/lib/types";
import {useAuth} from "@/context/AuthContext";

interface OfficeConverterProps {
    targetFormat: "docx" | "xlsx" | "pptx";
    title: string;
    description: string;
    icon: React.ReactNode;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function OfficeConverter({targetFormat, title, description, icon}: OfficeConverterProps) {
    const {requireAuth} = useAuth();
    const router = useRouter();
    const {toolId, file, setFile, setDownloadData} = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const formatLabel = useMemo(() => {
        if (targetFormat === "docx") return "Word (.docx)";
        if (targetFormat === "xlsx") return "Excel (.xlsx)";
        return "PowerPoint (.pptx)";
    }, [targetFormat]);

    const apiEndpoint = useMemo(() => {
        const type = targetFormat === "docx" ? "word" : targetFormat === "xlsx" ? "excel" : "powerpoint";
        return `/api/conversion/pdf-to-${type}`;
    }, [targetFormat]);

    const handleConversion = async () => {
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

                const responseBlob = await uploadAndDownloadFile(apiEndpoint, formData);

                const baseName = file.name.replace(/\.pdf$/i, "");

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${baseName}.${targetFormat}`
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                if (err instanceof Error){
                    const error = (err as Error)
                    if (error.message == "Network Error") {
                        notify("Unsupported File or Network Error")
                    }else {
                        console.error(err)
                        notify(getFriendlyErrorMessage(err));
                    }
                }else{
                    console.error(err)
                    notify(getFriendlyErrorMessage(err));
                }
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 w-full animate-in fade-in">
            {/* Control Panel Column */}
            <div className="lg:col-span-5 space-y-6">
                <PdfFileInfo file={file} onClear={() => {
                    setFile(null);
                    setSuccess(false);
                    router.push(`/${toolId}`);
                }}/>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                        <p className="text-sm text-[color:var(--muted)]">Source document weight</p>
                        <p className="mt-1 text-2xl font-bold">{fileExtractedSize} MB</p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                        <p className="text-sm text-[color:var(--muted)]">Target office syntax</p>
                        <p className="mt-1 text-md font-bold text-indigo-500">{formatLabel}</p>
                    </div>
                </div>

                {success && (
                    <div
                        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3 animate-in fade-in duration-200">
                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18}/>
                        <div>
                            <p className="text-sm font-semibold">Conversion pipeline success!</p>
                            <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                The typography coordinate grids were mapped safely and transformed to native elements.
                            </p>
                        </div>
                    </div>
                )}

                <PdfActionButton
                    text={`Convert PDF to ${targetFormat.toUpperCase()}`}
                    loadingText="Deconstructing Layout Matrices..."
                    loading={isProcessing}
                    disabled={isProcessing}
                    onClick={handleConversion}
                />
            </div>

            {/* Status Visualization Block */}
            <div
                className="lg:col-span-7 flex flex-col items-center justify-center bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-8 text-center min-h-[260px] relative overflow-hidden">
                {isProcessing ? (
                    <div
                        className="space-y-3 flex flex-col items-center justify-center text-[color:var(--muted)] animate-pulse">
                        <Loader2 className="animate-spin text-indigo-500 mb-1" size={32}/>
                        <p className="text-sm font-bold text-[color:var(--foreground)]">Invoking Formatting
                            Subprocesses...</p>
                        <p className="text-xs max-w-xs mx-auto">Rebuilding paragraphs, calculating grid bounds, and
                            compiling structural object tracks.</p>
                    </div>
                ) : (
                    <div className="space-y-4 text-[color:var(--muted)] flex flex-col items-center">
                        <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                            <FileText size={32}/>
                        </div>
                        <div>
                            <h4 className="text-md font-bold text-[color:var(--foreground)]">Ready for Extraction
                                Pipeline</h4>
                            <p className="text-xs mt-1 max-w-sm mx-auto">
                                Executing this module maps visual tables and multi-font flow channels safely into native
                                workspace element attributes.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}