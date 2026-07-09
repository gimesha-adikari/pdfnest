"use client";

import { useMemo, useState, useEffect, useRef, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
    Highlighter,
    Loader2,
    ShieldCheck,
    ChevronLeft,
    ChevronRight,
    Eye,
    Trash2,
    Undo2,
    Redo2,
    ScanText,
    MousePointer2,
    Sparkles,
} from "lucide-react";
import { getBaseUrl, uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";

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

interface HighlightBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color: string;
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

const HIGHLIGHT_COLORS = [
    { name: "Yellow", hex: "#FFFF00" },
    { name: "Green", hex: "#00FF00" },
    { name: "Blue", hex: "#00FFFF" },
    { name: "Pink", hex: "#FF00FF" },
    { name: "Orange", hex: "#FF8800" },
];

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

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

export default function HighlightPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const baseUrl = getBaseUrl();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [boxes, setBoxes] = useState<HighlightBox[]>([]);
    const [selectedColor, setSelectedColor] = useState<string>("#FFFF00");
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

    const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
    const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);
    const [previewCacheToken, setPreviewCacheToken] = useState<string>("");

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);

    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions, displayDimensions]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const currentPageAnalysis = useMemo(() => {
        return pageAnalysisMap[currentPage] ?? null;
    }, [pageAnalysisMap, currentPage]);

    const pageKind = currentPageAnalysis?.kind ?? (analysisLoaded ? "unknown" : null);
    const isScannedPage = pageKind === "scanned";

    const isTextPage = pageKind === "text";
    const isMixedPage = pageKind === "mixed";
    const canUseSmartMode = pageKind !== "scanned" && pageKind !== "blank";

    const updateBoxesStateWithHistory = (
        nextState: HighlightBox[] | ((prev: HighlightBox[]) => HighlightBox[])
    ) => {
        setBoxes(prev => {
            const computedNext = typeof nextState === "function" ? nextState(prev) : nextState;
            setHistoryPast(past => [...past, prev]);
            setHistoryFuture([]);
            return computedNext;
        });
    };

    const handleUndoAction = () => {
        if (historyPast.length === 0) return;
        const previousState = historyPast[historyPast.length - 1];
        const updatedPast = historyPast.slice(0, -1);

        setHistoryPast(updatedPast);
        setHistoryFuture(future => [boxes, ...future]);
        setBoxes(previousState);
        setActiveId(null);
    };

    const handleRedoAction = () => {
        if (historyFuture.length === 0) return;
        const nextState = historyFuture[0];
        const updatedFuture = historyFuture.slice(1);

        setHistoryFuture(updatedFuture);
        setHistoryPast(past => [...past, boxes]);
        setBoxes(nextState);
        setActiveId(null);
    };

    useEffect(() => {
        const handleKeyboardShortcuts = (e: KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey;
            const keyLower = e.key.toLowerCase();

            if (isMeta && keyLower === "z") {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedoAction();
                } else {
                    handleUndoAction();
                }
            } else if (isMeta && keyLower === "y") {
                e.preventDefault();
                handleRedoAction();
            }
        };

        window.addEventListener("keydown", handleKeyboardShortcuts);
        return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
    }, [historyPast, historyFuture, boxes]);

    useEffect(() => {
        if (!file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
                setPreviewCacheToken(Math.random().toString(36).slice(2));
            } catch (err) {
                console.error("Failed to parse document context framework:", err);
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        loadPdf();
    }, [file]);

    useEffect(() => {
        if (!file) return;

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
                formData.append("file", file);

                const maybePassword = (file as CustomPdfFile).originalPassword;
                if (maybePassword) {
                    formData.append("file_password", maybePassword);
                }

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
                for (const page of parsed.pages ?? []) {
                    map[page.page] = page;
                }

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
                if (!controller.signal.aborted) {
                    setIsAnalyzing(false);
                }
            }
        };

        analyze();

        return () => controller.abort();
    }, [file, baseUrl]);

    useEffect(() => {
        if (!currentPageAnalysis) return;
        if (currentPageAnalysis.kind === "scanned" && highlightMode === "smart") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setHighlightMode("manual");
        }
    }, [currentPageAnalysis, highlightMode]);

    useEffect(() => {
        if (!file || !pdfDocument) return;

        const isScanned = currentPageAnalysis?.kind === "scanned";

        if (!isScanned) {
            if (previewImageSrc) {
                URL.revokeObjectURL(previewImageSrc);
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setPreviewImageSrc("");
            }
            return;
        }

        const abortController = new AbortController();

        const fetchScannedPreview = async () => {
            setIsRenderingPreview(true);

            try {
                const formData = new FormData();
                const tempFile = new File([file], file.name, { type: "application/pdf" });

                formData.append("file", tempFile);
                formData.append("page", String(currentPage));
                formData.append("scale", "2.0");
                formData.append("cacheBuster", previewCacheToken);

                const password = (file as CustomPdfFile).originalPassword;
                if (password) {
                    formData.append("file_password", password);
                }

                const response = await fetch(`${baseUrl}/api/conversion/preview/page`, {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    throw new Error(`Preview failed with status ${response.status}`);
                }

                const imgBlob = await response.blob();
                setPreviewImageSrc(prev => {
                    if (prev) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(imgBlob);
                });
            } catch (err: any) {
                if (err?.name !== "AbortError") {
                    console.error("Failed to render scanned page preview:", err);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    setIsRenderingPreview(false);
                }
            }
        };

        fetchScannedPreview();

        return () => abortController.abort();
    }, [file, pdfDocument, currentPage, currentPageAnalysis?.kind, previewCacheToken, baseUrl]);

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

        renderPage();

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

    const handleContainerPointerDown = (e: PointerEvent<HTMLDivElement>) => {
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

        updateBoxesStateWithHistory(prev => [...prev, newBox]);
    };

    const handleContainerPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!isDrawingRef.current || !drawStartRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentPdfX = (e.clientX - rect.left) / scaleFactor;
        const currentPdfY = (e.clientY - rect.top) / scaleFactor;

        const start = drawStartRef.current;

        const targetX = Math.min(start.x, currentPdfX);
        const targetY = Math.min(start.y, currentPdfY);
        const targetWidth = Math.abs(currentPdfX - start.x);
        const targetHeight = Math.abs(currentPdfY - start.y);

        setBoxes(prev =>
            prev.map(box => {
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
        updateBoxesStateWithHistory(prev => prev.filter(b => b.id !== activeId));
        setActiveId(null);
    };

    const handleHighlightProcessing = async () => {
        const activeFile = file;
        if (!activeFile) return;

        const validBoxes = boxes.filter(b => b.width > 2 && b.height > 2);

        if (validBoxes.length === 0) {
            notify("Please draw at least one highlighting box on the document.");
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

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-highlighted.pdf`,
                });

                setSuccess(true);
                router.push(`/${toolId}/download`);
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!file) return null;
    const activeFile = file;

    return (
        <>
            <PdfToolHero
                title="Highlight PDF Text"
                description="Select text-like regions, choose Smart / Manual / OCR, and bake the highlight into the PDF."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo
                            file={activeFile}
                            onClear={() => {
                                setFile(null);
                                router.push(`/${toolId}`);
                            }}
                        />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <Highlighter size={16} className="text-indigo-500" />
                                    Highlighter Configuration
                                </h3>

                                <div className="flex items-center gap-1 bg-[color:var(--card)] border border-[color:var(--border)] p-1 rounded-xl">
                                    <button
                                        type="button"
                                        disabled={historyPast.length === 0}
                                        onClick={handleUndoAction}
                                        title="Undo (Ctrl+Z)"
                                        className="p-1.5 rounded-lg text-[color:var(--foreground)] hover:bg-[color:var(--background)] disabled:opacity-30 transition"
                                    >
                                        <Undo2 size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={historyFuture.length === 0}
                                        onClick={handleRedoAction}
                                        title="Redo (Ctrl+Y)"
                                        className="p-1.5 rounded-lg text-[color:var(--foreground)] hover:bg-[color:var(--background)] disabled:opacity-30 transition"
                                    >
                                        <Redo2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Mode</label>
                                    <select
                                        value={highlightMode}
                                        onChange={(e) => setHighlightMode(e.target.value as HighlightMode)}
                                        className="w-full px-4 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium transition focus:border-indigo-500"
                                    >
                                        <option value="smart" disabled={!canUseSmartMode}>
                                            Smart (text first, OCR fallback)
                                        </option>
                                        <option value="manual">Manual highlight</option>
                                        <option value="ocr">OCR page</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Active Marker Color</label>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {HIGHLIGHT_COLORS.map(c => (
                                            <button
                                                key={c.hex}
                                                type="button"
                                                onClick={() => setSelectedColor(c.hex)}
                                                style={{ backgroundColor: c.hex }}
                                                className={`h-8 w-8 rounded-full border-2 transition ${
                                                    selectedColor === c.hex
                                                        ? "border-indigo-600 scale-110 shadow-md"
                                                        : "border-transparent hover:scale-105"
                                                }`}
                                                title={c.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {isAnalyzing && (
                                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 flex items-start gap-3">
                                    <Loader2 className="animate-spin text-indigo-500 mt-0.5" size={16} />
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
                                        isScannedPage
                                            ? "border-amber-500/20 bg-amber-500/10"
                                            : "border-emerald-500/20 bg-emerald-500/10"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            {isScannedPage ? (
                                                <ScanText className="text-amber-600 mt-0.5" size={18} />
                                            ) : (
                                                <Sparkles className="text-emerald-500 mt-0.5" size={18} />
                                            )}
                                            <div className="text-xs">
                                                <p className="font-semibold">
                                                    Page {currentPage} is {prettyKind(pageKind)}
                                                </p>
                                                <p className="mt-0.5 opacity-80">
                                                    {isScannedPage
                                                        ? "This page has no selectable text. Choose Manual highlight or Recognize Text."
                                                        : isMixedPage
                                                            ? "Could be scanned document. Manual highlight or Recognize Text is recommended."
                                                            :isTextPage
                                                                ? "Selectable text detected. Smart mode is recommended."
                                                                : "No clear text structure detected on this page."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                            {currentPageAnalysis.wordCount} words
                                        </div>
                                    </div>

                                    {isScannedPage && (
                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setHighlightMode("manual")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    highlightMode === "manual"
                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                        : "bg-white/60 dark:bg-black/10 border-[color:var(--border)] hover:border-indigo-500"
                                                }`}
                                            >
                                                <MousePointer2 size={14} />
                                                Manual highlight
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHighlightMode("ocr")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    highlightMode === "ocr"
                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                        : "bg-white/60 dark:bg-black/10 border-[color:var(--border)] hover:border-indigo-500"
                                                }`}
                                            >
                                                <ScanText size={14} />
                                                Recognize Text
                                            </button>
                                        </div>
                                    )}

                                    {isMixedPage && (
                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setHighlightMode("manual")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    highlightMode === "manual"
                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                        : "bg-white/60 dark:bg-black/10 border-[color:var(--border)] hover:border-indigo-500"
                                                }`}
                                            >
                                                <MousePointer2 size={14} />
                                                Manual highlight
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setHighlightMode("ocr")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    highlightMode === "ocr"
                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                        : "bg-white/60 dark:bg-black/10 border-[color:var(--border)] hover:border-indigo-500"
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
                                <div className="pt-3 border-t border-[color:var(--border)] flex justify-between items-center animate-fadeIn">
                                    <span className="text-xs font-semibold text-[color:var(--muted)]">Marker selected</span>
                                    <button
                                        onClick={deleteActiveBox}
                                        className="text-xs flex items-center gap-1.5 text-red-500 hover:text-red-600 font-semibold transition bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg"
                                    >
                                        <Trash2 size={14} /> Remove Box
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Source document size</p>
                                <p className="mt-1 text-xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                            </div>
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Total Sheets</p>
                                <p className="mt-1 text-xl font-bold text-indigo-500">{totalPages} Pages</p>
                            </div>
                        </div>

                        <PdfActionButton
                            text="Save Highlight Markers"
                            loadingText="Baking Vector Blocks..."
                            loading={isProcessing}
                            disabled={isProcessing || isRenderingCanvas || boxes.length === 0}
                            onClick={handleHighlightProcessing}
                        />
                    </div>

                    <div className="lg:col-span-7 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative w-full">
                        {(isRenderingCanvas || isRenderingPreview) && (
                            <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                                {isScannedPage ? "Loading scanned preview..." : "Synchronizing view matrix framework..."}
                            </div>
                        )}

                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                            <span className="flex items-center gap-2">
                                <Eye size={16} className="text-indigo-500" /> Highlighter Canvas
                            </span>

                            {totalPages > 0 && (
                                <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => {
                                            setCurrentPage(p => p - 1);
                                            setActiveId(null);
                                        }}
                                        className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
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
                                            setCurrentPage(p => p + 1);
                                            setActiveId(null);
                                        }}
                                        className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div
                            className="w-full flex flex-col items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] p-4 relative overflow-hidden min-h-[420px]"
                            onClick={() => setActiveId(null)}
                        >
                            <div
                                ref={containerRef}
                                className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full h-auto cursor-crosshair select-none touch-none overflow-hidden"
                                onPointerDown={handleContainerPointerDown}
                                onPointerMove={handleContainerPointerMove}
                                onPointerUp={handleContainerPointerUp}
                                onClick={e => e.stopPropagation()}
                            >
                                <canvas
                                    ref={canvasRef}
                                    className={`max-w-full h-auto block rounded pointer-events-none ${
                                        isScannedPage ? "opacity-0" : "opacity-100"
                                    }`}
                                />

                                {isScannedPage && previewImageSrc && (
                                    <img
                                        src={previewImageSrc}
                                        alt={`Scanned page preview ${currentPage}`}
                                        className="absolute inset-0 w-full h-full object-contain rounded pointer-events-none"
                                    />
                                )}

                                {isScannedPage && !previewImageSrc && (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs text-[color:var(--muted)]">
                                        Preparing scanned preview...
                                    </div>
                                )}

                                {boxes.filter(box => box.page === currentPage).map(box => {
                                    const isActive = activeId === box.id;
                                    return (
                                        <div
                                            key={box.id}
                                            onClick={e => {
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
                                                isActive ? "ring-2 ring-indigo-600 opacity-60 z-20 shadow-md" : "hover:opacity-50 z-10"
                                            }`}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                        {success && (
                            <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Highlights baked successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The document layer transformations have been permanently generated over the document layout.
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