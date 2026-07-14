"use client";

import {useMemo, useState} from "react";
import {ShieldCheck, Wrench} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import {uploadAndDownloadFile} from "@/lib/api";
import {handleClientError} from "@/lib/errorHandler";
import {notify} from "@/lib/notify";
import {FileWithPassword} from "@/lib/types";

interface RepairToolProps {
    baseFile: File | null;
    onProcessedFile: (file: File) => Promise<void>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function RepairTool({
                                       baseFile,
                                       onProcessedFile,
                                   }: RepairToolProps) {
    const {requireAuth} = useAuth();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const originalSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return formatMB(baseFile.size);
    }, [baseFile]);

    const handleProcess = () => {
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

                const responseBlob = await uploadAndDownloadFile("/api/structure/repair", formData);

                const processedFile = new File(
                    [responseBlob],
                    `repaired_${baseFile.name}`,
                    {type: "application/pdf"}
                );

                await onProcessedFile(processedFile);
                setSuccess(true);
                notify("Repaired PDF loaded back into Studio.","success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted">
                <p>Select or upload a PDF to start.</p>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-4">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                        Repair Corrupt PDF
                    </h3>
                    <p className="text-xs text-muted">
                        Rebuild broken dictionary trees and fix damaged PDF files so they can be opened again.
                    </p>
                </div>

                <div
                    className="flex items-start justify-between gap-3 rounded-2xl border border-border
                     bg-(--background)/40 p-4">
                    <div>
                        <p className="text-sm font-semibold text-foreground">Current document</p>
                        <p className="mt-1 max-w-55 truncate text-xs text-muted">
                            {baseFile.name}
                        </p>
                    </div>
                    <div
                        className="shrink-0 rounded-full border border-border bg-card p-3 text-muted">
                        <Wrench size={32} className="text-blue-500"/>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div
                        className="rounded-2xl border border-border p-4 bg-(--background)/40">
                        <p className="text-sm text-muted">Original file size</p>
                        <p className="mt-1 text-2xl font-bold text-red-500/90">{originalSizeMB} MB</p>
                    </div>
                    <div
                        className="rounded-2xl border border-border p-4 bg-(--background)/40">
                        <p className="text-sm text-muted">Status</p>
                        <p className="mt-1 text-2xl font-bold text-indigo-500">
                            {success ? "Repaired" : "Ready"}
                        </p>
                    </div>
                </div>

                {success && (
                    <div
                        className="flex items-start gap-3 rounded-2xl border border-emerald-500/30
                        bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={18}/>
                        <div>
                            <p className="text-sm font-semibold">Document repair complete!</p>
                            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                The repaired file has been loaded back into Studio.
                            </p>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4
                    py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed
                    disabled:opacity-50"
                >
                    {isProcessing ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"/>
                    ) : null}
                    Repair PDF Document
                </button>
            </div>
        </div>
    );
}