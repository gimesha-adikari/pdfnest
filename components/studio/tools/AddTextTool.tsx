"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MousePointerSquareDashed, Plus, ShieldCheck, Trash2, Type } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

interface PdfJsRenderTask {
    cancel: () => void;
    promise: Promise<void>;
}

interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => PdfJsRenderTask;
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface CustomPdfFile extends File {
    originalPassword?: string;
}

interface TextElement {
    id: string;
    text: string;
    x: number;
    y: number;
    page: number;
    fontSize: number;
    color: string;
}

interface AddTextToolProps {
    baseFile: File | null;
    onTextApplied: (file: File) => Promise<void>;
}

export default function AddTextTool({ baseFile, onTextApplied }: AddTextToolProps) {
    const { requireAuth } = useAuth();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [elements, setElements] = useState<TextElement[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
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
    }, [pdfDimensions.width, displayDimensions.width]);

    const activeElement = useMemo(
        () => elements.find((el) => el.id === activeId) ?? null,
        [elements, activeId]
    );

    const loadPdfJs = useCallback(async () => {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
        return pdfjsLib;
    }, []);

    useEffect(() => {
        if (!baseFile) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            setElements([]);
            setActiveId(null);
            setSuccess(false);
            setError(null);
            return;
        }

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                setError(null);
                setSuccess(false);
                setElements([]);
                setActiveId(null);
                setCurrentPage(1);

                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;

                if (cancelled) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);

                const firstPage = await pdf.getPage(1);
                const viewport = firstPage.getViewport({ scale: 1 });
                setPdfDimensions({ width: viewport.width, height: viewport.height });
                setDisplayDimensions({
                    width: canvasRef.current?.clientWidth || viewport.width,
                    height: canvasRef.current?.clientHeight || viewport.height,
                });
            } catch (err) {
                console.error(err);
                setError(handleClientError(err));
            }finally {
                if (!cancelled) setIsRenderingCanvas(false);
            }
        };

        void loadPdf();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [baseFile, loadPdfJs]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;

        let cancelled = false;

        const renderPage = async () => {
            try {
                setIsRenderingCanvas(true);
                if (renderTaskRef.current) renderTaskRef.current.cancel();

                const page = await pdfDocument.getPage(currentPage);
                if (cancelled) return;

                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const baseViewport = page.getViewport({ scale: 1.0 });
                const renderViewport = page.getViewport({ scale: 1.5 });

                canvas.width = renderViewport.width;
                canvas.height = renderViewport.height;

                const renderTask = page.render({
                    canvasContext: ctx,
                    viewport: renderViewport,
                });

                renderTaskRef.current = renderTask;
                await renderTask.promise;
                renderTaskRef.current = null;

                setTimeout(() => {
                    if (canvasRef.current) {
                        setPdfDimensions({ width: baseViewport.width, height: baseViewport.height });
                        setDisplayDimensions({
                            width: canvasRef.current.clientWidth,
                            height: canvasRef.current.clientHeight,
                        });
                    }
                }, 0);
            } catch (err: unknown) {
                if ((err as Error)?.name !== "RenderingCancelledException") {
                    console.error("Canvas raster skipped:", err);
                }
            } finally {
                if (!cancelled) setIsRenderingCanvas(false);
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
            cancelled = true;
            window.removeEventListener("resize", updateDisplaySize);
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, currentPage]);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragRef.current || pdfDimensions.width === 0) return;

            const { id, startX, startY, initialPdfX, initialPdfY } = dragRef.current;
            const deltaPdfX = (e.clientX - startX) / scaleFactor;
            const deltaPdfY = (e.clientY - startY) / scaleFactor;

            setElements((prev) =>
                prev.map((el) => {
                    if (el.id !== id) return el;
                    return {
                        ...el,
                        x: Math.max(0, initialPdfX + deltaPdfX),
                        y: Math.max(0, initialPdfY + deltaPdfY),
                    };
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
    }, [scaleFactor, pdfDimensions.width]);

    const addTextBox = () => {
        const newId = Math.random().toString(36).substring(7);
        const newElement: TextElement = {
            id: newId,
            text: "Type here...",
            x: 50,
            y: 50,
            page: currentPage,
            fontSize: 24,
            color: "#000000",
        };

        setElements((prev) => [...prev, newElement]);
        setActiveId(newId);
    };

    const updateActiveElement = (updates: Partial<TextElement>) => {
        if (!activeId) return;
        setElements((prev) => prev.map((el) => (el.id === activeId ? { ...el, ...updates } : el)));
    };

    const deleteActiveElement = () => {
        if (!activeId) return;
        setElements((prev) => prev.filter((el) => el.id !== activeId));
        setActiveId(null);
    };

    const handleTextProcessing = () => {
        if (!baseFile) return;

        const validElements = elements.filter((e) => e.text.trim() !== "");
        if (validElements.length === 0) {
            notify("Please add at least one text box with text content.","info");
            return;
        }

        const validFile = baseFile as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);
                setError(null);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("elements", JSON.stringify(validElements));

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/add-text", formData);
                const updatedFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-text-added.pdf`,
                    { type: "application/pdf" }
                );

                await onTextApplied(updatedFile);
                setSuccess(true);
                notify("Text added PDF loaded back into Studio.","success");
            } catch (err) {
                console.error(err);
                setError(getFriendlyErrorMessage(err));
                handleClientError(error)
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-muted">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    const currentPageElements = elements.filter((el) => el.page === currentPage);

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Type size={16} className="text-indigo-500" />
                            Text Box Properties
                        </h3>

                        <div className="space-y-3 rounded-2xl border border-border bg-(--background)/40 p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground">
                                    Page {currentPage} / {totalPages || "?"}
                                </span>
                                <button
                                    type="button"
                                    onClick={addTextBox}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                                >
                                    <Plus size={12} /> Add Box
                                </button>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted">
                                <span>Total boxes</span>
                                <span className="font-semibold text-foreground">{elements.length}</span>
                            </div>
                        </div>

                        {activeElement ? (
                            <div className="space-y-4 animate-fadeIn">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted">
                                        Text
                                    </label>
                                    <textarea
                                        value={activeElement.text}
                                        onChange={(e) => updateActiveElement({ text: e.target.value })}
                                        className="min-h-27.5 w-full rounded-xl border border-border
                                        bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase text-muted">
                                            Font Size (pt)
                                        </label>
                                        <input
                                            type="number"
                                            min={8}
                                            max={144}
                                            value={activeElement.fontSize}
                                            onChange={(e) =>
                                                updateActiveElement({ fontSize: parseInt(e.target.value, 10) || 24 })
                                            }
                                            className="w-full rounded-xl border border-border bg-background
                                            px-4 py-2 text-sm font-medium text-foreground outline-none
                                            transition focus:border-indigo-500"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase text-muted">
                                            Text Color
                                        </label>
                                        <div className="flex items-center gap-2 h-full">
                                            <input
                                                type="color"
                                                value={activeElement.color}
                                                onChange={(e) =>
                                                    updateActiveElement({ color: e.target.value })}
                                                className="h-9 w-9 rounded-lg cursor-pointer bg-transparent
                                                border-0 p-0"
                                            />
                                            <span className="text-sm font-mono text-muted">
                                                {activeElement.color.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-border flex justify-between items-center">
                                    <span className="text-xs text-muted font-mono">
                                        X: {Math.round(activeElement.x)} Y: {Math.round(activeElement.y)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={deleteActiveElement}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10
                                        px-3 py-1.5 text-xs font-semibold text-red-500 transition
                                        hover:bg-red-500/20 hover:text-red-600"
                                    >
                                        <Trash2 size={14} /> Remove Box
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-xl border-2
                            border-dashed border-border py-6 text-center text-muted">
                                <MousePointerSquareDashed size={24} className="mb-2 opacity-50" />
                                <p className="text-sm font-medium">No box selected</p>
                                <p className="mt-1 text-xs opacity-70">Click a box on the canvas or add a new one.</p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-2xl border border-red-500/20 bg-red-50/50 p-4 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30
                            bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                                <div className="text-xs">
                                    <p className="font-semibold">Text successfully applied!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The text boxes and configuration layers were stamped securely into your PDF vectors.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleTextProcessing}
                            disabled={isProcessing || isRenderingCanvas || elements.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl
                            bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition
                            hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing || isRenderingCanvas ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Type size={16} />
                            )}
                            Stamp Text onto Document
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border
                bg-(--background)/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-border pb-3 text-sm
                    font-bold text-foreground">
                        <span className="flex items-center gap-2">
                            <Type size={16} className="text-indigo-500" />
                            Interactive Canvas
                        </span>

                        {totalPages > 0 && (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-0.5 font-mono text-xs text-[color:var(--muted)] select-none">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() => setCurrentPage((p) => p - 1)}
                                    className="transition hover:text-foreground disabled:opacity-20"
                                >
                                    <Loader2 size={14} className="rotate-180 opacity-0" />
                                </button>
                                <span>
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => setCurrentPage((p) => p + 1)}
                                    className="transition hover:text-foreground disabled:opacity-20"
                                >
                                    <Loader2 size={14} className="opacity-0" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div
                        className="relative flex min-h-105 w-full items-start justify-start overflow-auto
                        rounded-xl border border-border bg-gray-500/5 p-4 dark:bg-black/20"
                        onClick={() => setActiveId(null)}
                    >
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center
                            rounded-xl bg-(--background)/40 text-xs font-medium text-muted backdrop-blur-sm">
                                <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                                Rendering Document Matrix...
                            </div>
                        )}

                        <div
                            ref={containerRef}
                            className="relative inline-block rounded border border-gray-400/20 bg-white
                            shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <canvas ref={canvasRef} className="block select-none pointer-events-none" />

                            {currentPageElements.map((el) => {
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
                                        className={`cursor-move transition-shadow ${
                                            isActive
                                                ? "z-20 rounded bg-indigo-500/5 shadow-lg ring-2 " +
                                                "ring-indigo-500"
                                                : "z-10 hover:ring-1 hover:ring-border"
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
                                            className="m-0 min-h-[1.5em] min-w-12.5 resize-none overflow-hidden rounded-md border-none bg-transparent p-1 font-semibold outline-none"
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
                </div>
            </div>
        </div>
    );
}
