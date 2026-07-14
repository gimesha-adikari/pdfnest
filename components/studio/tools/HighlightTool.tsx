"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    Highlighter,
    Loader2,
    MousePointer2,
    Redo2,
    ScanText,
    ShieldCheck,
    Sparkles,
    Trash2,
    Undo2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { notify } from "@/lib/notify";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import {getBaseUrl, uploadAndDownloadFile} from "@/lib/api";

interface CustomPdfFile extends File {
    originalPassword?: string;
}

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

type HighlightMode = "smart" | "manual" | "ocr";
type PageKind = "text" | "scanned" | "mixed" | "blank" | "unknown";

interface PageAnalysis {
    page: number;
    kind: PageKind;
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

interface HighlightBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color: string;
}

interface HighlightTool {
    baseFile: File | null;
    onHighlightedFile: (file: File) => Promise<void>;
}

const HIGHLIGHT_COLORS = [
    { name: "Yellow", hex: "#FFFF00" },
    { name: "Green", hex: "#00FF00" },
    { name: "Blue", hex: "#00FFFF" },
    { name: "Pink", hex: "#FF00FF" },
    { name: "Orange", hex: "#FF8800" },
];

function prettyKind(kind: PageKind | undefined) {
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

async function loadPdfJs() {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
    return pdfjsLib;
}

export default function HighlightTool({ baseFile, onHighlightedFile }: HighlightTool) {
    const { requireAuth } = useAuth();

    const baseUrl = getBaseUrl();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [boxes, setBoxes] = useState<HighlightBox[]>([]);
    const [selectedColor, setSelectedColor] = useState("#FFFF00");
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [highlightMode, setHighlightMode] = useState<HighlightMode>("smart");

    const [historyPast, setHistoryPast] = useState<HighlightBox[][]>([]);
    const [historyFuture, setHistoryFuture] = useState<HighlightBox[][]>([]);

    const [pageAnalysisMap, setPageAnalysisMap] = useState<Record<number, PageAnalysis>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisLoaded, setAnalysisLoaded] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [previewImageSrc, setPreviewImageSrc] = useState("");
    const [isRenderingPreview, setIsRenderingPreview] = useState(false);
    const [previewCacheToken, setPreviewCacheToken] = useState("");

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);
    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

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
    const currentPageBoxes = useMemo(() => boxes.filter((b) => b.page === currentPage), [boxes, currentPage]);

    const updateBoxesStateWithHistory = useCallback(
        (nextState: HighlightBox[] | ((prev: HighlightBox[]) => HighlightBox[])) => {
            setBoxes((prev) => {
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
            setHistoryFuture((future) => [boxes, ...future]);
            setBoxes(previousState);
            setActiveId(null);
            return updatedPast;
        });
    }, [boxes]);

    const handleRedoAction = useCallback(() => {
        setHistoryFuture((future) => {
            if (future.length === 0) return future;
            const nextState = future[0];
            const updatedFuture = future.slice(1);
            setHistoryPast((past) => [...past, boxes]);
            setBoxes(nextState);
            setActiveId(null);
            return updatedFuture;
        });
    }, [boxes]);

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
            setBoxes([]);
            setHistoryPast([]);
            setHistoryFuture([]);
            setActiveId(null);
            setSuccess(false);
            setHighlightMode("smart");
            setPageAnalysisMap({});
            setAnalysisLoaded(false);
            setAnalysisError(null);
            setIsAnalyzing(false);
            if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
            setPreviewImageSrc("");
            setPreviewCacheToken("");
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
                setPreviewCacheToken(Math.random().toString(36).slice(2));
            } catch (err) {
                console.error("Failed to parse document context framework:", err);
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

        if (analysisAbortRef.current) {
            analysisAbortRef.current.abort();
        }

        const controller = new AbortController();
        analysisAbortRef.current = controller;

        const analyze = async () => {
            try {
                setIsAnalyzing(true);
                setAnalysisLoaded(false);
                setAnalysisError(null);

                const formData = new FormData();
                formData.append("file", baseFile);

                const maybePassword = (baseFile as CustomPdfFile).originalPassword;
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
    }, [baseFile]);

    useEffect(() => {
        if (!currentPageAnalysis) return;
        if (currentPageAnalysis.kind === "scanned" && highlightMode === "smart") {
            setHighlightMode("manual");
        }
    }, [currentPageAnalysis, highlightMode]);

    useEffect(() => {
        if (!baseFile || !pdfDocument) return;

        const isScanned = currentPageAnalysis?.kind === "scanned";
        if (!isScanned) {
            if (previewImageSrc) {
                URL.revokeObjectURL(previewImageSrc);
                setPreviewImageSrc("");
            }
            return;
        }

        const abortController = new AbortController();

        const fetchScannedPreview = async () => {
            setIsRenderingPreview(true);
            try {
                const formData = new FormData();
                formData.append("file", new File([baseFile], baseFile.name, { type: "application/pdf" }));
                formData.append("page", String(currentPage));
                formData.append("scale", "2.0");
                formData.append("cacheBuster", previewCacheToken);

                const password = (baseFile as CustomPdfFile).originalPassword;
                if (password) formData.append("file_password", password);

                const response = await fetch("/api/conversion/preview/page", {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    throw new Error(`Preview failed with status ${response.status}`);
                }

                const imgBlob = await response.blob();
                setPreviewImageSrc((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(imgBlob);
                });
            } catch (err: any) {
                if (err?.name !== "AbortError") {
                    console.error("Failed to render scanned page preview:", err);
                }
            } finally {
                if (!abortController.signal.aborted) setIsRenderingPreview(false);
            }
        };

        void fetchScannedPreview();
        return () => abortController.abort();
    }, [baseFile, pdfDocument, currentPage, currentPageAnalysis?.kind, previewCacheToken]);

    useEffect(() => {
        return () => {
            if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
        };
    }, [previewImageSrc]);

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
    }, [pdfDocument, currentPage]);

    const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current || pdfDimensions.width === 0) return;
        e.preventDefault();

        const rect = containerRef.current.getBoundingClientRect();
        const clickPdfX = (e.clientX - rect.left) / scaleFactor;
        const clickPdfY = (e.clientY - rect.top) / scaleFactor;

        const boxId = Math.random().toString(36).substring(7);
        isDrawingRef.current = true;
        drawStartRef.current = { x: clickPdfX, y: clickPdfY, id: boxId };
        setActiveId(boxId);

        const newBox: HighlightBox = {
            id: boxId,
            x: clickPdfX,
            y: clickPdfY,
            width: 1,
            height: 1,
            page: currentPage,
            color: selectedColor,
        };

        updateBoxesStateWithHistory((prev) => [...prev, newBox]);
    };

    const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDrawingRef.current || !drawStartRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentPdfX = (e.clientX - rect.left) / scaleFactor;
        const currentPdfY = (e.clientY - rect.top) / scaleFactor;

        const start = drawStartRef.current;
        const targetX = Math.min(start.x, currentPdfX);
        const targetY = Math.min(start.y, currentPdfY);
        const targetWidth = Math.abs(currentPdfX - start.x);
        const targetHeight = Math.abs(currentPdfY - start.y);

        setBoxes((prev) =>
            prev.map((box) => {
                if (box.id === start.id) {
                    return {
                        ...box,
                        x: Math.max(0, targetX),
                        y: Math.max(0, targetY),
                        width: Math.min(pdfDimensions.width - targetX, targetWidth),
                        height: Math.min(pdfDimensions.height - targetY, targetHeight),
                    };
                }
                return box;
            })
        );
    };

    const handleContainerPointerUp = () => {
        isDrawingRef.current = false;
        drawStartRef.current = null;
    };

    const deleteActiveBox = () => {
        if (!activeId) return;
        updateBoxesStateWithHistory((prev) => prev.filter((b) => b.id !== activeId));
        setActiveId(null);
    };

    const handleHighlightProcessing = () => {
        const activeFile = baseFile;
        if (!activeFile) return;

        const validBoxes = boxes.filter((b) => b.width > 2 && b.height > 2);
        if (validBoxes.length === 0) {
            notify("Please draw at least one highlighting box on the document.","warning");
            return;
        }

        const validFile = activeFile as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("boxes", JSON.stringify(validBoxes));
                formData.append("mode", highlightMode);

                if (validFile.originalPassword) formData.append("file_password", validFile.originalPassword);

                const responseBlob = await uploadAndDownloadFile("/api/structure/highlight", formData);
                const highlightedFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-highlighted.pdf`,
                    { type: "application/pdf" }
                );

                await onHighlightedFile(highlightedFile);

                setBoxes([]);
                setHistoryPast([]);
                setHistoryFuture([]);
                setActiveId(null);
                setCurrentPage(1);

                setSuccess(true);
                notify("Highlighted PDF loaded back into Studio.","success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) return null;

    const activeFile = baseFile as CustomPdfFile;

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                            <Highlighter size={16} className="text-indigo-500" />
                            Highlighter Configuration
                        </h3>

                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-1">
                                <button
                                    type="button"
                                    disabled={historyPast.length === 0}
                                    onClick={handleUndoAction}
                                    className="rounded-lg p-1.5 text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:opacity-30"
                                    title="Undo"
                                >
                                    <Undo2 size={14} />
                                </button>
                                <button
                                    type="button"
                                    disabled={historyFuture.length === 0}
                                    onClick={handleRedoAction}
                                    className="rounded-lg p-1.5 text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:opacity-30"
                                    title="Redo"
                                >
                                    <Redo2 size={14} />
                                </button>
                            </div>
                            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/40 px-3 py-2 text-xs font-medium text-[color:var(--muted)]">
                                Page {currentPage} / {totalPages || "?"}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase text-[color:var(--muted)]">Mode</label>
                                <select
                                    value={highlightMode}
                                    onChange={(e) => setHighlightMode(e.target.value as HighlightMode)}
                                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                >
                                    <option value="smart" disabled={!canUseSmartMode}>
                                        Smart (text first, OCR fallback)
                                    </option>
                                    <option value="manual">Manual highlight</option>
                                    <option value="ocr">OCR page</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase text-[color:var(--muted)]">Active Marker Color</label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {HIGHLIGHT_COLORS.map((c) => (
                                        <button
                                            key={c.hex}
                                            type="button"
                                            onClick={() => setSelectedColor(c.hex)}
                                            style={{ backgroundColor: c.hex }}
                                            className={`h-8 w-8 rounded-full border-2 transition ${
                                                selectedColor === c.hex
                                                    ? "scale-110 border-indigo-600 shadow-md"
                                                    : "border-transparent hover:scale-105"
                                            }`}
                                            title={c.name}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {isAnalyzing && (
                            <div className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                                <Loader2 className="mt-0.5 animate-spin text-indigo-500" size={16} />
                                <div className="text-xs text-[color:var(--foreground)]/90">
                                    <p className="font-semibold">Analyzing page structure...</p>
                                    <p className="mt-0.5 text-[color:var(--muted)]">Detecting text pages before highlight processing.</p>
                                </div>
                            </div>
                        )}

                        {analysisError && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
                                <p className="font-semibold">Analysis unavailable</p>
                                <p className="mt-0.5 opacity-80">{analysisError}</p>
                            </div>
                        )}

                        {analysisLoaded && currentPageAnalysis && (
                            <div
                                className={`rounded-xl border p-4 ${
                                    isScannedPage ? "border-amber-500/20 bg-amber-500/10" : "border-emerald-500/20 bg-emerald-500/10"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        {isScannedPage ? (
                                            <ScanText className="mt-0.5 text-amber-600" size={18} />
                                        ) : (
                                            <Sparkles className="mt-0.5 text-emerald-500" size={18} />
                                        )}
                                        <div className="text-xs">
                                            <p className="font-semibold">Page {currentPage} is {prettyKind(pageKind)}</p>
                                            <p className="mt-0.5 opacity-80">
                                                {isScannedPage
                                                    ? "This page has no selectable text. Choose Manual highlight or Recognize Text."
                                                    : isMixedPage
                                                        ? "Could be scanned document. Manual highlight or Recognize Text is recommended."
                                                        : isTextPage
                                                            ? "Selectable text detected. Smart mode is recommended."
                                                            : "No clear text structure detected on this page."}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        {currentPageAnalysis.wordCount} words
                                    </div>
                                </div>

                                {(isScannedPage || isMixedPage) && (
                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setHighlightMode("manual")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                highlightMode === "manual"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-[color:var(--border)] bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <MousePointer2 size={14} />
                                            Manual highlight
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHighlightMode("ocr")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                highlightMode === "ocr"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-[color:var(--border)] bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <ScanText size={14} />
                                            Recognize Text
                                        </button>
                                    </div>
                                )}

                                {isTextPage && (
                                    <div className="mt-3 text-[10px] text-[color:var(--muted)]">
                                        Smart mode will use native text before any fallback behavior.
                                    </div>
                                )}
                            </div>
                        )}

                        {activeId && (
                            <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-3">
                                <span className="text-xs font-semibold text-[color:var(--muted)]">Marker selected</span>
                                <button
                                    type="button"
                                    onClick={deleteActiveBox}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/20 hover:text-red-600"
                                >
                                    <Trash2 size={14} /> Remove Box
                                </button>
                            </div>
                        )}

                        {success && (
                            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Highlights baked successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The highlighted PDF has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleHighlightProcessing}
                            disabled={isProcessing || isRenderingCanvas || boxes.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Highlighter size={16} />}
                            Save Highlight Markers
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-sm font-bold text-[color:var(--foreground)]">
                        <span className="flex items-center gap-2">
                            <Eye size={16} className="text-indigo-500" /> Highlight Canvas
                        </span>
                        {totalPages > 0 && (
                            <div className="flex select-none items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted)]">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() => {
                                        setCurrentPage((p) => p - 1);
                                        setActiveId(null);
                                    }}
                                    className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
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
                                    className="transition hover:text-[color:var(--foreground)] disabled:opacity-20"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div
                        className="relative flex min-h-[420px] w-full items-start justify-start overflow-auto rounded-xl border border-[color:var(--border)] bg-gray-500/5 p-4 dark:bg-black/20"
                        onClick={() => setActiveId(null)}
                    >
                        {(isRenderingCanvas || isRenderingPreview) && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-[color:var(--background)]/40 text-xs font-medium text-[color:var(--muted)] backdrop-blur-sm">
                                <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                                {isScannedPage ? "Loading scanned preview..." : "Synchronizing view matrix framework..."}
                            </div>
                        )}

                        <div
                            ref={containerRef}
                            className="relative inline-block max-w-none cursor-crosshair overflow-hidden rounded border border-gray-400/20 bg-white shadow-xl select-none touch-none"
                            onPointerDown={handleContainerPointerDown}
                            onPointerMove={handleContainerPointerMove}
                            onPointerUp={handleContainerPointerUp}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <canvas
                                ref={canvasRef}
                                className={`block max-w-full h-auto rounded pointer-events-none ${isScannedPage ? "opacity-0" : "opacity-100"}`}
                            />

                            {isScannedPage && previewImageSrc && (
                                <img
                                    src={previewImageSrc}
                                    alt={`Scanned page preview ${currentPage}`}
                                    className="pointer-events-none absolute inset-0 h-full w-full rounded object-contain"
                                />
                            )}

                            {isScannedPage && !previewImageSrc && (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-[color:var(--muted)]">
                                    Preparing scanned preview...
                                </div>
                            )}

                            {currentPageBoxes.map((box) => {
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
                                            backgroundColor: box.color,
                                        }}
                                        className={`opacity-40 transition-all ${
                                            isActive ? "z-20 ring-2 ring-indigo-600 opacity-60 shadow-md" : "z-10 hover:opacity-50"
                                        }`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
