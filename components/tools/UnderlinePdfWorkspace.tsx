"use client";

import { useMemo, useState, useEffect, useRef, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import {
    Underline,
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
import { getBaseUrl } from "@/lib/api";
import { getFriendlyErrorMessage, handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
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

interface UnderlineBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color: string;
}

type UnderlineMode = "smart" | "manual" | "ocr";
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

const UNDERLINE_COLORS = [
    { name: "Red", hex: "#FF4D4D" },
    { name: "Blue", hex: "#4D7CFF" },
    { name: "Green", hex: "#22C55E" },
    { name: "Orange", hex: "#F97316" },
    { name: "Purple", hex: "#A855F7" },
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

function buildApiUrl(path: string) {
    const base = getBaseUrl().replace(/\/+$/, "");
    return `${base}${path}`;
}

async function loadPdfJs() {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
    return pdfjsLib;
}

async function submitUnderlineJob(
    file: File,
    boxes: UnderlineBox[],
    mode: UnderlineMode,
    filePassword?: string
): Promise<JobSubmissionResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("boxes", JSON.stringify(boxes));
    formData.append("mode", mode);

    if (filePassword?.trim()) {
        formData.append("file_password", filePassword.trim());
    }

    const response = await fetch(buildApiUrl("/api/markup/underline"), {
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
            // keep raw response text
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
            // keep raw response text
        }
        throw new Error(message);
    }

    return JSON.parse(text) as JobRecord;
}

async function waitForJob(
    jobId: string,
    onUpdate: (job: JobRecord) => void,
    signal?: AbortSignal
): Promise<JobRecord> {
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

export default function UnderlinePdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [boxes, setBoxes] = useState<UnderlineBox[]>([]);
    const [selectedColor, setSelectedColor] = useState<string>("#FF4D4D");
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [success, setSuccess] = useState<boolean>(false);
    const [underlineMode, setUnderlineMode] = useState<UnderlineMode>("smart");

    const [historyPast, setHistoryPast] = useState<UnderlineBox[][]>([]);
    const [historyFuture, setHistoryFuture] = useState<UnderlineBox[][]>([]);

    const [pageAnalysisMap, setPageAnalysisMap] = useState<Record<number, PageAnalysis>>({});
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [analysisLoaded, setAnalysisLoaded] = useState<boolean>(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [previewImageSrc, setPreviewImageSrc] = useState<string>("");
    const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);
    const [previewCacheToken, setPreviewCacheToken] = useState<string>("");

    const [jobId, setJobId] = useState<string>("");
    const [job, setJob] = useState<JobRecord | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [jobError, setJobError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);
    const jobAbortRef = useRef<AbortController | null>(null);

    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
    const handledSuccessRef = useRef(false);

    const scaleFactor = useMemo(() => {
        if (pdfDimensions.width === 0 || displayDimensions.width === 0) return 1;
        return displayDimensions.width / pdfDimensions.width;
    }, [pdfDimensions, displayDimensions]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const currentPageAnalysis = useMemo(() => pageAnalysisMap[currentPage] ?? null, [pageAnalysisMap, currentPage]);
    const pageKind = currentPageAnalysis?.kind ?? (analysisLoaded ? "unknown" : null);
    const isScannedPage = pageKind === "scanned";
    const isTextPage = pageKind === "text";
    const isMixedPage = pageKind === "mixed";
    const canUseSmartMode = pageKind !== "scanned" && pageKind !== "blank";
    const currentPageBoxes = useMemo(() => boxes.filter((b) => b.page === currentPage), [boxes, currentPage]);

    const updateBoxesStateWithHistory = (
        nextState: UnderlineBox[] | ((prev: UnderlineBox[]) => UnderlineBox[])
    ) => {
        setBoxes((prev) => {
            const computedNext = typeof nextState === "function" ? nextState(prev) : nextState;
            setHistoryPast((past) => [...past, prev]);
            setHistoryFuture([]);
            return computedNext;
        });
    };

    const handleUndoAction = () => {
        if (historyPast.length === 0) return;
        const previousState = historyPast[historyPast.length - 1];
        const updatedPast = historyPast.slice(0, -1);

        setHistoryPast(updatedPast);
        setHistoryFuture((future) => [boxes, ...future]);
        setBoxes(previousState);
        setActiveId(null);
    };

    const handleRedoAction = () => {
        if (historyFuture.length === 0) return;
        const nextState = historyFuture[0];
        const updatedFuture = historyFuture.slice(1);

        setHistoryFuture(updatedFuture);
        setHistoryPast((past) => [...past, boxes]);
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
            setPdfDocument(null);
            setTotalPages(0);
            setCurrentPage(1);
            setBoxes([]);
            setHistoryPast([]);
            setHistoryFuture([]);
            setActiveId(null);
            setSuccess(false);
            setUnderlineMode("smart");
            setPageAnalysisMap({});
            setAnalysisLoaded(false);
            setAnalysisError(null);
            setIsAnalyzing(false);
            if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
            setPreviewImageSrc("");
            setPreviewCacheToken("");
            setJobId("");
            setJob(null);
            setUploadProgress(0);
            setJobError(null);
            return;
        }

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

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
    }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!currentPageAnalysis) return;
        if (currentPageAnalysis.kind === "scanned" && underlineMode === "smart") {
            setUnderlineMode("manual");
        }
    }, [currentPageAnalysis, underlineMode]);

    let baseUrl = getBaseUrl();

    useEffect(() => {
        if (!file || !pdfDocument) return;

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
                const tempFile = new File([file], file.name, { type: "application/pdf" });

                formData.append("file", tempFile);
                formData.append("page", String(currentPage));
                formData.append("scale", "2.0");
                formData.append("cacheBuster", previewCacheToken);

                const password = (file as CustomPdfFile).originalPassword;
                if (password) {
                    formData.append("file_password", password);
                }

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

        return () => {
            abortController.abort();
        };
    }, [file, pdfDocument, currentPage, currentPageAnalysis?.kind, previewCacheToken, baseUrl]);

    useEffect(() => {
        return () => {
            if (previewImageSrc) URL.revokeObjectURL(previewImageSrc);
        };
    }, [previewImageSrc]);

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
                    throw new Error(finalJob.error || "Underline processing failed");
                }

                if (finalJob.status !== "succeeded") {
                    return;
                }

                if (handledSuccessRef.current) {
                    return;
                }
                handledSuccessRef.current = true;

                const blob = await downloadJobPdf(jobId);

                const fileName = (file?.name || "document.pdf").replace(/\.pdf$/i, "");
                const underlinedFile = new File([blob], `${fileName}-underlined.pdf`, {
                    type: "application/pdf",
                });

                setDownloadData({
                    blob,
                    fileName: `${fileName}-underlined.pdf`,
                });

                setSuccess(true);

                setJob(null);
                setJobId("");
                setUploadProgress(0);
                setJobError(null);

                notify("Underline PDF ready.", "success");
                router.push(`/${toolId}/download`);

                setBoxes([]);
                setHistoryPast([]);
                setHistoryFuture([]);
                setActiveId(null);
                setCurrentPage(1);
                setJobId("");
                setUploadProgress(0);
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                console.error(err);
                setJobError(getFriendlyErrorMessage(err));
                handleClientError(err);
            } finally {
                if (!controller.signal.aborted) {
                    setIsProcessing(false);
                }
            }
        };

        void run();

        return () => controller.abort();
    }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

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

        const newBox: UnderlineBox = {
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

    const handleUnderlineProcessing = () => {
        const activeFile = file;
        if (!activeFile) return;

        const validBoxes = boxes.filter((b) => b.width > 2 && b.height > 2);
        if (validBoxes.length === 0) {
            notify("Please draw at least one underline box on the document.", "warning");
            return;
        }

        if (currentPageAnalysis?.kind === "scanned" && underlineMode === "smart") {
            notify("This page is scanned. Please choose Manual line or Recognize Text.", "warning");
            return;
        }

        const validFile = activeFile as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);
                setJobError(null);
                setUploadProgress(0);

                const submission = await submitUnderlineJob(
                    validFile,
                    validBoxes,
                    underlineMode,
                    validFile.originalPassword
                );

                setJobId(submission.job_id);
                setJob(null);
                setUploadProgress(100);
                notify("Underline job queued. Waiting for worker...", "info");
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

    if (!file) return null;
    const activeFile = file;

    return (
        <>
            <PdfToolHero
                title="Underline PDF Text"
                description="Select text-like regions, choose Smart / Manual / OCR, and bake the underline into the PDF."
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
                                    <Underline size={16} className="text-indigo-500" />
                                    Underline Configuration
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
                                        value={underlineMode}
                                        onChange={(e) => setUnderlineMode(e.target.value as UnderlineMode)}
                                        className="w-full px-4 py-2 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium transition focus:border-indigo-500"
                                    >
                                        <option value="smart" disabled={!canUseSmartMode}>
                                            Smart (text first, OCR fallback)
                                        </option>
                                        <option value="manual">Manual line</option>
                                        <option value="ocr">OCR page</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">
                                        Active Line Color
                                    </label>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {UNDERLINE_COLORS.map((c) => (
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
                                        <p className="mt-0.5 text-[color:var(--muted)]">
                                            Detecting text pages before underline processing.
                                        </p>
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
                                                        ? "This page has no selectable text. Choose Manual line or Recognize Text."
                                                        : isMixedPage
                                                            ? "Could be scanned document. Manual line or Recognize Text is recommended."
                                                            : isTextPage
                                                                ? "Selectable text detected. Smart mode is recommended."
                                                                : "No clear text structure detected on this page."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                            {currentPageAnalysis.wordCount} words
                                        </div>
                                    </div>

                                    {(isScannedPage || isMixedPage) && (
                                        <div className="mt-4 grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setUnderlineMode("manual")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    underlineMode === "manual"
                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                        : "bg-white/60 dark:bg-black/10 border-[color:var(--border)] hover:border-indigo-500"
                                                }`}
                                            >
                                                <MousePointer2 size={14} />
                                                Manual line
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setUnderlineMode("ocr")}
                                                className={`rounded-lg px-3 py-2 text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                                                    underlineMode === "ocr"
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
                                    <span className="text-xs font-semibold text-[color:var(--muted)]">Underline selected</span>
                                    <button
                                        onClick={deleteActiveBox}
                                        className="text-xs flex items-center gap-1.5 text-red-500 hover:text-red-600 font-semibold transition bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg"
                                    >
                                        <Trash2 size={14} /> Remove Box
                                    </button>
                                </div>
                            )}

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

                            {!success && (job || jobError || jobId || isProcessing) && (
                                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4">
                                    <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                                        <span className="inline-flex items-center gap-2">
                                            {isProcessing ||
                                            job?.status === "running" ||
                                            job?.status === "queued" ||
                                            (jobId && !job) ? (
                                                <Loader2 size={14} className="animate-spin text-foreground" />
                                            ) : null}
                                            {jobError ? "Failed" : job?.status || (isProcessing ? "Uploading" : "Idle")}
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

                                    <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                                        {jobError ||
                                            job?.message ||
                                            (isProcessing ? "Uploading file to worker..." : "Waiting for job update...")}
                                    </p>

                                    {jobId ? (
                                        <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                                            Job ID: <span className="font-mono">{jobId}</span>
                                        </p>
                                    ) : null}
                                </div>
                            )}

                            <PdfActionButton
                                text="Save Underline Markers"
                                loadingText="Baking Underlines..."
                                loading={isProcessing}
                                disabled={isProcessing || isRenderingCanvas || boxes.length === 0}
                                onClick={handleUnderlineProcessing}
                            />
                        </div>
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
                                <Eye size={16} className="text-indigo-500" /> Underline Canvas
                            </span>

                            {totalPages > 0 && (
                                <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                                    <button
                                        type="button"
                                        disabled={currentPage <= 1}
                                        onClick={() => {
                                            setCurrentPage((p) => p - 1);
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
                                            setCurrentPage((p) => p + 1);
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
                                onClick={(e) => e.stopPropagation()}
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

                                {boxes.filter((box) => box.page === currentPage).map((box) => {
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
                                    <p className="font-semibold">Underlines baked successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The underline marks have been permanently applied to your PDF.
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