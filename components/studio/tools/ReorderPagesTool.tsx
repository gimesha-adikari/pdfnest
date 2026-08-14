"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    FileText,
    Layers3,
    Loader2,
    ShieldCheck,
    X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

import LazyPdfThumbnail from "@/components/pdf/LazyPdfThumbnail";

interface ReorderPagesToolProps {
    baseFile: File | null;
    onReorderedFile: (file: File) => Promise<void>;
}

function getFileKey(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}`;
}

function moveItem<T>(items: T[], from: number, to: number) {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function PageCard({
                      file,
                      pageNum,
                      onMoveUp,
                      onMoveDown,
                      disableMoveUp,
                      disableMoveDown,
                  }: {
    file: File | null;
    pageNum: number;
    onMoveUp: () => void;
    onMoveDown: () => void;
    disableMoveUp: boolean;
    disableMoveDown: boolean;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                <LazyPdfThumbnail file={file} page={pageNum} scale={0.3} className="h-full w-full">
                    {({ src, isLoading }) =>
                        src ? (
                            <img
                                src={src}
                                alt={`Page ${pageNum}`}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-[color:var(--muted)]">
                                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={16} />}
                            </div>
                        )
                    }
                </LazyPdfThumbnail>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
                        Pg {pageNum}
                    </span>
                    <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                        Page {pageNum}
                    </p>
                </div>
                <p className="text-xs text-[color:var(--muted)]">Move up or down to change order</p>
            </div>

            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={disableMoveUp}
                    className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move up"
                >
                    <ArrowUp size={14} />
                </button>

                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={disableMoveDown}
                    className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move down"
                >
                    <ArrowDown size={14} />
                </button>
            </div>
        </div>
    );
}

export default function ReorderPagesTool({ baseFile, onReorderedFile }: ReorderPagesToolProps) {
    const { requireAuth } = useAuth();

    const [pageOrder, setPageOrder] = useState<number[]>([]);
    const [pageCount, setPageCount] = useState(0);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const totalSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return (baseFile.size / 1024 / 1024).toFixed(2);
    }, [baseFile]);

    useEffect(() => {
        let cancelled = false;

        const loadPdfPages = async () => {
            if (!baseFile) {
                setPageOrder([]);
                setPageCount(0);
                setSuccess(false);
                return;
            }

            setIsReadingTotal(true);
            setSuccess(false);
            setPageOrder([]);
            setPageCount(0);

            let loadingTask: any = null;
            let pdf: any = null;
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                loadingTask = pdfjsLib.getDocument({ data: typedArray });
                pdf = await loadingTask.promise;

                const totalPages = pdf.numPages;
                const dynamicOrderArray = Array.from({ length: totalPages }, (_, i) => i + 1);

                if (cancelled) return;

                setPageCount(totalPages);
                setPageOrder(dynamicOrderArray);
            } catch (error) {
                console.error("Root document processing exception:", error);
                notify("Could not load document preview grids.", "error");
            } finally {
                if (pdf && typeof pdf.destroy === "function") {
                    try { pdf.destroy(); } catch {}
                }
                if (loadingTask && typeof loadingTask.destroy === "function") {
                    try { loadingTask.destroy(); } catch {}
                }
                if (!cancelled) {
                    setIsReadingTotal(false);
                }
            }
        };

        void loadPdfPages();

        return () => {
            cancelled = true;
        };
    }, [baseFile]);

    const currentPreview = useMemo(() => {
        if (!baseFile) return null;
        return baseFile.name;
    }, [baseFile]);

    const handleReorderSubmission = () => {
        requireAuth(async () => {
            if (!baseFile || pageOrder.length === 0) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("sequence", pageOrder.join(","));

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/reorder-pages",
                    formData
                );

                const reorderedFile = new File([responseBlob], `reordered_${baseFile.name}`, {
                    type: "application/pdf",
                });

                await onReorderedFile(reorderedFile);

                setSuccess(true);
                notify("Reordered PDF loaded into Studio.","success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const resetOrder = () => {
        setPageOrder(Array.from({ length: pageCount }, (_, i) => i + 1));
    };

    if (!baseFile) return null;

    return (
        <section className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]">
                        <Layers3 size={16} />
                        Reorder Pages
                    </h3>
                    <p className="text-xs text-[color:var(--muted)]">
                        Rearrange the open document and save the new order back into Studio.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={resetOrder}
                    disabled={isReadingTotal || isProcessing || pageOrder.length === 0}
                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:bg-[var(--card)] hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Reset order"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto p-4">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Current document
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                {currentPreview || "Reading document..."}
                            </p>
                        </div>

                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                            Base
                        </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
                        <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                            <LazyPdfThumbnail file={baseFile} page={1} scale={0.3} className="h-full w-full">
                                {({ src, isLoading }) =>
                                    src ? (
                                        <img
                                            src={src}
                                            alt={baseFile.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[color:var(--muted)]">
                                            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={16} />}
                                        </div>
                                    )
                                }
                            </LazyPdfThumbnail>
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                                {baseFile.name}
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                {pageCount > 0 ? `${pageCount} pages` : "Reading pages..."}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--border)] p-4">
                        <p className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                            Source document size
                        </p>
                        <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">
                            {totalSizeMB} MB
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] p-4">
                        <p className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
                            Pages
                        </p>
                        <p className="mt-1 text-2xl font-bold text-indigo-500">
                            {pageOrder.length} / {pageCount}
                        </p>
                    </div>
                </div>

                {success && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                        <div className="text-xs">
                            <p className="font-semibold">Document reordered successfully.</p>
                            <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                The page order was rebuilt and loaded into Studio.
                            </p>
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Page order
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                Use the arrows to move pages up or down.
                            </p>
                        </div>
                    </div>

                    {isReadingTotal ? (
                        <div className="flex flex-col items-center justify-center py-10 text-[color:var(--muted)]">
                            <Loader2 size={30} className="mb-3 animate-spin text-indigo-500" />
                            <p className="text-sm font-medium">Building page preview grid...</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pageOrder.map((pageNum, index) => (
                                <PageCard
                                    key={pageNum}
                                    file={baseFile}
                                    pageNum={pageNum}
                                    disableMoveUp={index === 0}
                                    disableMoveDown={index === pageOrder.length - 1}
                                    onMoveUp={() =>
                                        setPageOrder((prev) => moveItem(prev, index, index - 1))
                                    }
                                    onMoveDown={() =>
                                        setPageOrder((prev) => moveItem(prev, index, index + 1))
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleReorderSubmission}
                    disabled={isProcessing || isReadingTotal || pageOrder.length === 0}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Reordering...
                        </>
                    ) : (
                        <>
                            <Layers3 size={16} />
                            Save page order to current document
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}