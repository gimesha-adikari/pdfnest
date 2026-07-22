"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import { handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import {
    ArrowLeft,
    ArrowRight,
    Crop,
    Eye,
    Loader2,
    ShieldCheck,
} from "lucide-react";

interface CustomPdfFile extends File {
    originalPassword?: string;
}

interface PdfJsRenderTask {
    cancel: () => void;
    promise: Promise<void>;
}

interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: unknown) => PdfJsRenderTask;
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

type DragType =
    | "move"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | null;

type PageSelectionMode = "current" | "all" | "custom";

interface CropToolProps {
    baseFile: File | null;
    onCroppedFile: (file: File) => Promise<void>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

function normalizePageSelectionInput(input: string): string[] {
    return input
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function buildSelectionLabel(mode: PageSelectionMode, currentPage: number, pageCount: number, customPagesInput: string) {
    if (mode === "all") {
        return pageCount > 0 ? `All pages (1-${pageCount})` : "All pages";
    }

    if (mode === "current") {
        return `Current page (${currentPage})`;
    }

    const pages = normalizePageSelectionInput(customPagesInput);
    return pages.length > 0 ? pages.join(", ") : "Enter page ranges";
}

export default function CropTool({ baseFile, onCroppedFile }: CropToolProps) {
    const { requireAuth } = useAuth();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [pageCount, setPageCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [xmin, setXmin] = useState(50);
    const [ymin, setYmin] = useState(50);
    const [xmax, setXmax] = useState(400);
    const [ymax, setYmax] = useState(500);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [dragType, setDragType] = useState<DragType>(null);
    const dragStartRef = useRef<{
        mouseX: number;
        mouseY: number;
        xmin: number;
        ymin: number;
        xmax: number;
        ymax: number;
    }>({
        mouseX: 0,
        mouseY: 0,
        xmin: 0,
        ymin: 0,
        xmax: 0,
        ymax: 0,
    });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const didInitBoxRef = useRef(false);

    const [pageSelectionMode, setPageSelectionMode] = useState<PageSelectionMode>("current");
    const [customPagesInput, setCustomPagesInput] = useState("");

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions.width, displayDimensions.width]);

    const selectedPagesLabel = useMemo(() => {
        return buildSelectionLabel(pageSelectionMode, currentPage, pageCount, customPagesInput);
    }, [pageSelectionMode, currentPage, pageCount, customPagesInput]);

    const selectedPagesPayload = useMemo(() => {
        if (pageSelectionMode === "all") return null;
        if (pageSelectionMode === "current") return [String(currentPage)];

        const pages = normalizePageSelectionInput(customPagesInput);
        return pages.length > 0 ? pages : null;
    }, [pageSelectionMode, currentPage, customPagesInput]);

    const resetCropState = useCallback(() => {
        setPdfDocument(null);
        setPageCount(0);
        setCurrentPage(1);
        setPdfDimensions({ width: 0, height: 0 });
        setDisplayDimensions({ width: 0, height: 0 });
        setXmin(50);
        setYmin(50);
        setXmax(400);
        setYmax(500);
        setSuccess(false);
        setIsLoading(false);
        setIsRenderingCanvas(false);
        setPageSelectionMode("current");
        setCustomPagesInput("");
        didInitBoxRef.current = false;
    }, []);

    useEffect(() => {
        if (!baseFile) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            resetCropState();
            return;
        }

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsLoading(true);
                setSuccess(false);
                didInitBoxRef.current = false;

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;

                if (cancelled) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setPageCount(pdf.numPages);
                setCurrentPage(1);
                setPageSelectionMode("current");
                setCustomPagesInput("");
            } catch (err) {
                console.error("Failed to parse document:", err);
                notify("Could not load document preview.", "error");
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void loadPdf();

        return () => {
            cancelled = true;
        };
    }, [baseFile, resetCropState]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;

        let cancelled = false;

        const renderPage = async () => {
            try {
                setIsRenderingCanvas(true);

                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }

                const page = await pdfDocument.getPage(currentPage);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const baseViewport = page.getViewport({ scale: 1.0 });
                const renderViewport = page.getViewport({ scale: 1.2 });

                canvas.width = renderViewport.width;
                canvas.height = renderViewport.height;

                const renderTask = page.render({
                    canvasContext: ctx,
                    viewport: renderViewport,
                } as unknown);

                renderTaskRef.current = renderTask;
                await renderTask.promise;
                renderTaskRef.current = null;

                if (cancelled) return;

                const syncLayoutMetrics = () => {
                    if (cancelled) return;
                    if (canvasRef.current && canvasRef.current.clientWidth > 0) {
                        setPdfDimensions({
                            width: baseViewport.width,
                            height: baseViewport.height,
                        });

                        setDisplayDimensions({
                            width: canvasRef.current.clientWidth,
                            height: canvasRef.current.clientHeight,
                        });
                    } else {
                        requestAnimationFrame(syncLayoutMetrics);
                    }
                };

                requestAnimationFrame(syncLayoutMetrics);
            } catch (err: unknown) {
                const errorObj = err as Error;
                if (errorObj?.name !== "RenderingCancelledException") {
                    console.error("Canvas render failed:", err);
                }
            } finally {
                if (!cancelled) {
                    setIsRenderingCanvas(false);
                }
            }
        };

        renderPage();

        const updateDisplaySize = () => {
            if (canvasRef.current && canvasRef.current.clientWidth > 0) {
                setDisplayDimensions({
                    width: canvasRef.current.clientWidth,
                    height: canvasRef.current.clientHeight,
                });
            }
        };

        window.addEventListener("resize", updateDisplaySize);

        return () => {
            cancelled = true;
            window.removeEventListener("resize", updateDisplaySize);
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, currentPage]);

    useEffect(() => {
        if (pdfDimensions.width > 0 && !didInitBoxRef.current) {
            setXmin(Math.round(pdfDimensions.width * 0.15));
            setYmin(Math.round(pdfDimensions.height * 0.15));
            setXmax(Math.round(pdfDimensions.width * 0.85));
            setYmax(Math.round(pdfDimensions.height * 0.85));
            didInitBoxRef.current = true;
        }
    }, [pdfDimensions]);

    const overlayStyles = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return { display: "none" };

        return {
            top: `${ymin * scaleFactor}px`,
            left: `${xmin * scaleFactor}px`,
            width: `${(xmax - xmin) * scaleFactor}px`,
            height: `${(ymax - ymin) * scaleFactor}px`,
        };
    }, [xmin, ymin, xmax, ymax, pdfDimensions, displayDimensions, scaleFactor]);

    const handleMouseDown = (type: DragType, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragType(type);
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            xmin,
            ymin,
            xmax,
            ymax,
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragType || !dragStartRef.current || pdfDimensions.width === 0) return;

            const start = dragStartRef.current;
            const deltaX = (e.clientX - start.mouseX) / scaleFactor;
            const deltaY = (e.clientY - start.mouseY) / scaleFactor;

            let nextXmin = start.xmin;
            let nextXmax = start.xmax;
            let nextYmin = start.ymin;
            let nextYmax = start.ymax;

            if (dragType === "move") {
                const w = start.xmax - start.xmin;
                const h = start.ymax - start.ymin;

                nextXmin = Math.max(0, Math.min(pdfDimensions.width - w, start.xmin + deltaX));
                nextXmax = nextXmin + w;

                nextYmin = Math.max(0, Math.min(pdfDimensions.height - h, start.ymin + deltaY));
                nextYmax = nextYmin + h;
            } else {
                if (dragType.includes("left")) {
                    nextXmin = Math.max(0, Math.min(start.xmax - 30, start.xmin + deltaX));
                }
                if (dragType.includes("right")) {
                    nextXmax = Math.min(pdfDimensions.width, Math.max(start.xmin + 30, start.xmax + deltaX));
                }
                if (dragType.includes("top")) {
                    nextYmin = Math.max(0, Math.min(start.ymax - 30, start.ymin + deltaY));
                }
                if (dragType.includes("bottom")) {
                    nextYmax = Math.min(pdfDimensions.height, Math.max(start.ymin + 30, start.ymax + deltaY));
                }
            }

            setXmin(Math.round(nextXmin));
            setXmax(Math.round(nextXmax));
            setYmin(Math.round(nextYmin));
            setYmax(Math.round(nextYmax));
        };

        const handleMouseUp = () => {
            setDragType(null);
        };

        if (dragType) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragType, pdfDimensions, scaleFactor]);

    const compiledBoxString = useMemo(() => {
        if (pdfDimensions.height === 0) return "[0 0 0 0]";
        const pdfBottom = pdfDimensions.height - ymax;
        const pdfTop = pdfDimensions.height - ymin;
        return `[${xmin} ${pdfBottom} ${xmax} ${pdfTop}]`;
    }, [xmin, ymin, xmax, ymax, pdfDimensions.height]);

    const handleApplyCrop = async () => {
        if (!baseFile) return;
        const validFile = baseFile as CustomPdfFile;

        if (pageSelectionMode === "custom" && (!selectedPagesPayload || selectedPagesPayload.length === 0)) {
            notify("Please enter at least one page or page range.", "error");
            return;
        }

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("box", compiledBoxString);

                if (selectedPagesPayload && selectedPagesPayload.length > 0) {
                    formData.append("pages", selectedPagesPayload.join(","));
                }

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/crop", formData);

                const croppedFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-cropped.pdf`,
                    { type: "application/pdf" }
                );

                await onCroppedFile(croppedFile);
                setSuccess(true);
                notify("Document successfully cropped!", "success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-[color:var(--muted)]">
                <p>Select or upload a document to begin cropping.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full p-4 overflow-hidden">
            <div className="lg:col-span-4 space-y-4">
                <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--card)] space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-[color:var(--foreground)]">
                        <Crop size={16} className="text-indigo-500" />
                        Crop Parameters
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Min X</label>
                            <input
                                type="number"
                                value={xmin}
                                onChange={(e) => setXmin(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full px-2 py-1.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-lg text-[color:var(--foreground)] outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Min Y</label>
                            <input
                                type="number"
                                value={ymin}
                                onChange={(e) => setYmin(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full px-2 py-1.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-lg text-[color:var(--foreground)] outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Max X</label>
                            <input
                                type="number"
                                value={xmax}
                                onChange={(e) => setXmax(Math.min(pdfDimensions.width, parseInt(e.target.value) || 0))}
                                className="w-full px-2 py-1.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-lg text-[color:var(--foreground)] outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Max Y</label>
                            <input
                                type="number"
                                value={ymax}
                                onChange={(e) => setYmax(Math.min(pdfDimensions.height, parseInt(e.target.value) || 0))}
                                className="w-full px-2 py-1.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-lg text-[color:var(--foreground)] outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-3 border-t border-[color:var(--border)] flex items-center justify-between text-xs">
                        <span className="text-[color:var(--muted)]">Crop Box:</span>
                        <span className="font-mono font-bold text-indigo-500">{compiledBoxString}</span>
                    </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--card)] space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-[color:var(--foreground)]">
                        <Eye size={16} className="text-indigo-500" />
                        Page Selection
                    </h3>

                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => setPageSelectionMode("current")}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
    pageSelectionMode === "current"
        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
        : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
}`}
                        >
                            Current
                        </button>
                        <button
                            type="button"
                            onClick={() => setPageSelectionMode("all")}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
    pageSelectionMode === "all"
        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
        : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
}`}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setPageSelectionMode("custom")}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
    pageSelectionMode === "custom"
        ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
        : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
}`}
                        >
                            Custom
                        </button>
                    </div>

                    {pageSelectionMode === "custom" ? (
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Pages</label>
                            <input
                                type="text"
                                value={customPagesInput}
                                onChange={(e) => setCustomPagesInput(e.target.value)}
                                placeholder="1-3,5,8-10"
                                className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-lg text-[color:var(--foreground)] outline-none"
                            />
                            <p className="text-[11px] text-[color:var(--muted)]">
                                Use commas for multiple selections and hyphens for ranges.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm text-[color:var(--foreground)]">
                            {selectedPagesLabel}
                        </div>
                    )}

                    <div className="pt-3 border-t border-[color:var(--border)] flex items-center justify-between text-xs">
                        <span className="text-[color:var(--muted)]">Applied Pages:</span>
                        <span className="font-mono font-bold text-indigo-500">{selectedPagesLabel}</span>
                    </div>
                </div>

                <button
                    onClick={handleApplyCrop}
                    disabled={isProcessing || isRenderingCanvas || isLoading || pdfDimensions.width === 0}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Crop size={18} />}
                    Apply crop
                </button>

                {success && (
                    <div className="text-xs text-emerald-500 font-medium flex items-center gap-2 justify-center">
                        <ShieldCheck size={14} /> Applied successfully
                    </div>
                )}
            </div>

            <div className="lg:col-span-8 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-4 relative h-[65vh] min-h-[400px]">
                {(isRenderingCanvas || isLoading) && (
                    <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                        <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                        Synchronizing view...
                    </div>
                )}

                <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4 shrink-0">
                    <span className="flex items-center gap-2">
                        <Eye size={16} className="text-indigo-500" /> Workspace Canvas Simulator
                    </span>
                    {pageCount > 0 && (
                        <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                            <button
                                type="button"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage((p) => p - 1)}
                                className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
                            >
                                <ArrowLeft size={14} />
                            </button>
                            <span>
                                Page {currentPage} of {pageCount}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage >= pageCount}
                                onClick={() => setCurrentPage((p) => p + 1)}
                                className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
                            >
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-full flex-1 flex items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] p-4 relative overflow-hidden">
                    <div
                        ref={containerRef}
                        className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full max-h-full flex items-center justify-center"
                    >
                        <canvas ref={canvasRef} className="max-w-full max-h-[52vh] object-contain block rounded" />

                        <div
                            style={overlayStyles}
                            className="absolute border-2 border-indigo-500 bg-indigo-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] cursor-move z-10"
                            onMouseDown={(e) => handleMouseDown("move", e)}
                        >
                            <div className="absolute top-1 left-1 bg-indigo-600 text-[8px] text-white font-bold px-1 py-0.5 rounded pointer-events-none select-none uppercase tracking-wider">
                                Crop Box
                            </div>

                            <div
                                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-20"
                                onMouseDown={(e) => handleMouseDown("top-left", e)}
                            />
                            <div
                                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-20"
                                onMouseDown={(e) => handleMouseDown("top-right", e)}
                            />
                            <div
                                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nesw-resize z-20"
                                onMouseDown={(e) => handleMouseDown("bottom-left", e)}
                            />
                            <div
                                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-full cursor-nwse-resize z-20"
                                onMouseDown={(e) => handleMouseDown("bottom-right", e)}
                            />

                            <div
                                className="absolute top-0 left-1/2 -translate-x-1/2 -top-1.5 w-6 h-2 bg-white border border-indigo-600 rounded-sm cursor-ns-resize z-20"
                                onMouseDown={(e) => handleMouseDown("top", e)}
                            />
                            <div
                                className="absolute bottom-0 left-1/2 -translate-x-1/2 -bottom-1.5 w-6 h-2 bg-white border border-indigo-600 rounded-sm cursor-ns-resize z-20"
                                onMouseDown={(e) => handleMouseDown("bottom", e)}
                            />
                            <div
                                className="absolute left-0 top-1/2 -translate-y-1/2 -left-1.5 h-6 w-2 bg-white border border-indigo-600 rounded-sm cursor-ew-resize z-20"
                                onMouseDown={(e) => handleMouseDown("left", e)}
                            />
                            <div
                                className="absolute right-0 top-1/2 -translate-y-1/2 -right-1.5 h-6 w-2 bg-white border border-indigo-600 rounded-sm cursor-ew-resize z-20"
                                onMouseDown={(e) => handleMouseDown("right", e)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
