// components/studio/tools/MergeTool.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    FileText,
    Layers3,
    Loader2,
    Trash2,
    X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { uploadAndDownloadFile } from "@/lib/api";
import { notify } from "@/lib/notify";
import PdfUploader from "@/components/pdf/PdfUploader";

type FileMeta = {
    thumbnail?: string;
    pageCount?: number;
};

type MetaMap = Record<string, FileMeta>;

interface MergeToolProps {
    baseFile: File | null;
    onMergedFile: (file: File) => Promise<void>;
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

function MiniFileCard({
                          file,
                          meta,
                          index,
                          onMoveUp,
                          onMoveDown,
                          onRemove,
                          disableMoveUp,
                          disableMoveDown,
                      }: {
    file: File;
    meta?: FileMeta;
    index: number;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onRemove: () => void;
    disableMoveUp: boolean;
    disableMoveDown: boolean;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-3">
            <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                {meta?.thumbnail ? (
                    <img
                        src={meta.thumbnail}
                        alt={file.name}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-[color:var(--muted)]">
                        <FileText size={16} />
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
                        #{index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">
                        {file.name}
                    </p>
                </div>
                <p className="text-xs text-[color:var(--muted)]">
                    {meta?.pageCount ? `${meta.pageCount} pages` : "Reading pages..."}
                    {" · "}
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
            </div>

            <div className="flex items-center gap-1">
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

                <button
                    type="button"
                    onClick={onRemove}
                    className="rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-1.5 text-[color:var(--muted)] transition hover:text-red-500"
                    title="Remove"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}

export default function MergeTool({ baseFile, onMergedFile }: MergeToolProps) {
    const { requireAuth } = useAuth();

    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [metadata, setMetadata] = useState<MetaMap>({});
    const [isMerging, setIsMerging] = useState(false);
    const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);

    const allFiles = useMemo(() => {
        return [...(baseFile ? [baseFile] : []), ...stagedFiles];
    }, [baseFile, stagedFiles]);

    const baseMeta = baseFile ? metadata[getFileKey(baseFile)] : undefined;

    const totalSizeMB = useMemo(() => {
        const totalBytes =
            (baseFile?.size ?? 0) +
            stagedFiles.reduce((sum, file) => sum + file.size, 0);

        return (totalBytes / 1024 / 1024).toFixed(2);
    }, [baseFile, stagedFiles]);

    const totalPagesInQueue = useMemo(() => {
        return allFiles.reduce((sum, file) => {
            return sum + (metadata[getFileKey(file)]?.pageCount ?? 0);
        }, 0);
    }, [allFiles, metadata]);

    useEffect(() => {
        setStagedFiles([]);
        setMetadata({});
    }, [baseFile]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const missing = allFiles.filter((file) => !metadata[getFileKey(file)]);

            if (missing.length === 0) {
                setIsGeneratingPreviews(false);
                return;
            }

            setIsGeneratingPreviews(true);

            for (const file of missing) {
                if (cancelled) return;

                const result = await inspectPdf(file);

                if (cancelled) return;

                setMetadata((prev) => ({
                    ...prev,
                    [getFileKey(file)]: result,
                }));
            }

            if (!cancelled) {
                setIsGeneratingPreviews(false);
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
        // queue-driven by design
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allFiles]);

    const addFiles = async (newFiles: File[]) => {
        const MAX_FILE_SIZE = 50 * 1024 * 1024;

        const validFiles = newFiles.filter((item) => {
            if (item.size > MAX_FILE_SIZE) {
                notify(`${item.name} exceeds 50MB limit`);
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        const currentKeys = new Set(allFiles.map(getFileKey));

        const incomingUniqueFiles = validFiles.filter(
            (item) => !currentKeys.has(getFileKey(item))
        );

        if (incomingUniqueFiles.length === 0) return;

        setStagedFiles((prev) => [...prev, ...incomingUniqueFiles]);
    };

    const removeFile = (indexToRemove: number) => {
        setStagedFiles((prev) => {
            const removed = prev[indexToRemove];

            if (removed) {
                const key = getFileKey(removed);

                setMetadata((current) => {
                    const next = { ...current };
                    delete next[key];
                    return next;
                });
            }

            return prev.filter((_, index) => index !== indexToRemove);
        });
    };

    const clearStagedFiles = () => {
        setMetadata((current) => {
            const next = { ...current };

            stagedFiles.forEach((file) => {
                delete next[getFileKey(file)];
            });

            return next;
        });

        setStagedFiles([]);
    };

    const moveUp = (index: number) => {
        if (index === 0) return;

        setStagedFiles((prev) => {
            const updated = [...prev];
            [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
            return updated;
        });
    };

    const moveDown = (index: number) => {
        if (index === stagedFiles.length - 1) return;

        setStagedFiles((prev) => {
            const updated = [...prev];
            [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
            return updated;
        });
    };

    const mergePdfs = () => {
        requireAuth(async () => {
            if (!baseFile) {
                notify("Open a PDF in Studio first.");
                return;
            }

            if (stagedFiles.length < 1) {
                notify("Add at least one PDF to merge.");
                return;
            }

            try {
                setIsMerging(true);

                const formData = new FormData();
                formData.append("files", baseFile);
                stagedFiles.forEach((item) => {
                    formData.append("files", item);
                });

                const responseBlob = await uploadAndDownloadFile(
                    "/api/structure/merge",
                    formData
                );

                const mergedFile = new File([responseBlob], "merged-document.pdf", {
                    type: "application/pdf",
                });

                await onMergedFile(mergedFile);

                notify("Merged PDF loaded into Studio.");
            } catch (error) {
                console.error(error);
                notify(`Failed to merge PDFs.\n\n${getFriendlyErrorMessage(error)}`);
            } finally {
                setIsMerging(false);
            }
        });
    };

    const canMerge = Boolean(baseFile) && stagedFiles.length > 0;

    return (
        <section className="w-full overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]">
                        <Layers3 size={16} />
                        Merge PDFs
                    </h3>
                    <p className="text-xs text-[color:var(--muted)]">
                        Keep the current document as the base and append more PDFs.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={clearStagedFiles}
                    disabled={stagedFiles.length === 0 || isMerging}
                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] p-2 text-[color:var(--muted)] transition hover:bg-[var(--card)] hover:text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Clear added files"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="space-y-4 p-4">
                <PdfUploader
                    onFilesAccepted={addFiles}
                    title="Add PDFs"
                    description="Append PDFs to the current document"
                    multiple={true}
                    accept=".pdf"
                />

                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Current document
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                Base PDF stays fixed until you press Merge.
                            </p>
                        </div>

                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                            Base
                        </span>
                    </div>

                    {baseFile ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2.5">
                            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--background)]">
                                {baseMeta?.thumbnail ? (
                                    <img
                                        src={baseMeta.thumbnail}
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
                                    {baseMeta?.pageCount
                                        ? `${baseMeta.pageCount} pages`
                                        : "Reading pages..."}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[var(--card)] p-4 text-center text-xs text-[color:var(--muted)]">
                            Open a PDF in Studio first.
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                Added files
                            </p>
                            <p className="text-xs text-[color:var(--muted)]">
                                {stagedFiles.length} file{stagedFiles.length === 1 ? "" : "s"}
                            </p>
                        </div>

                        {(isGeneratingPreviews || isMerging) && (
                            <Loader2 className="animate-spin text-indigo-500" size={16} />
                        )}
                    </div>

                    <div className="space-y-2">
                        {stagedFiles.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[var(--card)] p-4 text-center text-xs text-[color:var(--muted)]">
                                Add a PDF here before merging.
                            </div>
                        ) : (
                            stagedFiles.map((file, index) => {
                                const key = getFileKey(file);
                                const fileMeta = metadata[key];
                                const isFirst = index === 0;
                                const isLast = index === stagedFiles.length - 1;

                                return (
                                    <MiniFileCard
                                        key={key}
                                        file={file}
                                        meta={fileMeta}
                                        index={index}
                                        onMoveUp={() => moveUp(index)}
                                        onMoveDown={() => moveDown(index)}
                                        onRemove={() => removeFile(index)}
                                        disableMoveUp={isFirst}
                                        disableMoveDown={isLast}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-3 text-sm">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                            Files
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--foreground)]">
                            {allFiles.length}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                            Size
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--foreground)]">
                            {totalSizeMB} MB
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
                            Pages
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--foreground)]">
                            {totalPagesInQueue > 0 ? totalPagesInQueue : "Loading..."}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={mergePdfs}
                    disabled={!canMerge || isMerging || isGeneratingPreviews}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isMerging ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Merging...
                        </>
                    ) : (
                        <>
                            <Layers3 size={16} />
                            Merge into current document
                        </>
                    )}
                </button>
            </div>
        </section>
    );
}