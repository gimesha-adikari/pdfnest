"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Type, Loader2, ShieldCheck, ChevronLeft, ChevronRight, Eye, MousePointerSquareDashed, Trash2, Plus } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

interface CustomPdfFile extends File { originalPassword?: string; }
interface PdfJsRenderTask { cancel: () => void; promise: Promise<void>; }
interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => PdfJsRenderTask;
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

    // Matrix Scaling State (Maps HTML pixels -> PDF Points natively)
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);

    // Document Editor State
    const [elements, setElements] = useState<TextElement[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    // Drag tracking system
    const dragRef = useRef<{ id: string; startX: number; startY: number; initialPdfX: number; initialPdfY: number } | null>(null);

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions, displayDimensions]);

    // Derived active element config mapping
    const activeElement = elements.find(el => el.id === activeId);

    useEffect(() => {
        if (!file) {
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            return;
        }

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
            } catch (err) {
                console.error("Failed to parse document context:", err);
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        loadPdf();
    }, [file]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;

        const renderPage = async () => {
            try {
                setIsRenderingCanvas(true);

                if (renderTaskRef.current) renderTaskRef.current.cancel();

                const page = await pdfDocument.getPage(currentPage);
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
                    viewport: renderViewport
                });
                renderTaskRef.current = renderTask;

                await renderTask.promise;
                renderTaskRef.current = null;

                setTimeout(() => {
                    if (canvasRef.current) {
                        setPdfDimensions({ width: baseViewport.width, height: baseViewport.height });
                        setDisplayDimensions({
                            width: canvasRef.current.clientWidth,
                            height: canvasRef.current.clientHeight
                        });
                    }
                }, 0);
            } catch (err: unknown) {
                if ((err as Error)?.name !== "RenderingCancelledException") {
                    console.error("Canvas raster skipped:", err);
                }
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        renderPage();

        const updateDisplaySize = () => {
            if (canvasRef.current) {
                setDisplayDimensions({ width: canvasRef.current.clientWidth, height: canvasRef.current.clientHeight });
            }
        };

        window.addEventListener("resize", updateDisplaySize);
        return () => {
            window.removeEventListener("resize", updateDisplaySize);
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, currentPage]);

    // Pointer Drag Physics System
    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!dragRef.current || pdfDimensions.width === 0) return;

            const { id, startX, startY, initialPdfX, initialPdfY } = dragRef.current;

            // Calculate movement delta scaled back to real PDF Points
            const deltaPdfX = (e.clientX - startX) / scaleFactor;
            const deltaPdfY = (e.clientY - startY) / scaleFactor;

            setElements(prev => prev.map(el => {
                if (el.id === id) {
                    return {
                        ...el,
                        x: Math.max(0, initialPdfX + deltaPdfX), // clamp to edge
                        y: Math.max(0, initialPdfY + deltaPdfY)
                    };
                }
                return el;
            }));
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
        const newId = Math.random().toString(36).substring(7);
        const newElement: TextElement = {
            id: newId,
            text: "Type here...",
            x: 50,
            y: 50,
            page: currentPage,
            fontSize: 24,
            color: "#000000"
        };
        setElements([...elements, newElement]);
        setActiveId(newId);
    };

    const updateActiveElement = (updates: Partial<TextElement>) => {
        if (!activeId) return;
        setElements(prev => prev.map(el => el.id === activeId ? { ...el, ...updates } : el));
    };

    const deleteActiveElement = () => {
        if (!activeId) return;
        setElements(prev => prev.filter(el => el.id !== activeId));
        setActiveId(null);
    };

    const handleTextProcessing = async () => {
        if (!file) return;
        const validElements = elements.filter(e => e.text.trim() !== "");

        if (validElements.length === 0) {
            notify("Please add at least one text box with text content.","warning");
            return;
        }

        const validFile = file as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("elements", JSON.stringify(validElements));

                if (validFile.originalPassword) formData.append("file_password", validFile.originalPassword);

                const responseBlob = await uploadAndDownloadFile("/api/structure/add-text", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-text-added.pdf`
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
                title="Add Text to PDF"
                description="Drag, drop, and type. Place text boxes anywhere on your document pages effortlessly like a real editor."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">

                    {/* Controls Sidebar */}
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo file={file} onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }} />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <Type size={16} className="text-indigo-500" />
                                    Text Box Properties
                                </h3>
                                <button
                                    onClick={addTextBox}
                                    className="text-[10px] px-2.5 py-1.5 font-bold rounded-lg bg-indigo-500 text-white shadow hover:bg-indigo-600 transition flex items-center gap-1 uppercase tracking-wider"
                                >
                                    <Plus size={12} /> Add Box
                                </button>
                            </div>

                            {activeElement ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Font Size (pt)</label>
                                            <input
                                                type="number"
                                                min={8}
                                                max={144}
                                                value={activeElement.fontSize}
                                                onChange={(e) => updateActiveElement({ fontSize: parseInt(e.target.value) || 24 })}
                                                className="w-full px-4 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium transition focus:border-indigo-500"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Text Color</label>
                                            <div className="flex items-center gap-2 h-full">
                                                <input
                                                    type="color"
                                                    value={activeElement.color}
                                                    onChange={(e) => updateActiveElement({ color: e.target.value })}
                                                    className="h-9 w-9 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                                                />
                                                <span className="text-sm font-mono text-[color:var(--muted)]">{activeElement.color.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-[color:var(--border)] flex justify-between items-center">
                                        <span className="text-xs text-[color:var(--muted)] font-mono">
                                            X: {Math.round(activeElement.x)} Y: {Math.round(activeElement.y)}
                                        </span>
                                        <button
                                            onClick={deleteActiveElement}
                                            className="text-xs flex items-center gap-1.5 text-red-500 hover:text-red-600 font-semibold transition bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg"
                                        >
                                            <Trash2 size={14} /> Remove Box
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center text-[color:var(--muted)] border-2 border-dashed border-[color:var(--border)] rounded-xl">
                                    <MousePointerSquareDashed size={24} className="mb-2 opacity-50" />
                                    <p className="text-sm font-medium">No box selected</p>
                                    <p className="text-xs opacity-70 mt-1">Click a box on the canvas or add a new one.</p>
                                </div>
                            )}
                        </div>

                        <PdfActionButton
                            text="Stamp Text onto Document"
                            loadingText="Rendering Vector Blocks..."
                            loading={isProcessing}
                            disabled={isProcessing || isRenderingCanvas || elements.length === 0}
                            onClick={handleTextProcessing}
                        />
                    </div>

                    {/* WYSIWYG Document Editor Preview Panel */}
                    <div className="lg:col-span-7 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative w-full">
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                                Rendering Document Matrix...
                            </div>
                        )}

                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                            <span className="flex items-center gap-2"><Eye size={16} className="text-indigo-500" /> Interactive Canvas</span>
                            {totalPages > 0 && (
                                <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                                    <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"><ChevronLeft size={14} /></button>
                                    <span>Page {currentPage} of {totalPages}</span>
                                    <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"><ChevronRight size={14} /></button>
                                </div>
                            )}
                        </div>

                        {/* Interactive Wrapper Engine */}
                        <div
                            className="w-full flex flex-col items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] p-4 relative overflow-hidden min-h-[420px]"
                            onClick={() => setActiveId(null)}
                        >
                            <div ref={containerRef} className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full h-auto" onClick={e => e.stopPropagation()}>
                                <canvas ref={canvasRef} className="max-w-full h-auto block rounded pointer-events-none" />

                                {/* Absolute positioned interactive editor overlays */}
                                {elements.filter(el => el.page === currentPage).map(el => {
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
                                                    initialPdfY: el.y
                                                };
                                            }}
                                            style={{
                                                position: "absolute",
                                                left: `${el.x * scaleFactor}px`,
                                                top: `${el.y * scaleFactor}px`,
                                                // Adjust visual padding to avoid cropping tall characters
                                                minWidth: "40px",
                                            }}
                                            className={`cursor-move transition-shadow ${isActive ? 'ring-2 ring-indigo-500 bg-indigo-500/5 rounded shadow-lg z-20' : 'hover:ring-1 hover:ring-[color:var(--border)] z-10'}`}
                                        >
                                            <textarea
                                                value={el.text}
                                                onChange={(e) => {
                                                    setElements(prev => prev.map(item => item.id === el.id ? { ...item, text: e.target.value } : item));
                                                }}
                                                // Prevent mouse events from triggering drag when typing inside the box
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onFocus={() => setActiveId(el.id)}
                                                style={{
                                                    fontSize: `${renderedFontSize}px`,
                                                    color: el.color,
                                                    fontFamily: "Helvetica, Arial, sans-serif",
                                                    lineHeight: "1.2",
                                                    whiteSpace: "pre",
                                                }}
                                                className="bg-transparent border-none outline-none resize-none overflow-hidden m-0 p-1 font-semibold min-h-[1.5em] min-w-[50px]"
                                                // Auto-expand textarea horizontally and vertically to match text length
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
                            <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Text successfully applied!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
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