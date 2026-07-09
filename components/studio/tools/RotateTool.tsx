"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    RotateCw,
    ShieldCheck,
    Loader2,
    FileText,
    ArrowLeft,
    ArrowRight,
    RotateCcw,
    X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";

type FileMeta = {
    thumbnail?: string;
    pageCount?: number;
};

type MetaMap = Record<string, FileMeta>;

interface RotateToolProps {
    baseFile: File | null;
    onRotatedFile: (file: File) => Promise<void>;
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
                      pageNum,
                      meta,
                      selected,
                      rotation,
                      onRotateLeft,
                      onRotateRight,
                      onReset,
                  }: {
    pageNum: number;
    meta?: FileMeta;
    selected: boolean;
    rotation: number;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    onReset: () => void;
}) {
    return (
        <div
            className={[
                "relative flex flex-col overflow-hidden rounded-2xl border p-2 transition",
                selected
                    ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                    : "border-[color:var(--border)] bg-[color:var(--card)]",
            ].join(" ")}
        >
            <div className="relative aspect-[1/1.28] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                {meta?.thumbnail ? (
                    <img
                        src={meta.thumbnail}
                        alt={`Page ${pageNum}`}
                        className="h-full w-full object-cover"
                        style={{ transform: `rotate(${rotation}deg)` }}
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-[color:var(--muted)] opacity-50">
                        <FileText size={24} className="mb-2" />
                        <Loader2 size={14} className="mt-1 animate-spin" />
                    </div>
                )}

                <div className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                    Pg {pageNum}
                </div>

                {rotation > 0 && (
                    <div className="absolute bottom-2 left-2 rounded-md bg-indigo-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                        +{rotation}°
                    </div>
                )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[color:var(--foreground)]">
                        Page {pageNum}
                    </p>
                    <p className="text-[10px] text-[color:var(--muted)]">
                        Rotate this page
                    </p>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onRotateLeft}
                        className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
                        title="Rotate left"
                    >
                        <ArrowLeft size={14} />
                    </button>

                    <button
                        type="button"
                        onClick={onRotateRight}
                        className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
                        title="Rotate right"
                    >
                        <ArrowRight size={14} />
                    </button>

                    <button
                        type="button"
                        onClick={onReset}
                        className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-red-500"
                        title="Reset"
                    >
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function RotateTool({ baseFile, onRotatedFile }: RotateToolProps) {
    const { requireAuth } = useAuth();

    const [pageCount, setPageCount] = useState(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<MetaMap>({});
    const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
    const [success, setSuccess] = useState(false);

    const totalSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return (baseFile.size / 1024 / 1024).toFixed(2);
    }, [baseFile]);

    const generateThumbnails = useCallback(
        async (pdf: PDFDocumentProxy, totalPages: number) => {
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
                console.error("Page preview compilation failed:", error);
            } finally {
                setIsGeneratingPreviews(false);
            }
        },
        []
    );

    useEffect(() => {
        if (!baseFile) {
            setPageCount(0);
            setThumbnails([]);
            setMetadata({});
            setPageRotations({});
            return;
        }

        const parsePdfGeometry = async () => {
            setSuccess(false);
            setPageRotations({});
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

                void generateThumbnails(pdf, totalPages);
            } catch (error) {
                console.error(error);
                notify("Could not read the structural metadata of this document.");
                setIsReadingTotal(false);
            }
        };

        void parsePdfGeometry();
    }, [baseFile, generateThumbnails]);

    const rotatePageClockwise = (pageNum: number) => {
        setPageRotations((prev) => ({
            ...prev,
            [pageNum]: ((prev[pageNum] || 0) + 90) % 360,
        }));
    };

    const rotatePageCounterClockwise = (pageNum: number) => {
        setPageRotations((prev) => ({
            ...prev,
            [pageNum]: ((prev[pageNum] || 0) + 270) % 360,
        }));
    };

    const clearAllRotations = () => setPageRotations({});

    const rotateAllClockwise = () => {
        setPageRotations((prev) => {
            const updated: Record<number, number> = {};
            for (let i = 1; i <= pageCount; i++) {
                updated[i] = ((prev[i] || 0) + 90) % 360;
            }
            return updated;
        });
    };

    const handleRotateProcessing = () => {
        requireAuth(async () => {
            if (!baseFile) return;

            try {
                setIsProcessing(true);
                setSuccess(false);

                const groupedRotations: Record<string, number> = {};
                Object.entries(pageRotations).forEach(([pageStr, degrees]) => {
                    if (degrees > 0) {
                        groupedRotations[pageStr] = degrees;
                    }
                });

                if (Object.keys(groupedRotations).length === 0) {
                    notify("Rotate at least one page first.");
                    return;
                }

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("rotations", JSON.stringify(groupedRotations));

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/rotate",
                    formData
                );

                const rotatedFile = new File([responseBlob], "rotated-document.pdf", {
                    type: "application/pdf",
                });

                await onRotatedFile(rotatedFile);

                setSuccess(true);
                setPageRotations({});
                notify("Rotated PDF loaded into Studio.");
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
        <section className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]">
                        <RotateCw size={16} />
                        Rotate PDF
                    </h3>
                    <p className="text-xs text-[color:var(--muted)]">
                        Rotate pages in the current document, then save the result back into Studio.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={clearAllRotations}
                    disabled={isProcessing}
                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:bg-[var(--card)] hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Reset rotations"
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
                                The open PDF is the base document.
                            </p>
                        </div>

                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                            Base
                        </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
                        <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                            {metadata[getFileKey(baseFile)]?.thumbnail ? (
                                <img
                                    src={metadata[getFileKey(baseFile)]?.thumbnail}
                                    alt={baseFile.name}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-[color:var(--muted)]">
                                    <FileText size={16} />
                                </div>
                            )}
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
                            Rotated pages
                        </p>
                        <p className="mt-1 text-2xl font-bold text-indigo-500">
                            {Object.values(pageRotations).filter((deg) => deg > 0).length} / {pageCount}
                        </p>
                    </div>
                </div>

                {success && (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={18} />
                        <div>
                            <p className="text-sm font-semibold">Rotation loaded into Studio.</p>
                            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                                The rotated PDF replaced the current document and is now part of the Studio history.
                            </p>
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Page rotation grid
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                Rotate each page independently or rotate all pages together.
                            </p>
                        </div>

                        {pageCount > 0 && !isReadingTotal && (
                            <div className="flex gap-3 text-sm">
                                <button
                                    type="button"
                                    onClick={rotateAllClockwise}
                                    className="font-medium text-indigo-500 transition hover:text-indigo-600"
                                >
                                    Rotate all 90°
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAllRotations}
                                    className="font-medium text-[color:var(--muted)] transition hover:text-red-500"
                                >
                                    Reset
                                </button>
                            </div>
                        )}
                    </div>

                    {isReadingTotal ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
                            <Loader2 size={32} className="mb-4 animate-spin text-indigo-500" />
                            <p>Parsing document geometry grids...</p>
                        </div>
                    ) : (
                        <div className="grid max-h-[460px] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 xl:grid-cols-4">
                            {Array.from({ length: pageCount }).map((_, idx) => {
                                const pageNum = idx + 1;
                                const rotation = pageRotations[pageNum] || 0;
                                const thumbnailSrc = thumbnails[idx];

                                return (
                                    <PageCard
                                        key={pageNum}
                                        pageNum={pageNum}
                                        meta={{
                                            thumbnail: thumbnailSrc,
                                            pageCount,
                                        }}
                                        selected={rotation > 0}
                                        rotation={rotation}
                                        onRotateLeft={() => rotatePageCounterClockwise(pageNum)}
                                        onRotateRight={() => rotatePageClockwise(pageNum)}
                                        onReset={() =>
                                            setPageRotations((prev) => {
                                                const next = { ...prev };
                                                delete next[pageNum];
                                                return next;
                                            })
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleRotateProcessing}
                    disabled={isProcessing || isGeneratingPreviews}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Applying rotation...
                        </>
                    ) : (
                        <>
                            <RotateCw size={16} />
                            Apply rotation to current document
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}