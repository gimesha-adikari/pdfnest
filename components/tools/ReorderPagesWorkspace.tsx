"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PageReorderGrid from "@/components/pdf/PageReorderGrid";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { FileWithPassword } from "@/lib/types";

export default function ReorderPagesWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pageOrder, setPageOrder] = useState<number[]>([]);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [isLoadingElements, setIsLoadingElements] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!file) {
            setPageOrder([]);
            setThumbnails([]);
            return;
        }

        const loadPdfPages = async () => {
            setIsLoadingElements(true);
            setSuccess(false);
            setThumbnails([]);

            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);

                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;
                const totalPages = pdf.numPages;

                const dynamicOrderArray = Array.from({ length: totalPages }, (_, i) => i + 1);
                setPageOrder(dynamicOrderArray);

                const generatedImages: string[] = [];

                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    try {
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 0.4 });

                        const canvas = document.createElement("canvas");
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;

                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                            await page.render({
                                canvas,
                                canvasContext: ctx,
                                viewport: viewport
                            }).promise;

                            generatedImages.push(canvas.toDataURL("image/jpeg", 0.7));
                        }
                        canvas.width = 0;
                        canvas.height = 0;
                    } catch (pageError) {
                        console.error(`Page ${pageNum} frame rendering collision:`, pageError);
                        generatedImages.push("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
                    }
                }

                setThumbnails(generatedImages);
                await loadingTask.destroy();
            } catch (error) {
                console.error("Root Document Processing Exception:", error);
                notify("Could not load document preview grids.", "error");
            } finally {
                setIsLoadingElements(false);
            }
        };

        loadPdfPages();
    }, [file]);

    useEffect(() => {
        return () => {
            thumbnails.forEach(src => {
                if (src.startsWith("blob:")) URL.revokeObjectURL(src);
            });
        };
    }, [thumbnails]);

    const handleReorderSubmission = async () => {
        requireAuth(async () => {
            if (!file || pageOrder.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);
                formData.append("sequence", pageOrder.join(","));

                const typedFile = file as FileWithPassword;
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/reorder-pages",
                    formData
                );

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${file.name.replace(/\.pdf$/i, "")}-reordered.pdf`
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

                        {thumbnails.length > 0 && (
                            <div className="border border-[color:var(--border)] bg-[color:var(--background)]/30 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-6 border-b border-[color:var(--border)] pb-3">
                                    <h3 className="text-sm font-bold flex items-center gap-2 text-[color:var(--foreground)]">
                                        <Layers size={16} className="text-indigo-500" /> Interactive Sorting Grid
                                    </h3>
                                    <span className="text-xs bg-indigo-500/10 text-indigo-500 px-2.5 py-1 rounded-full font-semibold">
                                        {thumbnails.length} Total Pages
                                    </span>
                                </div>

                                <PageReorderGrid
                                    items={pageOrder}
                                    setItems={setPageOrder}
                                    thumbnails={thumbnails}
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
                                disabled={!file || pageOrder.length === 0}
                                onClick={handleReorderSubmission}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}