"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, ShieldCheck } from "lucide-react";
import { getFriendlyErrorMessage, handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PageReorderGrid from "@/components/pdf/PageReorderGrid";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { FileWithPassword } from "@/lib/types";

import { usePreviews } from "@/lib/preview/usePreviews";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

export default function ReorderPagesWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pageOrder, setPageOrder] = useState<number[]>([]);
    const [pageCount, setPageCount] = useState<number>(0);
    const [isLoadingElements, setIsLoadingElements] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");


    useEffect(() => {
        if (!file) {
            setPageOrder([]);
            setPageCount(0);
            return;
        }

        const loadPdfPages = async () => {
            setIsLoadingElements(true);
            setSuccess(false);

            let loadingTask: any = null;
            let pdf: any = null;
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);

                loadingTask = pdfjsLib.getDocument({ data: typedArray });
                pdf = await loadingTask.promise;
                const totalPages = pdf.numPages;

                setPageCount(totalPages);
                const dynamicOrderArray = Array.from({ length: totalPages }, (_, i) => i + 1);
                setPageOrder(dynamicOrderArray);
            } catch (error) {
                console.error("Root Document Processing Exception:", error);
                notify("Could not load document preview grids.", "error");
            } finally {
                if (pdf && typeof pdf.destroy === "function") {
                    try { pdf.destroy(); } catch {}
                }
                if (loadingTask && typeof loadingTask.destroy === "function") {
                    try { loadingTask.destroy(); } catch {}
                }
                setIsLoadingElements(false);
            }
        };

        loadPdfPages();
    }, [file]);

    const handleReorderSubmission = async () => {
        requireAuth(async () => {
            if (!file || pageOrder.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const typedFile = file as FileWithPassword;
                const result = await ExecutionManager.run({
                    tool: "reorder",
                    files: [file],
                    params: { sequence: pageOrder.join(",") },
                    mode: processingMode,
                    password: typedFile.originalPassword,
                });

                setDownloadData({
                    blob: result.blob,
                    fileName: result.fileName,
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
                title="Rearrange PDF Pages"
                description="Drag, drop, and shuffle pages visually to reorder your document structures flawlessly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                {isLoadingElements ? (
                    <div className="flex flex-col items-center justify-center py-20 text-[color:var(--muted)]">
                        <Loader2 className="animate-spin mb-3 text-indigo-500" size={32} />
                        <p className="text-sm font-medium">Deconstructing document into visual page layouts...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <PdfFileInfo file={file} onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }} />

                        <ProcessingModeSelector
                            mode={processingMode}
                            onChange={setProcessingMode}
                            toolPolicy="CLIENT_PREFERRED"
                            disabled={isProcessing}
                        />


                        {pageCount > 0 && (
                            <div className="border border-[color:var(--border)] bg-[color:var(--background)]/30 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-6 border-b border-[color:var(--border)] pb-3">
                                    <h3 className="text-sm font-bold flex items-center gap-2 text-[color:var(--foreground)]">
                                        <Layers size={16} className="text-indigo-500" /> Interactive Sorting Grid
                                    </h3>
                                    <span className="text-xs bg-indigo-500/10 text-indigo-500 px-2.5 py-1 rounded-full font-semibold">
                                        {pageCount} Total Pages
                                    </span>
                                </div>

                                <PageReorderGrid
                                    items={pageOrder}
                                    setItems={setPageOrder}
                                    file={file}
                                />
                            </div>
                        )}

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Document Reordered Successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        Your modified page layout matrix has been recompiled and updated.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="pt-2">
                            <PdfActionButton
                                text="Save Page Setup"
                                loadingText="Compiling Vector Streams on Backend..."
                                loading={isProcessing}
                                disabled={!file || pageOrder.length === 0 || isProcessing}
                                onClick={handleReorderSubmission}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}