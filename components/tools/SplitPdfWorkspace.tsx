"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, Scissors, ShieldCheck } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function SplitPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pageCount, setPageCount] = useState<number>(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [success, setSuccess] = useState(false);

    const generateThumbnails = useCallback(async (pdf: any, totalPages: number) => {
        setIsGeneratingPreviews(true);
        const loadedThumbnails: string[] = [];

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
                    loadedThumbnails.push(imgData);

                    setThumbnails([...loadedThumbnails]);
                }

                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
            }
        } catch (error) {
            console.error("Visual selector frame compilation failed:", error);
        } finally {
            setIsGeneratingPreviews(false);
        }
    }, []);

    useEffect(() => {
        if (!file) {
            setPageCount(0);
            setThumbnails([]);
            setSelectedPages(new Set());
            setLastSelectedIndex(null);
            return;
        }

        const loadPdfStructure = async () => {
            setSuccess(false);
            setSelectedPages(new Set());
            setLastSelectedIndex(null);
            setThumbnails([]);
            setIsReadingTotal(true);

            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);

                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                const totalPages = pdf.numPages;
                setPageCount(totalPages);
                setIsReadingTotal(false);

                generateThumbnails(pdf, totalPages);
            } catch (error) {
                console.error(error);
                notify("Could not read the structural metadata of this document.");
                setIsReadingTotal(false);
            }
        };

        loadPdfStructure();
    }, [file, generateThumbnails]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const togglePageSelection = (pageNum: number, event: React.MouseEvent) => {
        if (event.shiftKey) {
            event.preventDefault();
        }

        setSelectedPages((prev) => {
            const next = new Set(prev);

            if (event.shiftKey && lastSelectedIndex !== null) {
                const start = Math.min(lastSelectedIndex, pageNum);
                const end = Math.max(lastSelectedIndex, pageNum);
                const shouldSelectRange = prev.has(lastSelectedIndex);

                for (let i = start; i <= end; i++) {
                    if (shouldSelectRange) {
                        next.add(i);
                    } else {
                        next.delete(i);
                    }
                }
                return next;
            }

            if (next.has(pageNum)) {
                next.delete(pageNum);
            } else {
                next.add(pageNum);
            }
            return next;
        });

        if (!event.shiftKey) {
            setLastSelectedIndex(pageNum);
        }
    };

    const selectAll = () => {
        const all = new Set<number>();
        for (let i = 1; i <= pageCount; i++) all.add(i);
        setSelectedPages(all);
    };

    const clearSelection = () => {
        setSelectedPages(new Set());
        setLastSelectedIndex(null);
    };

    const compiledPageString = useMemo(() => {
        return Array.from(selectedPages).sort((a, b) => a - b).join(", ");
    }, [selectedPages]);

    const handleSplitProcessing = async () => {
        requireAuth(async () => {
            if (!file || selectedPages.size === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);
                formData.append("pages", compiledPageString);

                if ((file as any).originalPassword) {
                    formData.append("file_password", (file as any).originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/split", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${file.name.replace(/\.pdf$/i, "")}-extracted.pdf`
                });

                setSuccess(true);
                setSelectedPages(new Set());
                setLastSelectedIndex(null);
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
        <>
            <PdfToolHero
                title="Split PDF"
                description="Select specific pages visually from your document and extract them into a clean, unified file instantly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="space-y-6">
                    <PdfFileInfo file={file} onClear={() => {
                        setFile(null);
                        router.push(`/${toolId}`);
                    }} />

                    <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Scissors size={18} className="text-indigo-500" />
                                Visual Page Selector
                            </h3>
                            {pageCount > 0 && !isReadingTotal && (
                                <div className="flex gap-3 text-sm">
                                    <button onClick={selectAll} className="text-indigo-500 hover:text-indigo-600 font-medium transition">Select All</button>
                                    <button onClick={clearSelection} className="text-[color:var(--muted)] hover:text-red-500 font-medium transition">Clear</button>
                                </div>
                            )}
                        </div>

                        {isReadingTotal ? (
                            <div className="flex flex-col justify-center items-center py-12 text-[color:var(--muted)]">
                                <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
                                <p>Scanning document layout matrices...</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto p-2">
                                    {Array.from({ length: pageCount }).map((_, idx) => {
                                        const pageNum = idx + 1;
                                        const isSelected = selectedPages.has(pageNum);
                                        const thumbnailSrc = thumbnails[idx];

                                        return (
                                            <button
                                                type="button"
                                                key={pageNum}
                                                onClick={(e) => togglePageSelection(pageNum, e)}
                                                className={`
                                                    relative flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all aspect-[1/1.4] overflow-hidden group select-none
                                                    ${isSelected
                                                    ? "border-indigo-500 bg-indigo-500/10 shadow-md"
                                                    : "border-[color:var(--border)] hover:border-indigo-400/50 bg-[color:var(--card)]"}
                                                `}
                                            >
                                                {thumbnailSrc ? (
                                                    <img
                                                        src={thumbnailSrc}
                                                        alt={`Page ${pageNum}`}
                                                        className={`w-full h-full object-cover rounded-md transition-opacity pointer-events-none ${isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center w-full h-full text-[color:var(--muted)] opacity-50">
                                                        <FileText size={24} className="mb-2" />
                                                        <Loader2 size={14} className="animate-spin mt-1" />
                                                    </div>
                                                )}

                                                <div className="absolute bottom-0 w-full py-1 text-center text-[10px] font-bold backdrop-blur-md bg-black/40 text-white">
                                                    Pg {pageNum}
                                                </div>

                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 bg-indigo-500 rounded-full text-white shadow-lg scale-110 z-10">
                                                        <CheckCircle2 size={20} className="fill-indigo-500 stroke-white" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 flex items-center justify-between border-t border-[color:var(--border)] pt-4">
                                    <p className="text-sm text-[color:var(--muted)]">Target Extraction Array:</p>
                                    <p className="font-mono text-sm font-semibold text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-lg">
                                        {compiledPageString || "No pages selected"}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                            <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                            <p className="text-sm text-[color:var(--muted)]">Selected Pages</p>
                            <p className="mt-1 text-2xl font-bold text-indigo-500">{selectedPages.size} / {pageCount}</p>
                        </div>
                    </div>

                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Document sub-page split successful!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    The targeted page matrices were extracted on the backend and updated.
                                </p>
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text={`Extract ${selectedPages.size} ${selectedPages.size === 1 ? 'Page' : 'Pages'}`}
                        loadingText="Piping Configuration to Backend Node..."
                        loading={isProcessing}
                        disabled={selectedPages.size === 0 || isGeneratingPreviews}
                        onClick={handleSplitProcessing}
                    />
                </div>
            </div>
        </>
    );
}