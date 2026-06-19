"use client";

import { useMemo, useState } from "react";
import { Trash2, ShieldCheck, Loader2, FileText } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";
import {PDFDocumentProxy} from "pdfjs-dist";
import {FileWithPassword} from "@/lib/types";
import {useAuth} from "@/context/AuthContext";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function DeletePagesPage() {
    const { requireAuth } = useAuth();

    const [file, setFile] = useState<File | null>(null);
    const [pageCount, setPageCount] = useState<number>(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [pagesToDelete, setPagesToDelete] = useState<Set<number>>(new Set());

    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [success, setSuccess] = useState(false);

    const generateThumbnails = async (pdf: PDFDocumentProxy, totalPages: number) => {
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
                    await page.render({
                        canvas,
                        canvasContext: ctx,
                        viewport
                    }).promise;
                    const imgData = canvas.toDataURL("image/jpeg", 0.6);
                    loadedThumbnails.push(imgData);

                    setThumbnails([...loadedThumbnails]);
                }

                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
            }
        } catch (error) {
            console.error("Visual grid generation warning:", error);
        } finally {
            setIsGeneratingPreviews(false);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setPagesToDelete(new Set());
        setLastSelectedIndex(null); // Reset range selection baseline
        setThumbnails([]);
        setIsReadingTotal(true);

        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
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

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const togglePageDeletion = (pageNum: number, event: React.MouseEvent) => {
        if (event.shiftKey) {
            event.preventDefault();
        }

        setPagesToDelete((prev) => {
            const next = new Set(prev);

            if (event.shiftKey && lastSelectedIndex !== null) {
                const start = Math.min(lastSelectedIndex, pageNum);
                const end = Math.max(lastSelectedIndex, pageNum);

                const shouldSelect = prev.has(lastSelectedIndex);

                for (let i = start; i <= end; i++) {
                    if (shouldSelect) {
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
        setPagesToDelete(all);
    };

    const clearSelection = () => {
        setPagesToDelete(new Set());
        setLastSelectedIndex(null);
    };

    const compiledPageString = useMemo(() => {
        return Array.from(pagesToDelete).sort((a, b) => a - b).join(", ");
    }, [pagesToDelete]);

    const handleDeleteProcessing = async () => {
        requireAuth(async () => {

            if (!file || pagesToDelete.size === 0) return;
            if (pagesToDelete.size === pageCount) {
                notify("Cannot remove every single page from the document tree model container.");
                return;
            }

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", file);
                formData.append("pages", compiledPageString);

                const typedFile = file as FileWithPassword;

                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/delete-pages", formData);

                const downloadUrl = window.URL.createObjectURL(responseBlob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = `pruned_${file.name}`;
                document.body.appendChild(link);
                link.click();

                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);

                setSuccess(true);
                setPagesToDelete(new Set());
                setLastSelectedIndex(null);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Delete PDF Pages"
                description="Select specific pages visually from your document and discard them instantly while keeping the remaining structural streams fully intact."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop file here to initialize the visual removal grid"
                    multiple={false}
                    accept=".pdf"
                />

                {file && (
                    <div className="mt-8 space-y-6">
                        <PdfFileInfo file={file} />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <Trash2 size={18} className="text-red-500" />
                                    Visual Removal Grid Selector
                                </h3>
                                {pageCount > 0 && (
                                    <div className="flex gap-3 text-sm">
                                        <button onClick={selectAll} className="text-red-500 hover:text-red-600 font-medium transition">Select All</button>
                                        <button onClick={clearSelection} className="text-[color:var(--muted)] hover:text-indigo-500 font-medium transition">Reset</button>
                                    </div>
                                )}
                            </div>

                            {isReadingTotal ? (
                                <div className="flex flex-col justify-center items-center py-12 text-[color:var(--muted)]">
                                    <Loader2 size={32} className="animate-spin mb-4 text-indigo-500" />
                                    <p>Scanning document page indices...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto p-2">
                                        {Array.from({ length: pageCount }).map((_, idx) => {
                                            const pageNum = idx + 1;
                                            const isSelectedForDeletion = pagesToDelete.has(pageNum);
                                            const thumbnailSrc = thumbnails[idx];

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={(e) => togglePageDeletion(pageNum, e)}
                                                    className={`
                                                    relative flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all aspect-[1/1.4] overflow-hidden group select-none
                                                    ${isSelectedForDeletion
                                                        ? "border-red-500 bg-red-500/10 shadow-md grayscale opacity-40 hover:opacity-60"
                                                        : "border-[color:var(--border)] hover:border-red-400/50 bg-[color:var(--card)]"}
                                                  `}
                                                >
                                                    {thumbnailSrc ? (
                                                        <img
                                                            src={thumbnailSrc}
                                                            alt={`Page ${pageNum}`}
                                                            className="w-full h-full object-cover rounded-md pointer-events-none"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center w-full h-full text-[color:var(--muted)] opacity-50">
                                                            <FileText size={24} className="mb-2" />
                                                            <Loader2 size={14} className="animate-spin mt-1" />
                                                        </div>
                                                    )}

                                                    <div className={`absolute bottom-0 w-full py-1 text-center text-xs font-bold backdrop-blur-md ${isSelectedForDeletion ? 'bg-red-600/80 text-white' : 'bg-black/40 text-white'}`}>
                                                        {isSelectedForDeletion ? 'Delete Pg ' + pageNum : 'Pg ' + pageNum}
                                                    </div>

                                                    {isSelectedForDeletion && (
                                                        <div className="absolute top-2 right-2 bg-red-500 rounded-full text-white shadow-lg scale-110 z-10 p-1">
                                                            <Trash2 size={14} />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-6 flex items-center justify-between border-t border-[color:var(--border)] pt-4">
                                        <p className="text-sm text-[color:var(--muted)]">Target Removal Array Indices:</p>
                                        <p className="font-mono text-sm font-semibold text-red-500 bg-red-500/10 px-3 py-1 rounded-lg">
                                            {compiledPageString || "No pages marked for removal"}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                                <p className="mt-1 text-2xl font-bold">{fileExtractedSize} MB</p>
                            </div>
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Pages Remaining After Execution</p>
                                <p className="mt-1 text-2xl font-bold text-indigo-500">{pageCount - pagesToDelete.size} / {pageCount}</p>
                            </div>
                        </div>

                        {success && (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                <div>
                                    <p className="text-sm font-semibold">Document sub-page tree reduction successful!</p>
                                    <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                        The targeted structural segments were pruned away on the backend and downloaded cleanly.
                                    </p>
                                </div>
                            </div>
                        )}

                        <PdfActionButton
                            text={`Remove ${pagesToDelete.size} ${pagesToDelete.size === 1 ? 'Page' : 'Pages'}`}
                            loadingText="Piping Pruning Request Configuration Array to Server..."
                            loading={isProcessing}
                            disabled={pagesToDelete.size === 0}
                            onClick={handleDeleteProcessing}
                        />
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}