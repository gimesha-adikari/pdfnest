"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Loader2,
    MousePointerSquareDashed,
    ScanText,
    ShieldAlert,
    Trash2,
    Type,
    Undo2,
    Redo2,
    ChevronLeft,
    ChevronRight,
    Eye,
    ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {getBaseUrl, uploadAndDownloadFile} from "@/lib/api";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { FileWithPassword } from "@/lib/types";

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

interface DrawnBox {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PageAnalysis {
    page: number;
    kind: "text" | "scanned" | "mixed" | "blank" | "unknown";
    hasSelectableText: boolean;
    wordCount: number;
    textBlockCount: number;
    imageBlockCount: number;
    textAreaRatio: number;
    imageAreaRatio: number;
}

interface PDFAnalysis {
    pageCount: number;
    pages: PageAnalysis[];
}

interface RedactToolProps {
    baseFile: File | null;
    onRedactedFile: (file: File) => Promise<void>;
}

type RedactMode = "text" | "draw";

async function loadPdfJs() {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
    return pdfjsLib;
}

function prettyKind(kind: PageAnalysis["kind"] | undefined) {
    switch (kind) {
        case "text":
            return "Text";
        case "scanned":
            return "Scanned";
        case "mixed":
            return "Mixed";
        case "blank":
            return "Blank";
        default:
            return "Unknown";
    }
}

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function RedactTool({ baseFile, onRedactedFile }: RedactToolProps) {
    const { requireAuth } = useAuth();

    const baseUrl = getBaseUrl();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [mode, setMode] = useState<RedactMode>("text");
    const [keywords, setKeywords] = useState("");
    const [drawnBoxes, setDrawnBoxes] = useState<DrawnBox[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [currentBox, setCurrentBox] = useState<DrawnBox | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [pageAnalysisMap, setPageAnalysisMap] = useState<Record<number, PageAnalysis>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisLoaded, setAnalysisLoaded] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [historyPast, setHistoryPast] = useState<DrawnBox[][]>([]);
    const [historyFuture, setHistoryFuture] = useState<DrawnBox[][]>([]);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const drawStartRef = useRef<{ x: number; y: number } | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions.width, displayDimensions.width]);

    const currentPageAnalysis = useMemo(() => pageAnalysisMap[currentPage] ?? null, [pageAnalysisMap, currentPage]);
    const pageKind = currentPageAnalysis?.kind ?? (analysisLoaded ? "unknown" : null);
    const isScannedPage = pageKind === "scanned";
    const isTextPage = pageKind === "text";
    const isMixedPage = pageKind === "mixed";
    const canUseSmartMode = pageKind !== "scanned" && pageKind !== "blank";
    const currentPageBoxes = useMemo(
        () => drawnBoxes.filter((b) => b.page === currentPage),
        [drawnBoxes, currentPage]
    );

    const updateBoxesStateWithHistory = useCallback(
        (nextState: DrawnBox[] | ((prev: DrawnBox[]) => DrawnBox[])) => {
            setDrawnBoxes((prev) => {
                const computedNext = typeof nextState === "function" ? nextState(prev) : nextState;
                setHistoryPast((past) => [...past, prev]);
                setHistoryFuture([]);
                return computedNext;
            });
        },
        []
    );

    const handleUndoAction = useCallback(() => {
        setHistoryPast((past) => {
            if (past.length === 0) return past;
            const previousState = past[past.length - 1];
            const updatedPast = past.slice(0, -1);
            setHistoryFuture((future) => [drawnBoxes, ...future]);
            setDrawnBoxes(previousState);
            setActiveId(null);
            return updatedPast;
        });
    }, [drawnBoxes]);

    const handleRedoAction = useCallback(() => {
        setHistoryFuture((future) => {
            if (future.length === 0) return future;
            const nextState = future[0];
            const updatedFuture = future.slice(1);
            setHistoryPast((past) => [...past, drawnBoxes]);
            setDrawnBoxes(nextState);
            setActiveId(null);
            return updatedFuture;
        });
    }, [drawnBoxes]);

    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            const isMeta = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (isMeta && key === "z") {
                e.preventDefault();
                if (e.shiftKey) handleRedoAction();
                else handleUndoAction();
            } else if (isMeta && key === "y") {
                e.preventDefault();
                handleRedoAction();
            }
        };

        window.addEventListener("keydown", handleKeyboard);
        return () => window.removeEventListener("keydown", handleKeyboard);
    }, [handleRedoAction, handleUndoAction]);

    useEffect(() => {
        if (!baseFile) {
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            setMode("text");
            setKeywords("");
            setDrawnBoxes([]);
            setActiveId(null);
            setCurrentBox(null);
            setIsDrawing(false);
            setSuccess(false);
            setPageAnalysisMap({});
            setAnalysisLoaded(false);
            setAnalysisError(null);
            setIsAnalyzing(false);
            setHistoryPast([]);
            setHistoryFuture([]);
            return;
        }

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = await baseFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

                if (cancelled) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
            } catch (err) {
                console.error("Failed to parse document:", err);
            } finally {
                if (!cancelled) setIsRenderingCanvas(false);
            }
        };

        void loadPdf();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [baseFile]);

    useEffect(() => {
        if (!baseFile) return;

        if (analysisAbortRef.current) analysisAbortRef.current.abort();
        const controller = new AbortController();
        analysisAbortRef.current = controller;

        const analyze = async () => {
            try {
                setIsAnalyzing(true);
                setAnalysisLoaded(false);
                setAnalysisError(null);

                const formData = new FormData();
                formData.append("file", baseFile);

                const maybePassword = (baseFile as FileWithPassword).originalPassword;
                if (maybePassword) formData.append("file_password", maybePassword);

                const response = await fetch(`${baseUrl}/api/structure/analyze`, {
                    method: "POST",
                    body: formData,
                    signal: controller.signal,
                });

                const raw = await response.text();
                if (!response.ok) {
                    let message = raw || `Server rejected request with status ${response.status}`;
                    try {
                        const parsed = JSON.parse(raw);
                        message = parsed.message || parsed.error || message;
                    } catch {
                        // keep raw text
                    }
                    throw new Error(message);
                }

                const parsed = JSON.parse(raw) as PDFAnalysis;
                const map: Record<number, PageAnalysis> = {};
                for (const page of parsed.pages ?? []) map[page.page] = page;

                setPageAnalysisMap(map);
                setAnalysisLoaded(true);
            } catch (err) {
                if ((err as Error)?.name !== "AbortError") {
                    console.error("Failed to analyze PDF:", err);
                    setAnalysisError((err as Error)?.message || "Failed to analyze PDF.");
                    setPageAnalysisMap({});
                    setAnalysisLoaded(false);
                }
            } finally {
                if (!controller.signal.aborted) setIsAnalyzing(false);
            }
        };

        void analyze();
        return () => controller.abort();
    }, [baseFile, baseUrl]);

    useEffect(() => {
        if (!currentPageAnalysis) return;
        if (currentPageAnalysis.kind === "scanned" && mode === "text") {
            setMode("draw");
        }
    }, [currentPageAnalysis, mode]);

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
                    console.error("Canvas render skipped:", err);
                }
            } finally {
                setIsRenderingCanvas(false);
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
            window.removeEventListener("resize", updateDisplaySize);
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [currentPage, pdfDocument]);

    const drawPageBoxes = (pageNum: number) => drawnBoxes.filter((b) => b.page === pageNum);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
        if (mode !== "draw") return;
        const canvas = containerRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setIsDrawing(true);
        drawStartRef.current = { x: mouseX, y: mouseY };
        setCurrentBox({
            id: "temp",
            page: pageNum,
            x: mouseX / rect.width,
            y: mouseY / rect.height,
            width: 0,
            height: 0,
        });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
        if (!isDrawing || mode !== "draw" || !drawStartRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        const x = Math.min(drawStartRef.current.x, currentX) / rect.width;
        const y = Math.min(drawStartRef.current.y, currentY) / rect.height;
        const width = Math.abs(drawStartRef.current.x - currentX) / rect.width;
        const height = Math.abs(drawStartRef.current.y - currentY) / rect.height;

        setCurrentBox({ id: "temp", page: pageNum, x, y, width, height });
    };

    const handleMouseUp = () => {
        if (!isDrawing || mode !== "draw") return;
        setIsDrawing(false);

        if (currentBox && currentBox.width > 0.01 && currentBox.height > 0.01) {
            updateBoxesStateWithHistory((prev) => [...prev, { ...currentBox, id: crypto.randomUUID() }]);
        }
        setCurrentBox(null);
        drawStartRef.current = null;
    };

    const removeBox = (id: string) => {
        updateBoxesStateWithHistory((prev) => prev.filter((b) => b.id !== id));
    };

    const handleRedactionSubmit = () => {
        if (!baseFile) return;

        const validBoxes = drawnBoxes.filter((box) => box.width > 0.01 && box.height > 0.01);
        if (mode === "draw" && validBoxes.length === 0) {
            notify("Please draw at least one redaction area on the document.", "warning");
            return;
        }
        if (mode === "text" && !keywords.trim()) {
            notify("Please enter at least one keyword to redact.", "warning");
            return;
        }

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", baseFile);
                formData.append("keywords", keywords.trim());
                formData.append("boxes", JSON.stringify(validBoxes));

                const typedFile = baseFile as FileWithPassword;
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/security/redact-text", formData);
                const redactedFile = new File(
                    [responseBlob],
                    `redacted_${baseFile.name}`,
                    { type: "application/pdf" }
                );

                await onRedactedFile(redactedFile);
                setDrawnBoxes([]);
                setHistoryPast([]);
                setHistoryFuture([]);
                setActiveId(null);
                setCurrentBox(null);
                setSuccess(true);
                notify("Redacted PDF loaded back into Studio.","success");
            } catch (error) {
                console.error(error);
                handleClientError(error);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted">
                <p>Select or upload a PDF to start.</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <ShieldAlert size={16} className="text-amber-500" />
                            Redaction Controls
                        </h3>

                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 rounded-xl border border-border bg-(--background)/40 p-1">
                                <button
                                    type="button"
                                    disabled={historyPast.length === 0}
                                    onClick={handleUndoAction}
                                    className="rounded-lg p-1.5 text-foreground transition hover:bg-background
                                    disabled:opacity-30"
                                    title="Undo"
                                >
                                    <Undo2 size={14} />
                                </button>
                                <button
                                    type="button"
                                    disabled={historyFuture.length === 0}
                                    onClick={handleRedoAction}
                                    className="rounded-lg p-1.5 text-foreground transition hover:bg-background
                                    disabled:opacity-30"
                                    title="Redo"
                                >
                                    <Redo2 size={14} />
                                </button>
                            </div>

                            <div className="rounded-xl border border-border bg-(--background)/40 px-3 py-2 text-xs
                            font-medium text-muted">
                                Page {currentPage} / {totalPages || "?"}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                            <button
                                type="button"
                                onClick={() => setMode("text")}
                                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${
                                    mode === "text"
                                        ? "bg-white text-foreground shadow dark:bg-zinc-700"
                                        : "text-zinc-500"
                                }`}
                            >
                                <Type size={14} /> Text Search
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("draw")}
                                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${
                                    mode === "draw"
                                        ? "bg-white text-foreground shadow dark:bg-zinc-700"
                                        : "text-zinc-500"
                                }`}
                            >
                                <MousePointerSquareDashed size={14} /> Draw Areas
                            </button>
                        </div>

                        {mode === "text" ? (
                            <div>
                                <label className="text-xs font-medium text-muted">
                                    Target Keywords (Comma Separated)
                                </label>
                                <textarea
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    placeholder="e.g. Passport, John Doe"
                                    className="mt-1.5 h-24 w-full rounded-xl border border-border bg-card p-3 text-sm
                                    text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-zinc-500">
                                    Click and drag directly over any section on the document preview to mark custom blackout blocks.
                                </p>
                                {drawnBoxes.length > 0 && (
                                    <div className="max-h-40 space-y-1 overflow-y-auto border-t pt-2">
                                        <span className="mb-1 block text-xs font-bold">Marked Zones:</span>
                                        {drawnBoxes.map((box, idx) => (
                                            <div
                                                key={box.id}
                                                className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-1.5 text-xs
                                                text-foreground dark:bg-zinc-800"
                                            >
                                                <span>Area {idx + 1} (Page {box.page})</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeBox(box.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {isAnalyzing && (
                            <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                                <Loader2 className="mt-0.5 animate-spin text-indigo-500" size={16} />
                                <div className="text-xs text-(--foreground)/90">
                                    <p className="font-semibold">Analyzing page structure...</p>
                                    <p className="mt-0.5 text-muted">Detecting text pages before redaction processing.</p>
                                </div>
                            </div>
                        )}

                        {analysisError && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs
                            text-amber-900 dark:text-amber-200">
                                <p className="font-semibold">Analysis unavailable</p>
                                <p className="mt-0.5 opacity-80">{analysisError}</p>
                            </div>
                        )}

                        {analysisLoaded && currentPageAnalysis && (
                            <div
                                className={`rounded-xl border p-4 ${
                                    isScannedPage 
                                        ? "border-amber-500/20 bg-amber-500/10" 
                                        : "border-emerald-500/20 bg-emerald-500/10"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        {isScannedPage ? (
                                            <ScanText className="mt-0.5 text-amber-600" size={18} />
                                        ) : (
                                            <ShieldAlert className="mt-0.5 text-emerald-500" size={18} />
                                        )}
                                        <div className="text-xs">
                                            <p className="font-semibold">
                                                Page {currentPage} is {prettyKind(pageKind)}
                                            </p>
                                            <p className="mt-0.5 opacity-80">
                                                {isScannedPage
                                                    ? "This page has no selectable text. Draw areas are recommended."
                                                    : isMixedPage
                                                        ? "Could be scanned document. Manual redaction or text search is recommended."
                                                        : isTextPage
                                                            ? "Selectable text detected. Smart text search is recommended."
                                                            : "No clear text structure detected on this page."}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                                        {currentPageAnalysis.wordCount} words
                                    </div>
                                </div>

                                {(isScannedPage || isMixedPage) && (
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMode("draw")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                mode === "draw"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-border bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <MousePointerSquareDashed size={14} />
                                            Draw Areas
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMode("text")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                mode === "text"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-border bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <Type size={14} />
                                            Text Search
                                        </button>
                                    </div>
                                )}

                                {isTextPage && (
                                    <div className="mt-3 text-[10px] text-muted">
                                        Smart mode will use keywords first before any manual redaction.
                                    </div>
                                )}
                            </div>
                        )}

                        {activeId && (
                            <div className="flex items-center justify-between border-t border-border pt-3">
                                <span className="text-xs font-semibold text-muted">Selected area</span>
                                <button
                                    type="button"
                                    onClick={() => removeBox(activeId)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5
                                    text-xs font-semibold text-red-500 transition hover:bg-red-500/20 hover:text-red-600"
                                >
                                    <Trash2 size={14} /> Remove Box
                                </button>
                            </div>
                        )}

                        {success && (
                            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Redaction complete!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The redacted PDF has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleRedactionSubmit}
                            disabled={isProcessing || isRenderingCanvas}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                            Execute Secure Redaction
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border
                bg-(--background)/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-border pb-3 text-sm font-bold
                     text-foreground">
                        <span className="flex items-center gap-2">
                            <Eye size={16} className="text-indigo-500" /> Redaction Canvas
                        </span>

                        {totalPages > 0 && (
                            <div className="flex select-none items-center gap-2 rounded-lg border border-border
                            bg-card px-2 py-0.5 font-mono text-xs text-muted">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() => {
                                        setCurrentPage((p) => p - 1);
                                        setActiveId(null);
                                    }}
                                    className="transition hover:text-foreground disabled:opacity-20"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span>
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={currentPage >= totalPages}
                                    onClick={() => {
                                        setCurrentPage((p) => p + 1);
                                        setActiveId(null);
                                    }}
                                    className="transition hover:text-foreground disabled:opacity-20"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div
                        className="relative flex min-h-105 w-full items-start justify-start overflow-auto rounded-xl
                        border border-border bg-gray-500/5 p-4 dark:bg-black/20"
                        onClick={() => setActiveId(null)}
                    >
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl
                            bg-(--background)/40 text-xs font-medium text-muted backdrop-blur-sm">
                                <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                                Rendering document preview...
                            </div>
                        )}

                        <div
                            ref={containerRef}
                            className="relative inline-block max-w-none cursor-crosshair overflow-hidden rounded border
                             border-gray-400/20 bg-white shadow-xl select-none touch-none"
                            onMouseDown={(e) => handleMouseDown(e, currentPage)}
                            onMouseMove={(e) => handleMouseMove(e, currentPage)}
                            onMouseUp={() => handleMouseUp()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <canvas ref={canvasRef} className="block max-w-full h-auto rounded pointer-events-none" />

                            {drawPageBoxes(currentPage).map((box) => {
                                const isActive = activeId === box.id;
                                return (
                                    <div
                                        key={box.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveId(box.id);
                                        }}
                                        style={{
                                            position: "absolute",
                                            left: `${box.x * scaleFactor}px`,
                                            top: `${box.y * scaleFactor}px`,
                                            width: `${box.width * scaleFactor}px`,
                                            height: `${box.height * scaleFactor}px`,
                                        }}
                                        className={`transition-all ${
                                            isActive ? "z-20 rounded ring-2 ring-indigo-600 bg-black/15 shadow-md" : "z-10 hover:opacity-60"
                                        }`}
                                    >
                                        <div
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                backgroundColor: "rgba(0,0,0,0.92)",
                                            }}
                                        />
                                    </div>
                                );
                            })}

                            {currentBox && currentBox.page === currentPage && (
                                <div
                                    style={{
                                        position: "absolute",
                                        left: `${currentBox.x * scaleFactor}px`,
                                        top: `${currentBox.y * scaleFactor}px`,
                                        width: `${currentBox.width * scaleFactor}px`,
                                        height: `${currentBox.height * scaleFactor}px`,
                                    }}
                                    className="z-30 rounded ring-2 ring-indigo-600 bg-indigo-500/20 shadow-md"
                                >
                                    <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(99,102,241,0.35)" }} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
