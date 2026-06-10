"use client";

import { useMemo, useState } from "react";
import { Move, ShieldCheck, Loader2, FileText } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

interface PageItem {
    id: string;
    originalIndex: number;
    thumbnail: string;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function ReorderPagesPage() {
    const [file, setFile] = useState<File | null>(null);
    const [pages, setPages] = useState<PageItem[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [success, setSuccess] = useState(false);

    const generateThumbnails = async (pdf: any, totalPages: number) => {
        const loadedPages: PageItem[] = [];

        try {
            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 });

                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const imgData = canvas.toDataURL("image/jpeg", 0.6);

                    loadedPages.push({
                        id: `page-${i}-${Math.random()}`,
                        originalIndex: i,
                        thumbnail: imgData
                    });

                    setPages([...loadedPages]);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setPages([]);
        setIsReadingTotal(true);

        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);

            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            const totalPages = pdf.numPages;
            setIsReadingTotal(false);

            generateThumbnails(pdf, totalPages);

        } catch (error) {
            console.error(error);
            alert("Could not read the structural metadata of this document.");
            setIsReadingTotal(false);
        }
    };

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setHoveredIndex(index);
    };

    const handleDrop = (index: number) => {
        if (draggedIndex === null || draggedIndex === index) {
            setDraggedIndex(null);
            setHoveredIndex(null);
            return;
        }

        const updatedPages = [...pages];
        const [draggedItem] = updatedPages.splice(draggedIndex, 1);
        updatedPages.splice(index, 0, draggedItem);

        setPages(updatedPages);
        setDraggedIndex(null);
        setHoveredIndex(null);
    };

    const compiledSequenceString = useMemo(() => {
        return pages.map(p => p.originalIndex).join(",");
    }, [pages]);

    const handleReorderProcessing = async () => {
        if (!file || pages.length === 0) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("sequence", compiledSequenceString);

            await uploadAndDownloadFile("/structure/reorder-pages", formData, `${file.name.replace(/\.pdf$/i, "")}-reordered.pdf`);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Structure arrangement execution failure.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Reorder PDF Pages"
                description="Rearrange document page layouts seamlessly by dragging thumbnails into custom sorting variations before output generation."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop file here to generate the visual sequence drag dashboard workspace"
                />

                {file && (
                    <div className="mt-8 space-y-6">
                        <PdfFileInfo file={file} />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                <Move size={18} className="text-indigo-500" />
                                Interactive Page Sorter Board
                            </h3>

                            {isReadingTotal ? (
                                <div className="flex flex-col justify-center items-center py-12 text-[color:var(--muted)]">
                                    <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
                                    <p>Initializing page array structures...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[550px] overflow-y-auto p-2">
                                    {pages.map((page, idx) => {
                                        const isBeingDragged = draggedIndex === idx;
                                        const isBeingHovered = hoveredIndex === idx;

                                        return (
                                            <div
                                                key={page.id}
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDrop={() => handleDrop(idx)}
                                                className={`
                          flex flex-col items-center bg-[color:var(--card)] border rounded-2xl p-2 relative cursor-grab active:cursor-grabbing select-none shadow-sm transition-all duration-200
                          ${isBeingDragged ? "opacity-30 border-dashed border-indigo-500 scale-95" : ""}
                          ${isBeingHovered && !isBeingDragged ? "border-indigo-500 bg-indigo-500/5 translate-y-1 scale-105 shadow-md" : "border-[color:var(--border)]"}
                        `}
                                            >
                                                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white rounded-md text-[10px] font-bold px-1.5 py-0.5 z-10">
                                                    Order #{idx + 1}
                                                </div>

                                                <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-md text-[10px] font-bold px-1.5 py-0.5 z-10 opacity-70 group-hover:opacity-100">
                                                    Orig. {page.originalIndex}
                                                </div>

                                                <div className="w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden rounded-lg bg-[color:var(--background)] mt-6 mb-1">
                                                    {page.thumbnail ? (
                                                        <img
                                                            src={page.thumbnail}
                                                            alt={`Page index`}
                                                            className="w-full h-full object-cover rounded-md pointer-events-none"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center w-full h-full text-[color:var(--muted)] opacity-50">
                                                            <FileText size={24} className="mb-2" />
                                                            <Loader2 size={14} className="animate-spin mt-1" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                                <p className="mt-1 text-2xl font-bold">{fileExtractedSize} MB</p>
                            </div>
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Total Indexed Array Count</p>
                                <p className="mt-1 text-2xl font-bold text-indigo-500">{pages.length} Pages</p>
                            </div>
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                <div>
                                    <p className="text-sm font-semibold">Document orchestration pipeline successful!</p>
                                    <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                        The requested internal matrix layout modification sequence has been processed by the Go engine.
                                    </p>
                                </div>
                            </div>
                        )}

                        <PdfActionButton
                            text="Generate Reordered PDF"
                            loadingText="Piping Mapping Layout Matrix Sequence to Server..."
                            loading={isProcessing}
                            disabled={pages.length === 0}
                            onClick={handleReorderProcessing}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}