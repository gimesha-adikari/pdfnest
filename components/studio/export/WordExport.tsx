"use client";

import { useState } from "react";
import { FileText, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import { handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";
import type { StudioExportProps, StudioExportResult } from "./PdfExport";

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function WordExport({ file, onExportedFile }: StudioExportProps) {
    const { requireAuth } = useAuth();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleExport = () => {
        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);

                const typedFile = file as FileWithPassword;
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile(
                    "/api/conversion/pdf-to-word",
                    formData
                );

                const result: StudioExportResult = {
                    blob: responseBlob,
                    fileName: file.name.replace(/\.pdf$/i, "") + ".docx",
                    mimeType:
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                };

                if (onExportedFile) {
                    await onExportedFile(result);
                } else {
                    downloadBlob(result.blob, result.fileName);
                }

                setSuccess(true);
                notify("Word export ready.","error");
            } catch (err) {
                if (err instanceof Error) {
                    if (err.message === "Network Error") {
                        notify("Unsupported file or network error","error");
                    } else {
                        console.error(err);
                        handleClientError(err);
                    }
                } else {
                    console.error(err);
                    handleClientError(err);
                }
            } finally {
                setIsProcessing(false);
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-border
            bg-(--background)/40 p-4">
                <div>
                    <p className="text-sm font-semibold text-foreground">
                        Word (.docx)
                    </p>
                    <p className="mt-1 text-xs text-muted">
                        Export the edited PDF as a Microsoft Word document.
                    </p>
                </div>
                <FileText size={32} className="text-indigo-500" />
            </div>

            {success && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30
                bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                    <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                    <div>
                        <p className="text-sm font-semibold">Word export complete!</p>
                        <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                            The converted Word file is ready.
                        </p>
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={handleExport}
                disabled={isProcessing}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl
                bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700
                disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {isProcessing ? "Exporting..." : "Export Word (.docx)"}
            </button>
        </div>
    );
}