"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench, ShieldCheck, CheckCircle2 } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import type { ProcessingMode } from "@/lib/execution/types";

export default function RepairPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

    const handleRepairDocument = async () => {
        requireAuth(async () => {
            if (!file) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const result = await ExecutionManager.run({
                    tool: "repair",
                    files: [file],
                    mode: processingMode,
                    password: (file as any).originalPassword,
                });

                setDownloadData({
                    blob: result.blob,
                    fileName: result.fileName,
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err: any) {
                notify(getFriendlyErrorMessage(err) || "Failed to repair document structure.", "error");
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <div className="space-y-6 animate-in fade-in w-full max-w-4xl mx-auto">
            <PdfToolHero
                title="Repair Corrupt PDF"
                description="Rebuild broken dictionary trees, reconstruct xref tables, and fix damaged PDF files so they can be opened cleanly."
                icon={<Wrench size={32} className="text-blue-500" />}
            />

            <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 md:p-8 shadow-lg space-y-6">
                <PdfFileInfo
                    file={file}
                    onClear={() => {
                        setFile(null);
                        setSuccess(false);
                        router.push(`/${toolId}`);
                    }}
                />

                <div className="border-t border-[color:var(--border)] pt-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                        Execution Mode Settings
                    </h3>
                    <ProcessingModeSelector
                        mode={processingMode}
                        onChange={setProcessingMode}
                        disabled={isProcessing}
                    />
                </div>

                {success && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                        <CheckCircle2 className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                        <div>
                            <p className="text-sm font-semibold">Document Structure Repaired!</p>
                            <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                All cross-reference tables and dictionary tree layouts have been successfully rewritten.
                            </p>
                        </div>
                    </div>
                )}

                <PdfActionButton
                    text="Repair PDF Document"
                    loadingText="Rebuilding xref tables..."
                    loading={isProcessing}
                    disabled={isProcessing}
                    onClick={handleRepairDocument}
                />
            </div>
        </div>
    );
}