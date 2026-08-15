"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Crop, Loader2, ShieldCheck, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { handleClientError } from "@/lib/errorHandler";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { usePreview } from "@/lib/preview/usePreview";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";

interface CustomPdfFile extends File {
    originalPassword?: string;
}

interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

type DragType = "move" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
type PageSelectionMode = "current" | "all" | "custom";

function normalizePageSelectionInput(input: string): string[] {
    return input
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function joinPreviewPages(parts: string[]) {
    return parts.length ? parts.join(", ") : "none";
}

export default function CropPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    // Track coordinates cleanly in 1:1 true PDF unscaled points
    const [xmin, setXmin] = useState<number>(50);
    const [ymin, setYmin] = useState<number>(50);
    const [xmax, setXmax] = useState<number>(400);
    const [ymax, setYmax] = useState<number>(500);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

    // Adaptive Hybrid Preview: Default to server preview online; auto-fallback to client renderer on failure or offline
    const [previewRenderer, setPreviewRenderer] = useState<"server" | "client">("server");

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);

    const preview = usePreview({
        file,
        page: currentPage,
        scale: 1.5,
        mode: "page",
        renderer: previewRenderer,
        onError: (err) => {
            if (previewRenderer === "server") {
                console.warn("[CropPdfWorkspace] Server preview failed. Seamlessly activating ClientPdfRenderer fallback:", err);
                setPreviewRenderer("client");
            }
        },
    });

    // Track baseline PDF point dimensions (unscaled)
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    // Track responsive rendered HTML viewport space element size
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [dragType, setDragType] = useState<DragType>(null);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; xmin: number; ymin: number; xmax: number; ymax: number }>({
        mouseX: 0,
        mouseY: 0,
        xmin: 0,
        ymin: 0,
        xmax: 0,
        ymax: 0,
    });

    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [pageSelectionMode, setPageSelectionMode] = useState<PageSelectionMode>("current");
    const [customPagesInput, setCustomPagesInput] = useState<string>("");

    // Maps workspace points onto HTML display pixels smoothly
    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions, displayDimensions]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const selectedPagesPreview = useMemo(() => {
        if (!totalPages) return "No pages loaded";

        if (pageSelectionMode === "all") {
            return `All pages (1-${totalPages})`;
        }

        if (pageSelectionMode === "current") {
            return `Current page (${currentPage})`;
        }

        const normalized = normalizePageSelectionInput(customPagesInput);
        return normalized.length > 0 ? normalized.join(", ") : "Enter page numbers or ranges";
    }, [pageSelectionMode, currentPage, totalPages, customPagesInput]);

    const selectedPagesPayload = useMemo(() => {
        if (pageSelectionMode === "all") return null;

        if (pageSelectionMode === "current") {
            return [String(currentPage)];
        }

        const normalized = normalizePageSelectionInput(customPagesInput);
        return normalized.length > 0 ? normalized : null;
    }, [pageSelectionMode, currentPage, customPagesInput]);

    useEffect(() => {
        if (!file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            setPageSelectionMode("current");
            setCustomPagesInput("");
            setPreviewRenderer("server");
            return;
        }

        const loadPdf = async () => {
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
                setPageSelectionMode("current");
            } catch (err) {
                console.error("Failed to parse document context framework:", err);
            }
        };

        loadPdf();
    }, [file]);

    useEffect(() => {
        if (!pdfDocument) return;

        let cancelled = false;

        const syncPdfDimensions = async () => {
            try {
                const page = await pdfDocument.getPage(currentPage);
                if (cancelled) return;
                const baseViewport = page.getViewport({ scale: 1.0 });
                setPdfDimensions({ width: baseViewport.width, height: baseViewport.height });
            } catch (err) {
                console.error("Failed to fetch PDF dimensions:", err);
            }
        };

        syncPdfDimensions();

        return () => {
            cancelled = true;
        };
    }, [pdfDocument, currentPage]);

    useEffect(() => {
        const updateDisplaySize = () => {
            if (imgRef.current && imgRef.current.clientWidth > 0) {
                setDisplayDimensions({
                    width: imgRef.current.clientWidth,
                    height: imgRef.current.clientHeight,
                });
            }
        };

        window.addEventListener("resize", updateDisplaySize);
        return () => {
            window.removeEventListener("resize", updateDisplaySize);
        };
    }, []);

    useEffect(() => {
        if (pdfDimensions.width > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setXmin(Math.round(pdfDimensions.width * 0.15));
            setYmin(Math.round(pdfDimensions.height * 0.15));
            setXmax(Math.round(pdfDimensions.width * 0.85));
            setYmax(Math.round(pdfDimensions.height * 0.85));
        }
    }, [pdfDimensions]);

    // Convert PDF coordinates to the browser's top-left-origin preview space.
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
        const pdfBottom = pdfDimensions.height - ymax;
        const pdfTop = pdfDimensions.height - ymin;
        return `[${xmin} ${pdfBottom} ${xmax} ${pdfTop}]`;
    }, [xmin, ymin, xmax, ymax, pdfDimensions.height]);

    const handleCropProcessing = async () => {
        if (!file) return;
        const validFile = file as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const result = await ExecutionManager.run({
                    tool: "crop",
                    files: [validFile],
                    params: {
                        box: compiledBoxString,
                        pages: selectedPagesPayload,
                    },
                    mode: processingMode,
                    password: validFile.originalPassword,
                });

                setDownloadData({
                    blob: result.blob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-cropped.pdf`,
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Crop PDF"
                description="Specify target dimension boundaries and crop your document pages down to custom canvas sizes instantly."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
                    {/* Controls Sidebar */}
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo
                            file={file}
                            onClear={() => {
                                setFile(null);
                                router.push(`/${toolId}`);
                            }}
                        />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Crop size={16} className="text-indigo-500" />
                                Bounding Box Parameters (Points)
                            </h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Min X (Left)</label>
                                    <input
                                        type="number"
                                        value={xmin}
                                        onChange={(e) => setXmin(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Min Y (Top)</label>
                                    <input
                                        type="number"
                                        value={ymin}
                                        onChange={(e) => setYmin(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Max X (Right)</label>
                                    <input
                                        type="number"
                                        value={xmax}
                                        onChange={(e) => setXmax(Math.min(pdfDimensions.width, parseInt(e.target.value) || 0))}
                                        className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Max Y (Bottom)</label>
                                    <input
                                        type="number"
                                        value={ymax}
                                        onChange={(e) => setYmax(Math.min(pdfDimensions.height, parseInt(e.target.value) || 0))}
                                        className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium"
                                    />
                                </div>
                            </div>

                            <div className="pt-3 border-t border-[color:var(--border)] flex items-center justify-between text-xs">
                                <span className="text-[color:var(--muted)]">Calculated Core Points:</span>
                                <span className="font-mono font-bold text-indigo-500 bg-indigo-500/10 px-2 py-1 rounded-md">{compiledBoxString}</span>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
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
                                    Current page
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
                                    All pages
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
                                    Custom range
                                </button>
                            </div>

                            {pageSelectionMode === "custom" && (
                                <div className="space-y-1 pt-1">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Pages (e.g. 1, 3, 5-8)</label>
                                    <input
                                        type="text"
                                        placeholder="1, 3, 5-8"
                                        value={customPagesInput}
                                        onChange={(e) => setCustomPagesInput(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium"
                                    />
                                </div>
                            )}

                            <div className="pt-2 border-t border-[color:var(--border)] flex items-center justify-between text-xs">
                                <span className="text-[color:var(--muted)]">Target Scope:</span>
                                <span className="font-semibold text-[color:var(--foreground)]">{selectedPagesPreview}</span>
                            </div>
                        </div>

                        {/* Processing Mode Selector */}
                        <div className="pt-2">
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={setProcessingMode}
                                disabled={isProcessing}
                            />
                        </div>

                        <PdfActionButton
                            text="Crop PDF Document"
                            loadingText="Cropping Canvas Space..."
                            loading={isProcessing}
                            disabled={isProcessing || preview.isLoading}
                            onClick={handleCropProcessing}
                        />
                    </div>

                    {/* Simulator Workspace */}
                    <div className="lg:col-span-7 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative w-full">
                        {preview.isLoading && (
                            <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                                Synchronizing document view matrix...
                            </div>
                        )}

                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                            <span className="flex items-center gap-2">
                                <Eye size={16} className="text-indigo-500" /> Workspace Canvas Simulator
                            </span>
                            {totalPages > 0 && (
                                <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => p - 1)}
                                        className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span>Page {currentPage} of {totalPages}</span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => p + 1)}
                                        className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="w-full flex items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] p-4 relative overflow-hidden">
                            <div ref={containerRef} className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full h-auto">
                                {preview.src ? (
                                    <img
                                        ref={imgRef}
                                        src={preview.src}
                                        alt="PDF Page Preview"
                                        className="max-w-full h-auto block rounded"
                                        onLoad={() => {
                                            if (imgRef.current && imgRef.current.clientWidth > 0) {
                                                setDisplayDimensions({
                                                    width: imgRef.current.clientWidth,
                                                    height: imgRef.current.clientHeight,
                                                });
                                            }
                                        }}
                                    />
                                ) : null}

                                {/* Interactive Resizing Bounding Overlay Selector */}
                                <div
                                    style={overlayStyles}
                                    className="absolute border-2 border-indigo-500 bg-indigo-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] cursor-move z-10"
                                    onMouseDown={(e) => handleMouseDown("move", e)}
                                >
                                    <div className="absolute top-1 left-1 bg-indigo-600 text-[8px] text-white font-bold px-1 py-0.5 rounded pointer-events-none select-none uppercase tracking-wider">
                                        Crop Box
                                    </div>

                                    {/* Corner Handles */}
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

                                    {/* Line Handles */}
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

                        {success && (
                            <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Document crop transformation successful!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        Your cropped document is ready to download.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
