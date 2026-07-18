"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    Loader2,
    MousePointer2,
    Redo2,
    ScanText,
    ShieldCheck,
    Sparkles,
    Strikethrough,
    Trash2,
    Undo2,
} from "lucide-react";
import { getBaseUrl } from "@/lib/api";
import { getFriendlyErrorMessage, handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";

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

type StrikeoutMode = "smart" | "manual" | "ocr";
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

interface StrikeoutBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color: string;
}

interface StrikeoutToolProps {
    baseFile: File | null;
    onStrikeoutFile: (file: File) => Promise<void>;
}

interface JobSubmissionResponse {
    success?: boolean;
    job_id: string;
    status: string;
    queue_name: string;
}

interface JobRecord {
    id: string;
    job_type: string;
    status: string;
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: string | null;
    cancel_requested: boolean;
}

const STRIKE_COLORS = [
    { name: "Red", hex: "#FF0000" },
    { name: "Black", hex: "#000000" },
    { name: "Blue", hex: "#0066FF" },
    { name: "Green", hex: "#00AA00" },
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

function buildApiUrl(path: string) {
    const base = getBaseUrl().replace(/\/+$/, "");
    return `${base}${path}`;
}

async function submitStrikeoutJob(
    file: File,
    boxes: StrikeoutBox[],
    mode: StrikeoutMode,
    filePassword?: string
): Promise<JobSubmissionResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("boxes", JSON.stringify(boxes));
    formData.append("mode", mode);

    if (filePassword?.trim()) {
        formData.append("file_password", filePassword.trim());
    }

    const response = await fetch(buildApiUrl("/api/markup/strikeout"), {
        method: "POST",
        body: formData,
        credentials: "include",
    });

    const text = await response.text();
    if (!response.ok) {
        let message = text || `Request failed with status ${response.status}`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.message || parsed.error || message;
        } catch {
            // keep raw text
        }
        throw new Error(message);
    }

    return JSON.parse(text) as JobSubmissionResponse;
}

async function fetchJob(jobId: string): Promise<JobRecord> {
    const response = await fetch(buildApiUrl(`/api/markup/jobs/${jobId}`), {
        method: "GET",
        credentials: "include",
    });

    const text = await response.text();
    if (!response.ok) {
        let message = text || `Request failed with status ${response.status}`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.message || parsed.error || message;
        } catch {
            // keep raw text
        }
        throw new Error(message);
    }

    return JSON.parse(text) as JobRecord;
}

async function waitForJob(jobId: string, onUpdate: (job: JobRecord) => void, signal?: AbortSignal): Promise<JobRecord> {
    while (true) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const job = await fetchJob(jobId);
        onUpdate(job);

        if (["succeeded", "failed", "cancelled"].includes(job.status)) {
            return job;
        }

        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => resolve(), 1000);

            if (signal) {
                signal.addEventListener(
                    "abort",
                    () => {
                        window.clearTimeout(timer);
                        reject(new DOMException("Aborted", "AbortError"));
                    },
                    { once: true }
                );
            }
        });
    }
}

async function downloadJobPdf(jobId: string): Promise<Blob> {
    const response = await fetch(buildApiUrl(`/api/markup/jobs/${jobId}/download`), {
        method: "GET",
        credentials: "include",
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = text || `Download failed with status ${response.status}`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.message || parsed.error || message;
        } catch {
            // keep raw text
        }
        throw new Error(message);
    }

    return await response.blob();
}

export default function StrikeoutTool({ baseFile, onStrikeoutFile }: StrikeoutToolProps) {
    const { requireAuth } = useAuth();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [boxes, setBoxes] = useState<StrikeoutBox[]>([]);
    const [selectedColor, setSelectedColor] = useState("#000000");
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [strikeoutMode, setStrikeoutMode] = useState<StrikeoutMode>("smart");

    const [historyPast, setHistoryPast] = useState<StrikeoutBox[][]>([]);
    const [historyFuture, setHistoryFuture] = useState<StrikeoutBox[][]>([]);

    const [pageAnalysisMap, setPageAnalysisMap] = useState<Record<number, PageAnalysis>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisLoaded, setAnalysisLoaded] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [previewImageSrc, setPreviewImageSrc] = useState("");
    const [isRenderingPreview, setIsRenderingPreview] = useState(false);
    const [previewCacheToken, setPreviewCacheToken] = useState("");

    const [jobId, setJobId] = useState<string>("");
    const [job, setJob] = useState<JobRecord | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [jobError, setJobError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);
    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
    const jobAbortRef = useRef<AbortController | null>(null);
    const handledSuccessRef = useRef(false);

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
        (nextState: StrikeoutBox[] | ((prev: StrikeoutBox[]) => StrikeoutBox[])) => {
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
        setJobId("");
        setJob(null);
        setUploadProgress(0);
        setJobError(null);
        handledSuccessRef.current = false;

        setPdfDocument(null);
        setTotalPages(0);
        setCurrentPage(1);
        setBoxes([]);
        setHistoryPast([]);
        setHistoryFuture([]);
        setActiveId(null);
        setSuccess(false);
        setStrikeoutMode("smart");
        setPageAnalysisMap({});
        setAnalysisLoaded(false);
        setAnalysisError(null);
        setIsAnalyzing(false);

        if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
        setPreviewImageSrc("");
        setPreviewCacheToken("");

        if (!baseFile) return;

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
    }, [baseFile]); // reset when file changes

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

                const response = await fetch(buildApiUrl("/api/structure/analyze"), {
                    method: "POST",
                    body: formData,
                    signal: controller.signal,
                    credentials: "include",
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
        if (currentPageAnalysis.kind === "scanned" && strikeoutMode === "smart") {
            setStrikeoutMode("manual");
        }
    }, [currentPageAnalysis, strikeoutMode]);

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

                const response = await fetch(buildApiUrl("/api/conversion/preview/page"), {
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
            } catch (err: unknown) {
                if ((err as Error)?.name !== "AbortError") {
                    console.error("Failed to render scanned page preview:", err);
                }
            } finally {
                if (!abortController.signal.aborted) setIsRenderingPreview(false);
            }
        };

        void fetchScannedPreview();
        return () => abortController.abort();
    }, [baseFile, currentPage, currentPageAnalysis?.kind, pdfDocument, previewCacheToken]);

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
    }, [currentPage, pdfDocument]);

    useEffect(() => {
        if (!jobId) return;

        const controller = new AbortController();
        jobAbortRef.current = controller;
        handledSuccessRef.current = false;

        const run = async () => {
            try {
                const finalJob = await waitForJob(
                    jobId,
                    (nextJob) => {
                        setJob(nextJob);
                        setJobError(null);
                    },
                    controller.signal
                );

                if (controller.signal.aborted) return;

                setJob(finalJob);

                if (finalJob.status === "failed") {
                    throw new Error(finalJob.error || "Strikeout processing failed");
                }

                if (finalJob.status !== "succeeded") {
                    return;
                }

                if (handledSuccessRef.current) {
                    return;
                }
                handledSuccessRef.current = true;

                const blob = await downloadJobPdf(jobId);

                const fileName = (baseFile?.name || "document.pdf").replace(/\.pdf$/i, "");
                const strikeoutFile = new File([blob], `${fileName}-strikeout.pdf`, {
                    type: "application/pdf",
                });

                await onStrikeoutFile(strikeoutFile);

                setBoxes([]);
                setHistoryPast([]);
                setHistoryFuture([]);
                setActiveId(null);
                setCurrentPage(1);
                setSuccess(true);

                setJob(null);
                setJobId("");
                setUploadProgress(0);
                setJobError(null);

                notify("Strikeout PDF loaded back into Studio.", "success");

                setJobId("");
                setUploadProgress(0);
            }catch (err) {
                console.log("ERROR TYPE:", typeof err);
                console.log("ERROR VALUE:", err);
                console.log("INSTANCEOF ERROR:", err instanceof Error);

                if ((err as Error)?.name === "AbortError") return;

                setJobError(getFriendlyErrorMessage(err));

                if (err != null) {
                    handleClientError(err);
                }

                setIsProcessing(false);
            } finally {
                if (!controller.signal.aborted) {
                    setIsProcessing(false);
                }
            }
        };

        void run();

        return () => controller.abort();
    }, [jobId]); // polling flow

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

        const newBox: StrikeoutBox = {
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

    const handleStrikeoutProcessing = () => {
        const activeFile = baseFile;
        if (!activeFile) return;

        const validBoxes = boxes.filter((b) => b.width > 2 && b.height > 2);
        if (validBoxes.length === 0) {
            notify("Please draw at least one strikeout area on the document.", "warning");
            return;
        }

        if (currentPageAnalysis?.kind === "scanned" && strikeoutMode === "smart") {
            notify("This page is scanned. Please choose Manual strikeout or Recognize Text.", "warning");
            return;
        }

        const validFile = activeFile as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);
                setJobError(null);
                setUploadProgress(0);

                const submission = await submitStrikeoutJob(
                    validFile,
                    validBoxes,
                    strikeoutMode,
                    validFile.originalPassword
                );

                setJobId(submission.job_id);
                setJob(null);
                setUploadProgress(100);
                notify("Strikeout job queued. Waiting for worker...", "info");
            } catch (err) {
                console.error(err);
                setJobError(getFriendlyErrorMessage(err));
                handleClientError(err);
                setIsProcessing(false);
            }
        });
    };

    const progress = Math.max(0, Math.min(100, job?.progress ?? uploadProgress));
    const statusText =
        jobError
            ? "Failed"
            : job?.status === "running" || job?.status === "queued"
                ? "Processing"
                : isProcessing
                    ? "Uploading"
                    : job?.status === "succeeded"
                        ? "Completed"
                        : "Idle";

    if (!baseFile) return null;

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Strikethrough size={16} className="text-indigo-500" />
                            Strikeout Configuration
                        </h3>

                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 rounded-xl border border-border bg-(--background)/40 p-1">
                                <button
                                    type="button"
                                    disabled={historyPast.length === 0}
                                    onClick={handleUndoAction}
                                    className="rounded-lg p-1.5 text-foreground transition hover:bg-background disabled:opacity-30"
                                    title="Undo"
                                >
                                    <Undo2 size={14} />
                                </button>
                                <button
                                    type="button"
                                    disabled={historyFuture.length === 0}
                                    onClick={handleRedoAction}
                                    className="rounded-lg p-1.5 text-foreground transition hover:bg-background disabled:opacity-30"
                                    title="Redo"
                                >
                                    <Redo2 size={14} />
                                </button>
                            </div>

                            <div className="rounded-xl border border-border bg-(--background)/40 px-3 py-2 text-xs font-medium text-muted">
                                Page {currentPage} / {totalPages || "?"}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-border bg-(--background)/40 p-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted">Mode</label>
                                <select
                                    value={strikeoutMode}
                                    onChange={(e) => setStrikeoutMode(e.target.value as StrikeoutMode)}
                                    className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground outline-none transition focus:border-indigo-500"
                                >
                                    <option value="smart" disabled={!canUseSmartMode}>
                                        Smart (text first, OCR fallback)
                                    </option>
                                    <option value="manual">Manual strikeout</option>
                                    <option value="ocr">OCR page</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase text-muted">Active Marker Color</label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {STRIKE_COLORS.map((c) => (
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
                                <div className="text-xs text-(--foreground)/90">
                                    <p className="font-semibold">Analyzing page structure...</p>
                                    <p className="mt-0.5 text-muted">Detecting text pages before strikeout processing.</p>
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
                                                    ? "This page has no selectable text. Choose Manual strikeout or Recognize Text."
                                                    : isMixedPage
                                                        ? "Could be scanned document. Manual strikeout or Recognize Text is recommended."
                                                        : isTextPage
                                                            ? "Selectable text detected. Smart mode is recommended."
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
                                            onClick={() => setStrikeoutMode("manual")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                strikeoutMode === "manual"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-border bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <MousePointer2 size={14} />
                                            Manual strikeout
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStrikeoutMode("ocr")}
                                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                                strikeoutMode === "ocr"
                                                    ? "border-indigo-500 bg-indigo-500 text-white"
                                                    : "border-border bg-white/60 dark:bg-black/10"
                                            }`}
                                        >
                                            <ScanText size={14} />
                                            Recognize Text
                                        </button>
                                    </div>
                                )}

                                {isTextPage && (
                                    <div className="mt-3 text-[10px] text-muted">
                                        Smart mode will use native text before any fallback behavior.
                                    </div>
                                )}
                            </div>
                        )}

                        {activeId && (
                            <div className="flex items-center justify-between border-t border-border pt-3">
                                <span className="text-xs font-semibold text-muted">Marker selected</span>
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
                                    <p className="font-semibold">Strikeouts applied successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The strikeout PDF has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!success && (job || jobError || jobId || isProcessing) && (
                            <div className="rounded-2xl border border-border bg-background/40 p-4">
                                <div className="flex items-center justify-between text-xs text-muted">
                                    <span className="inline-flex items-center gap-2">
                                        {isProcessing ||
                                        job?.status === "running" ||
                                        job?.status === "queued" ||
                                        (jobId && !job) ? (
                                            <Loader2 size={14} className="animate-spin text-foreground" />
                                        ) : null}
                                        {statusText}
                                    </span>
                                    <span>{Math.round(progress)}%</span>
                                </div>

                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            jobError || job?.status === "failed"
                                                ? "bg-red-500"
                                                : job?.status === "succeeded"
                                                    ? "bg-emerald-500"
                                                    : "bg-foreground"
                                        }`}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>

                                <p className="mt-2 text-[11px] text-muted">
                                    {jobError ||
                                        job?.message ||
                                        (isProcessing ? "Uploading file to worker..." : "Waiting for job update...")}
                                </p>

                                {jobId ? (
                                    <p className="mt-2 text-[11px] text-muted">
                                        Job ID: <span className="font-mono">{jobId}</span>
                                    </p>
                                ) : null}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleStrikeoutProcessing}
                            disabled={isProcessing || isRenderingCanvas || boxes.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Strikethrough size={16} />}
                            Save Strikeouts
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-[color:var(--background)]/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-border pb-3 text-sm font-bold text-[color:var(--foreground)]">
                        <span className="flex items-center gap-2">
                            <Eye size={16} className="text-indigo-500" /> Strikeout Canvas
                        </span>

                        {totalPages > 0 && (
                            <div className="flex select-none items-center gap-2 rounded-lg border border-border bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-muted">
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
                        className="relative flex min-h-[420px] w-full items-start justify-start overflow-auto rounded-xl border border-border bg-gray-500/5 p-4 dark:bg-black/20"
                        onClick={() => setActiveId(null)}
                    >
                        {(isRenderingCanvas || isRenderingPreview) && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-background/40 text-xs font-medium text-muted backdrop-blur-sm">
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
                                className={`block max-w-full h-auto rounded pointer-events-none ${
                                    isScannedPage ? "opacity-0" : "opacity-100"
                                }`}
                            />

                            {isScannedPage && previewImageSrc && (
                                <img
                                    src={previewImageSrc}
                                    alt={`Scanned page preview ${currentPage}`}
                                    className="pointer-events-none absolute inset-0 h-full w-full rounded object-contain"
                                />
                            )}

                            {isScannedPage && !previewImageSrc && (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
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
                                        }}
                                        className={`transition-all ${
                                            isActive
                                                ? "z-20 rounded ring-2 ring-indigo-600 opacity-60 shadow-md"
                                                : "z-10 hover:opacity-50"
                                        }`}
                                    >
                                        <div
                                            style={
                                                {
                                                    position: "absolute",
                                                    left: 0,
                                                    right: 0,
                                                    top: "50%",
                                                    height: "3px",
                                                    transform: "translateY(-50%)",
                                                    backgroundColor: box.color,
                                                    opacity: 0.95,
                                                    borderRadius: "9999px",
                                                } as CSSProperties
                                            }
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