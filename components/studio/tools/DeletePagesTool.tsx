// file: components/studio/tools/DeletePagesTool.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    FileText,
    Loader2,
    ShieldCheck,
    Trash2,
    X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import {handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import type { MouseEvent } from "react";

type FileMeta = {
    thumbnail?: string;
    pageCount?: number;
};

type MetaMap = Record<string, FileMeta>;

interface DeletePagesToolProps {
    baseFile: File | null;
    onDeletedFile: (file: File) => Promise<void>;
}

function getFileKey(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}`;
}

async function inspectPdf(file: File): Promise<FileMeta> {
    try {
        if (typeof window === "undefined") return {};

        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            window.location.origin + "/pdf.worker.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

        const pageCount = pdf.numPages;
        let thumbnail: string | undefined;

        if (pageCount > 0) {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.2 });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            if (ctx) {
                await page.render({
                    canvas,
                    canvasContext: ctx,
                    viewport,
                }).promise;

                thumbnail = canvas.toDataURL("image/jpeg", 0.65);
            }
            canvas.remove();
        }
        return { pageCount, thumbnail };
    } catch (error) {
        console.error("Failed to inspect PDF:", error);
        return {};
    }
}

function PageCard({
                      file,
                      meta,
                      pageNum,
                      selected,
                      onToggle,
                  }: {
    file: File;
    meta?: FileMeta;
    pageNum: number;
    selected: boolean;
    onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={[
                "relative flex flex-col overflow-hidden rounded-2xl border-2 p-2 text-left transition-all aspect-[1/1.35]",
                selected
                    ? "border-red-500 bg-red-500/10 shadow-md"
                    : "border-border bg-card hover:border-red-400/50",
            ].join(" ")}
        >
            {meta?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={meta.thumbnail}
                    alt={`Page ${pageNum}`}
                    className={[
                        "pointer-events-none h-full w-full rounded-md object-cover transition-opacity",
                        selected ? "opacity-100 grayscale" : "opacity-85 group-hover:opacity-100",
                    ].join(" ")}
                />
            ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-muted opacity-50">
                    <FileText size={24} className="mb-2" />
                    <Loader2 size={14} className="animate-spin mt-1" />
                </div>
            )}

            <div
                className={[
                    "absolute bottom-0 w-full py-1 text-center text-[10px] font-bold backdrop-blur-md",
                    selected ? "bg-red-600/80 text-white" : "bg-black/40 text-white",
                ].join(" ")}
            >
                {selected ? `Delete Pg ${pageNum}` : `Pg ${pageNum}`}
            </div>

            {selected && (
                <div className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white shadow-lg">
                    <Trash2 size={14} />
                </div>
            )}
        </button>
    );
}

export default function DeletePagesTool({ baseFile, onDeletedFile }: DeletePagesToolProps) {
    const { requireAuth } = useAuth();

    const [pageCount, setPageCount] = useState(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<MetaMap>({});
    const [pagesToDelete, setPagesToDelete] = useState<Set<number>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [success, setSuccess] = useState(false);

    const totalSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return (baseFile.size / 1024 / 1024).toFixed(2);
    }, [baseFile]);

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
                    await page.render({
                        canvas,
                        canvasContext: ctx,
                        viewport,
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
    }, []);

    useEffect(() => {
        if (!baseFile) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPageCount(0);
            setThumbnails([]);
            setMetadata({});
            setPagesToDelete(new Set());
            setLastSelectedIndex(null);
            return;
        }

        const loadPdfMetadata = async () => {
            setSuccess(false);
            setPagesToDelete(new Set());
            setLastSelectedIndex(null);
            setThumbnails([]);
            setMetadata({});
            setIsReadingTotal(true);

            try {
                const result = await inspectPdf(baseFile);
                setMetadata((prev) => ({
                    ...prev,
                    [getFileKey(baseFile)]: result,
                }));

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

                const totalPages = pdf.numPages;
                setPageCount(totalPages);
                setIsReadingTotal(false);

                await generateThumbnails(pdf, totalPages);
            } catch (error) {
                console.error(error);
                notify("Could not read the structural metadata of this document.","error");
                setIsReadingTotal(false);
            }
        };

        void loadPdfMetadata();
    }, [baseFile, generateThumbnails]);

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

    const handleDeleteProcessing = () => {
        requireAuth(async () => {
            if (!baseFile || pagesToDelete.size === 0) return;
            if (pagesToDelete.size === pageCount) {
                notify("Cannot remove every single page from the document.","warning");
                return;
            }

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("pages", compiledPageString);

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/delete-pages",
                    formData
                );

                const prunedFile = new File([responseBlob], `pruned_${baseFile.name}`, {
                    type: "application/pdf",
                });

                await onDeletedFile(prunedFile);

                setSuccess(true);
                setPagesToDelete(new Set());
                setLastSelectedIndex(null);
                notify("Deleted pages loaded into Studio.","success");
            } catch (err) {
                console.error(err);
                handleClientError(err)
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) return null;

    return (
        <section className="flex h-full w-85 flex-col overflow-hidden rounded-3xl border border-border bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Trash2 size={16} />
                        Delete PDF Pages
                    </h3>
                    <p className="text-xs text-muted">
                        Mark pages in the open document and remove them from the current Studio file.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={clearSelection}
                    disabled={pagesToDelete.size === 0 || isProcessing}
                    className="rounded-xl border border-border bg-background p-2 text-muted transition hover:bg-card hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Clear selection"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-(--background)/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Current document
                                </p>
                                <p className="text-xs text-muted">
                                    The open PDF is the removal base.
                                </p>
                            </div>

                            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500">
                                Base
                            </span>
                        </div>

                        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
                            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-[var(--background)]">
                                {metadata[getFileKey(baseFile)]?.thumbnail ? (
                                    <img
                                        src={metadata[getFileKey(baseFile)]?.thumbnail}
                                        alt={baseFile.name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-muted">
                                        <FileText size={16} />
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {baseFile.name}
                                </p>
                                <p className="text-xs text-muted">
                                    {pageCount > 0 ? `${pageCount} pages` : "Reading pages..."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {success && (
                        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200">
                            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                            <div>
                                <p className="text-sm font-semibold">
                                    Page deletion loaded into Studio.
                                </p>
                                <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                    The pruned PDF replaced the current document and is now part of the Studio history.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-(--background)/40 p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Page removal grid
                                </p>
                                <p className="text-xs text-muted">
                                    Click pages to mark them for deletion. Hold Shift to select ranges.
                                </p>
                            </div>

                            {pageCount > 0 && !isReadingTotal && (
                                <div className="flex gap-3 text-sm">
                                    <button
                                        onClick={selectAll}
                                        className="font-medium text-red-500 transition hover:text-red-600"
                                    >
                                        Select all
                                    </button>
                                    <button
                                        onClick={clearSelection}
                                        className="font-medium text-muted transition hover:text-red-500"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>

                        {isReadingTotal ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted">
                                <Loader2 size={32} className="mb-4 animate-spin text-indigo-500" />
                                <p>Scanning document page indices...</p>
                            </div>
                        ) : (
                            <div className="grid max-h-125 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
                                {Array.from({ length: pageCount }).map((_, idx) => {
                                    const pageNum = idx + 1;
                                    const selected = pagesToDelete.has(pageNum);
                                    const thumbnailSrc = thumbnails[idx];

                                    return (
                                        <PageCard
                                            key={pageNum}
                                            file={baseFile}
                                            meta={{
                                                thumbnail: thumbnailSrc,
                                                pageCount,
                                            }}
                                            pageNum={pageNum}
                                            selected={selected}
                                            onToggle={(e) => togglePageDeletion(pageNum, e)}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted">
                            Selected pages
                        </p>

                        <p className="mt-2 text-sm font-semibold text-red-500">
                            {compiledPageString || "No pages selected"}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleDeleteProcessing}
                        disabled={pagesToDelete.size === 0 || isProcessing || isGeneratingPreviews}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Removing pages...
                            </>
                        ) : (
                            <>
                                <Trash2 size={16} />
                                Remove selected pages from current document
                            </>
                        )}
                    </button>
                </div>
            </div>
        </section>
    );
}