// file: components/studio/tools/SplitTool.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    FileText,
    Loader2,
    Scissors,
    ShieldCheck,
    X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { uploadAndDownloadFile } from "@/lib/api";
import { notify } from "@/lib/notify";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function SplitTool({
                                      baseFile,
                                      onSplitFile,
                                  }: {
    baseFile: File | null;
    onSplitFile: (file: File) => Promise<void>;
}) {
    const { requireAuth } = useAuth();

    const [pageCount, setPageCount] = useState(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);

    const fileSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return formatMB(baseFile.size);
    }, [baseFile]);

    const compiledPageString = useMemo(() => {
        return Array.from(selectedPages).sort((a, b) => a - b).join(", ");
    }, [selectedPages]);

    const selectedCount = selectedPages.size;

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
        if (!baseFile) {
            setPageCount(0);
            setThumbnails([]);
            setSelectedPages(new Set());
            setLastSelectedIndex(null);
            return;
        }

        const loadPdfStructure = async () => {
            setSelectedPages(new Set());
            setLastSelectedIndex(null);
            setThumbnails([]);
            setIsReadingTotal(true);

            try {
                const pdfjsLib = await import("pdfjs-dist");
                if (typeof window !== "undefined") {
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        window.location.origin + "/pdf.worker.mjs";
                }

                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);

                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                const totalPages = pdf.numPages;
                setPageCount(totalPages);

                await generateThumbnails(pdf, totalPages);
            } catch (error) {
                console.error(error);
                notify("Could not read the structure of this document.");
            } finally {
                setIsReadingTotal(false);
            }
        };

        void loadPdfStructure();
    }, [baseFile, generateThumbnails]);

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
        for (let i = 1; i <= pageCount; i++) {
            all.add(i);
        }
        setSelectedPages(all);
    };

    const clearSelection = () => {
        setSelectedPages(new Set());
        setLastSelectedIndex(null);
    };

    const handleSplitProcessing = async () => {
        requireAuth(async () => {
            if (!baseFile || selectedPages.size === 0) return;

            try {
                setIsProcessing(true);

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("pages", compiledPageString);

                if ((baseFile as any).originalPassword) {
                    formData.append("file_password", (baseFile as any).originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/split",
                    formData
                );

                const outputName = `${baseFile.name.replace(/\.pdf$/i, "")}-extracted.pdf`;

                const outputFile = new File([responseBlob], outputName, {
                    type: "application/pdf",
                });

                await onSplitFile(outputFile);
                notify("Selected pages loaded into Studio.");
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) return null;

    return (
        <section className="w-full overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]">
                        <Scissors size={16} />
                        Split PDF
                    </h3>
                    <p className="text-xs text-[color:var(--muted)]">
                        Select pages from the current document and load the extracted PDF back into Studio.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selectedPages.size === 0 || isProcessing}
                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:bg-[var(--card)] hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Clear selection"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-4 p-4">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Current document
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                This is the source PDF you are splitting.
                            </p>
                        </div>

                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                            Base
                        </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
                        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[var(--background)] text-[color:var(--muted)]">
                            <FileText size={16} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                                {baseFile.name}
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                {pageCount > 0 ? `${pageCount} pages` : "Reading pages..."}
                                {" · "}
                                {fileSizeMB} MB
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Visual Page Selector
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                Choose the pages you want to extract.
                            </p>
                        </div>

                        {pageCount > 0 && !isReadingTotal && (
                            <div className="flex gap-3 text-sm">
                                <button
                                    onClick={selectAll}
                                    className="font-medium text-indigo-500 transition hover:text-indigo-400"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={clearSelection}
                                    className="font-medium text-[color:var(--muted)] transition hover:text-red-500"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>

                    {isReadingTotal ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
                            <Loader2 size={30} className="mb-4 animate-spin text-indigo-500" />
                            <p>Scanning current document...</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid max-h-[360px] grid-cols-2 gap-3 overflow-y-auto pr-1">
                                {Array.from({ length: pageCount }).map((_, idx) => {
                                    const pageNum = idx + 1;
                                    const isSelected = selectedPages.has(pageNum);
                                    const thumbnailSrc = thumbnails[idx];

                                    return (
                                        <button
                                            type="button"
                                            key={pageNum}
                                            onClick={(e) => togglePageSelection(pageNum, e)}
                                            className={[
                                                "relative flex aspect-[1/1.35] flex-col overflow-hidden rounded-2xl border-2 transition-all select-none",
                                                isSelected
                                                    ? "border-indigo-500 bg-indigo-500/10 shadow-md"
                                                    : "border-[color:var(--border)] bg-[var(--card)] hover:border-indigo-400/50",
                                            ].join(" ")}
                                        >
                                            {thumbnailSrc ? (
                                                <img
                                                    src={thumbnailSrc}
                                                    alt={`Page ${pageNum}`}
                                                    className={[
                                                        "pointer-events-none h-full w-full rounded-md object-cover transition-opacity",
                                                        isSelected ? "opacity-100" : "opacity-85",
                                                    ].join(" ")}
                                                />
                                            ) : (
                                                <div className="flex h-full w-full flex-col items-center justify-center text-[color:var(--muted)] opacity-50">
                                                    <FileText size={24} className="mb-2" />
                                                    <Loader2 size={14} className="mt-1 animate-spin" />
                                                </div>
                                            )}

                                            <div className="absolute bottom-0 w-full bg-black/40 py-1 text-center text-[10px] font-bold text-white backdrop-blur-md">
                                                Pg {pageNum}
                                            </div>

                                            {isSelected && (
                                                <div className="absolute right-2 top-2 rounded-full bg-indigo-500 text-white shadow-lg">
                                                    <CheckCircle2 size={20} className="fill-indigo-500 stroke-white" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border)] pt-4">
                                <p className="text-sm text-[color:var(--muted)]">
                                    Selected pages
                                </p>
                                <p className="font-mono text-sm font-semibold text-indigo-500">
                                    {compiledPageString || "No pages selected"}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3 text-sm">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                            Source size
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--foreground)]">
                            {fileSizeMB} MB
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                            Selected
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--foreground)]">
                            {selectedCount} / {pageCount}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleSplitProcessing}
                    disabled={selectedPages.size === 0 || isProcessing || isGeneratingPreviews}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Extracting...
                        </>
                    ) : (
                        <>
                            <ShieldCheck size={16} />
                            Extract selected pages into Studio
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}