"use client";

import { useMemo, useState, useEffect } from "react";
import { Loader2, ArrowRight, ShieldCheck, Layers } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import { getFriendlyErrorMessage } from "@/lib/errorHandler"; // Integrated global error framework safely
import { notify } from "@/lib/notify";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

import PageReorderGrid from "@/components/pdf/PageReorderGrid";

export default function ReorderPagesPage() {
    const [file, setFile] = useState<File | null>(null);
    const [pageOrder, setPageOrder] = useState<number[]>([]);
    const [thumbnails, setThumbnails] = useState<string[]>([]);

    const [isLoadingElements, setIsLoadingElements] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        return () => {
            thumbnails.forEach(src => {
                if (src.startsWith("blob:")) URL.revokeObjectURL(src);
            });
        };
    }, [file, thumbnails]);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setThumbnails([]);
        setIsLoadingElements(true);

        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);

            const loadingTask = pdfjsLib.getDocument({
                data: typedArray,
                disableWorker: false,
                isEvalSupported: false
            });

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
                        const renderTask = page.render({
                            canvasContext: ctx,
                            viewport: viewport
                        });
                        await renderTask.promise;

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
            notify("Could not load document preview grids. Please check the browser console for details.");
        } finally {
            setIsLoadingElements(false);
        }
    };

    const handleReorderSubmission = async () => {
        if (!file || pageOrder.length === 0) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("sequence", pageOrder.join(","));

            if ((file as any).originalPassword){
                formData.append("file_password", (file as any).originalPassword)
            }

            const responseBlob = await uploadAndDownloadFile(
                "/api/structure/reorder-pages",
                formData
            );

            // OPTIMIZATION: Enforced robust synchronous browser local file streaming trigger sequence
            const downloadUrl = window.URL.createObjectURL(responseBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `${file.name.replace(/\.pdf$/i, "")}-reordered.pdf`;
            document.body.appendChild(link);
            link.click();

            // Clean up browser hardware pointers immediately
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            // OPTIMIZATION: Mapped catch states directly to the uniform global JSON error decoder
            notify(getFriendlyErrorMessage(err));
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Rearrange PDF Pages"
                description="Drag, drop, and shuffle pages visually to reorder your document structures flawlessly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop document here to load the interactive page manager grid workspace"
                    multiple={false}
                    accept=".pdf"
                />

                {isLoadingElements && (
                    <div className="flex flex-col items-center justify-center py-20 text-[color:var(--muted)]">
                        <Loader2 className="animate-spin mb-3 text-indigo-500" size={32} />
                        <p className="text-sm font-medium">Deconstructing document into visual page layouts...</p>
                    </div>
                )}

                {!isLoadingElements && file && thumbnails.length > 0 && (
                    <div className="mt-8 space-y-6">
                        <PdfFileInfo file={file} />

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

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Document Reordered Successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        Your modified page layout matrix has been recompiled and downloaded.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="pt-2">
                            <PdfActionButton
                                text="Save Page Setup"
                                loadingText="Compiling Vector Streams on Backend..."
                                loading={isProcessing}
                                disabled={!file}
                                onClick={handleReorderSubmission}
                            />
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}