"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Type,
    Loader2,
    ShieldCheck,
    ChevronLeft,
    ChevronRight,
    Eye,
    MousePointerSquareDashed,
    Trash2,
    Plus,
} from "lucide-react";

import { getFriendlyErrorMessage, handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";
import { getInitialProcessingMode } from "@/lib/security/pdfInputPreparation";
import { getDefaultTextPosition } from "@/lib/pdf/defaultTextPosition";
import { renderPdfPageToCanvas } from "@/lib/pdf/renderPdfPage";
import { awaitRasterStage } from "@/lib/execution/images/rasterLifecycle";

interface CustomPdfFile extends File {
    originalPassword?: string;
}

interface PdfJsRenderTask {
    cancel: () => void;
    promise: Promise<void>;
}

interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
    }) => PdfJsRenderTask;
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface TextElement {
    id: string;
    text: string;
    x: number; // PDF points from Top-Left
    y: number; // PDF points from Top-Left
    page: number;
    fontSize: number;
    color: string;
}

export default function AddTextWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    // Canvas Engine State
    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Matrix Scaling State (Maps HTML pixels -> PDF Points natively)
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const loadingTaskRef = useRef<{ destroy: () => void } | null>(null);

    // Document Editor State
    const [elements, setElements] = useState<TextElement[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>(() => getInitialProcessingMode(file));

    // Drag tracking system
    const dragRef = useRef<{
        id: string;
        startX: number;
        startY: number;
        initialPdfX: number;
        initialPdfY: number;
    } | null>(null);

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions, displayDimensions]);

    // Derived active element config mapping
    const activeElement = elements.find((el) => el.id === activeId);

    useEffect(() => {
        let isCancelled = false;
        const controller = new AbortController();
        const loadPdf = async () => {
            if (!file) {
                setPdfDocument(null);
                setIsRenderingCanvas(false);
                setPreviewError(null);
                setPdfDimensions({ width: 0, height: 0 });
                setDisplayDimensions({ width: 0, height: 0 });
                setTotalPages(0);
                setCurrentPage(1);
                return;
            }

            try {
                setIsRenderingCanvas(true);
                setPreviewError(null);
                const pdfjsLib = await awaitRasterStage(import("pdfjs-dist"), "starting the PDF preview", { signal: controller.signal });
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await awaitRasterStage(file.arrayBuffer(), "reading the PDF", { signal: controller.signal });
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                loadingTaskRef.current = loadingTask;
                const pdf = await awaitRasterStage(loadingTask.promise, "loading the PDF", {
                    signal: controller.signal,
                    onCancel: () => { void loadingTask.destroy(); },
                });
                if (isCancelled) return;
                loadingTaskRef.current = null;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
            } catch (err) {
                if (isCancelled || controller.signal.aborted) return;
                console.error("Failed to parse document context:", err);
                setPreviewError((err as Error)?.name === "RasterStageTimeoutError"
                    ? "PDF preview loading timed out. Try uploading the document again."
                    : "Could not load the PDF preview. Check that the file is valid and unlocked.");
            } finally {
                if (!isCancelled) setIsRenderingCanvas(false);
            }
        };

        void loadPdf();
        return () => {
            isCancelled = true;
            controller.abort();
            try { loadingTaskRef.current?.destroy(); } catch {}
            loadingTaskRef.current = null;
        };
    }, [file]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) {
            setIsRenderingCanvas(false);
            return;
        }

        const canvas = canvasRef.current;
        let isCancelled = false;
        const controller = new AbortController();

        const renderPage = async () => {
            setIsRenderingCanvas(true);
            setPreviewError(null);
            let activeRenderTask: PdfJsRenderTask | null = null;
            try {
                if (renderTaskRef.current) renderTaskRef.current.cancel();
                const dimensions = await renderPdfPageToCanvas(pdfDocument, currentPage, canvas, {
                    signal: controller.signal,
                    onTask: (task) => {
                        if (task) {
                            activeRenderTask = task;
                            renderTaskRef.current = task;
                        } else if (renderTaskRef.current === activeRenderTask) {
                            renderTaskRef.current = null;
                        }
                    },
                });
                if (isCancelled) return;
                setPdfDimensions({ width: dimensions.pageWidth, height: dimensions.pageHeight });
                setDisplayDimensions({ width: dimensions.displayWidth, height: dimensions.displayHeight });
            } catch (err: unknown) {
                if (isCancelled || controller.signal.aborted || (err as Error)?.name === "RenderingCancelledException") return;
                console.error("Canvas raster failed:", err);
                setPreviewError("The page preview could not be rendered. Change pages or upload the PDF again to retry.");
            } finally {
                if (!isCancelled) {
                    renderTaskRef.current = null;
                    setIsRenderingCanvas(false);
                }
            }
        };

        void renderPage();

        const updateDisplaySize = () => {
            if (canvasRef.current) {
                setDisplayDimensions({
                    width: canvasRef.current.clientWidth,
                    height: canvasRef.current.clientHeight,
                });
            }
        };

        window.addEventListener("resize", updateDisplaySize);
        return () => {
            isCancelled = true;
            controller.abort();
            window.removeEventListener("resize", updateDisplaySize);
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, currentPage]);

    // Pointer Drag Physics System
    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragRef.current || pdfDimensions.width === 0) return;

            const { id, startX, startY, initialPdfX, initialPdfY } = dragRef.current;

            const deltaPdfX = (e.clientX - startX) / scaleFactor;
            const deltaPdfY = (e.clientY - startY) / scaleFactor;

            setElements((prev) =>
                prev.map((el) => {
                    if (el.id === id) {
                        return {
                            ...el,
                            x: Math.max(0, initialPdfX + deltaPdfX),
                            y: Math.max(0, initialPdfY + deltaPdfY),
                        };
                    }
                    return el;
                })
            );
        };

        const handlePointerUp = () => {
            dragRef.current = null;
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [scaleFactor, pdfDimensions]);

    // Box Controls
    const addTextBox = () => {
        if (!pdfDimensions.width || !pdfDimensions.height || isRenderingCanvas || previewError) return;
        const newId = Math.random().toString(36).substring(7);
        const position = getDefaultTextPosition(pdfDimensions.width, pdfDimensions.height, 24);
        const newElement: TextElement = {
            id: newId,
            text: "Type here...",
            x: position.x,
            y: position.y,
            page: currentPage,
            fontSize: position.fontSize,
            color: "#000000",
        };
        setElements([...elements, newElement]);
        setActiveId(newId);
    };

    const updateActiveElement = (updates: Partial<TextElement>) => {
        if (!activeId) return;
        setElements((prev) =>
            prev.map((el) => (el.id === activeId ? { ...el, ...updates } : el))
        );
    };

    const deleteActiveElement = () => {
        if (!activeId) return;
        setElements((prev) => prev.filter((el) => el.id !== activeId));
        setActiveId(null);
    };

    const handleTextProcessing = async () => {
        if (!file) return;
        const validElements = elements.filter((e) => e.text.trim() !== "");

        if (validElements.length === 0) {
            notify("Please add at least one text box with text content.", "warning");
            return;
        }

        const validFile = file as CustomPdfFile;

        setDownloadData(null);
        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const response = await ExecutionManager.run({
                    tool: "add_text",
                    files: [validFile],
                    params: {
                        elements: validElements,
                    },
                    mode: processingMode,
                    password: validFile.originalPassword,
                });

                setDownloadData({
                    blob: response.blob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-text-added.pdf`,
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

    const surfaceClass =
        "w-full flex flex-col items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4 relative overflow-hidden min-h-[420px]";

    return (
        <>
            <PdfToolHero
                title="Add Text to PDF"
                description="New text boxes start in the lower page margin, where their placement is easy to preview. Drag a box anywhere, including over existing content, before exporting."
            />

            <div className="mt-12 w-full rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                    {/* Controls Sidebar */}
                    <div className="space-y-6 lg:col-span-5">
                        <PdfFileInfo
                            file={file}
                            onClear={() => {
                                setFile(null);
                                router.push(`/${toolId}`);
                            }}
                        />

                        <div className="space-y-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/50 p-5">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                                    <Type size={16} className="text-indigo-500" />
                                    Text Box Properties
                                </h3>

                                <button
                                    type="button"
                                    onClick={addTextBox}
                                    disabled={isRenderingCanvas || !pdfDimensions.width || Boolean(previewError)}
                                    className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow transition hover:bg-indigo-600"
                                >
                                    <Plus size={12} /> Add Box
                                </button>
                            </div>
                            <p className="text-xs text-[color:var(--muted)]">New boxes start in the lower margin. Drag them to any placement, including intentional overlaps.</p>

                            {activeElement ? (
                                <div className="animate-fadeIn space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-bold uppercase text-[color:var(--muted-foreground)]">
                                                Font Size (pt)
                                            </label>
                                            <input
                                                type="number"
                                                min={8}
                                                max={144}
                                                value={activeElement.fontSize}
                                                onChange={(e) =>
                                                    updateActiveElement({ fontSize: parseInt(e.target.value) || 24 })
                                                }
                                                className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-bold uppercase text-[color:var(--muted-foreground)]">
                                                Text Color
                                            </label>
                                            <div className="flex h-full items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={activeElement.color}
                                                    onChange={(e) => updateActiveElement({ color: e.target.value })}
                                                    className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                                                />
                                                <span className="font-mono text-sm text-[color:var(--muted-foreground)]">
                          {activeElement.color.toUpperCase()}
                        </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-2">
                    <span className="text-xs font-mono text-[color:var(--muted-foreground)]">
                      X: {Math.round(activeElement.x)} Y: {Math.round(activeElement.y)}
                    </span>
                                        <button
                                            onClick={deleteActiveElement}
                                            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/20 hover:text-red-600"
                                        >
                                            <Trash2 size={14} /> Remove Box
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[color:var(--border)] py-6 text-center text-[color:var(--muted-foreground)]">
                                    <MousePointerSquareDashed size={24} className="mb-2 opacity-50" />
                                    <p className="text-sm font-medium">No box selected</p>
                                    <p className="mt-1 text-xs opacity-70">Click a box on the canvas or add a new one.</p>
                                </div>
                            )}
                        </div>

                        <div className="w-full">
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={setProcessingMode}
                                disabled={isProcessing}
                            />
                        </div>

                        <PdfActionButton
                            text="Stamp Text onto Document"
                            loadingText="Rendering Vector Blocks..."
                            loading={isProcessing}
                            disabled={isProcessing || isRenderingCanvas || Boolean(previewError) || elements.length === 0}
                            onClick={handleTextProcessing}
                        />
                    </div>

                    {/* WYSIWYG Document Editor Preview Panel */}
                    <div className="relative flex w-full flex-col rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-6 lg:col-span-7">
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-[color:var(--background)]/40 text-xs font-medium text-[color:var(--muted-foreground)] backdrop-blur-sm">
                                <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                                Rendering Document Matrix...
                            </div>
                        )}

                        <div className="mb-4 flex w-full items-center justify-between border-b border-[color:var(--border)] pb-3 text-sm font-bold text-[color:var(--foreground)]">
              <span className="flex items-center gap-2">
                <Eye size={16} className="text-indigo-500" /> Interactive Canvas
              </span>

                            {totalPages > 0 && (
                                <div className="select-none rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted-foreground)]">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage((p) => p - 1)}
                                        className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="mx-2">
                    Page {currentPage} of {totalPages}
                  </span>
                                    <button
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage((p) => p + 1)}
                                        className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Interactive Wrapper Engine */}
                        <div className={surfaceClass} onClick={() => setActiveId(null)}>
                            <div
                                ref={containerRef}
                                className="relative max-w-full rounded border border-[color:var(--border)] bg-[var(--card)] shadow-xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {previewError && (
                                    <div role="alert" className="absolute inset-0 z-30 flex items-center justify-center bg-red-500/10 p-6 text-center text-sm text-red-700">
                                        {previewError}
                                    </div>
                                )}
                                <canvas
                                    ref={canvasRef}
                                    className="block h-auto max-w-full rounded pointer-events-none"
                                />

                                {/* Absolute positioned interactive editor overlays */}
                                {elements
                                    .filter((el) => el.page === currentPage)
                                    .map((el) => {
                                        const isActive = activeId === el.id;

                                        const POINT_TO_PX = 96 / 72;
                                        const renderedFontSize = el.fontSize * POINT_TO_PX * scaleFactor;

                                        return (
                                            <div
                                                key={el.id}
                                                onPointerDown={(e) => {
                                                    e.stopPropagation();
                                                    setActiveId(el.id);
                                                    dragRef.current = {
                                                        id: el.id,
                                                        startX: e.clientX,
                                                        startY: e.clientY,
                                                        initialPdfX: el.x,
                                                        initialPdfY: el.y,
                                                    };
                                                }}
                                                style={{
                                                    position: "absolute",
                                                    left: `${el.x * scaleFactor}px`,
                                                    top: `${el.y * scaleFactor}px`,
                                                    minWidth: "40px",
                                                }}
                                                className={`z-10 cursor-move transition-shadow ${
                                                    isActive
                                                        ? "z-20 rounded bg-indigo-500/5 ring-2 ring-indigo-500 shadow-lg"
                                                        : "hover:ring-1 hover:ring-[color:var(--border)]"
                                                }`}
                                            >
                        <textarea
                            value={el.text}
                            onChange={(e) => {
                                setElements((prev) =>
                                    prev.map((item) =>
                                        item.id === el.id ? { ...item, text: e.target.value } : item
                                    )
                                );
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onFocus={() => setActiveId(el.id)}
                            style={{
                                fontSize: `${renderedFontSize}px`,
                                color: el.color,
                                fontFamily: "Helvetica, Arial, sans-serif",
                                lineHeight: "1.2",
                                whiteSpace: "pre",
                            }}
                            className="m-0 min-h-[1.5em] min-w-[50px] resize-none border-none bg-transparent p-1 font-semibold outline-none overflow-hidden"
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = "auto";
                                target.style.width = "auto";
                                target.style.height = `${target.scrollHeight}px`;
                                target.style.width = `${target.scrollWidth}px`;
                            }}
                            rows={el.text.split("\n").length || 1}
                        />
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {success && (
                            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-[color:var(--foreground)]">
                                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold text-[color:var(--foreground)]">
                                        Text successfully applied!
                                    </p>
                                    <p className="mt-0.5 text-[color:var(--muted-foreground)]">
                                        The text boxes and configuration layers were stamped securely into your PDF vectors.
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
