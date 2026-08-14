"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { loadPdfJs } from "@/components/shared/LoadPdfJs";
import { useAuth } from "@/context/AuthContext";
import { getFriendlyErrorMessage, handleClientError } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import {
    analyzePdfStructure,
    downloadMarkupJobPdf,
    submitMarkupJob,
    waitForMarkupJob,
} from "@/lib/markup/api";
import { MARKUP_TOOLS, type MarkupToolConfig } from "@/lib/markup/config";
import type {
    CustomPdfFile,
    JobRecord,
    MarkupBox,
    MarkupKind,
    MarkupMode,
    PageAnalysis,
    PageKind,
    PdfJsDocument,
    PdfJsRenderTask,
} from "@/lib/markup/types";
import { usePreview } from "@/lib/preview/usePreview";
import type { PreviewError } from "@/lib/preview/types";

export interface MarkupCompletion {
    file: File;
    blob: Blob;
    fileName: string;
}

export interface UseMarkupEditorOptions {
    kind: MarkupKind;
    file: File | null;
    /** Toast shown once the processed PDF is available. */
    successNotice: string;
    onComplete: (completion: MarkupCompletion) => void | Promise<void>;
}

export interface UseMarkupEditorResult {
    config: MarkupToolConfig;

    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    scaleFactor: number;
    isRenderingCanvas: boolean;
    currentPage: number;
    totalPages: number;
    goToPage: (page: number) => void;

    boxes: MarkupBox[];
    currentPageBoxes: MarkupBox[];
    activeId: string | null;
    setActiveId: (id: string | null) => void;
    deleteActiveBox: () => void;

    selectedColor: string;
    setSelectedColor: (hex: string) => void;
    mode: MarkupMode;
    setMode: (mode: MarkupMode) => void;
    canUseSmartMode: boolean;

    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;

    isAnalyzing: boolean;
    analysisLoaded: boolean;
    analysisError: string | null;
    currentPageAnalysis: PageAnalysis | null;
    pageKind: PageKind | null;
    isScannedPage: boolean;
    isTextPage: boolean;
    isMixedPage: boolean;

    job: JobRecord | null;
    jobId: string;
    jobError: string | null;
    uploadProgress: number;
    progress: number;
    statusText: string;
    isProcessing: boolean;
    success: boolean;

    scannedPreviewSrc: string;
    scannedPreviewLoading: boolean;

    onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;

    submit: () => void;
}

/**
 * Shared state machine behind the highlight / underline / strikeout editors:
 * PDF.js page rendering, structure analysis, box drawing with undo history and
 * markup job submission plus polling.
 */
export function useMarkupEditor({
    kind,
    file,
    successNotice,
    onComplete,
}: UseMarkupEditorOptions): UseMarkupEditorResult {
    const config = MARKUP_TOOLS[kind];
    const { requireAuth } = useAuth();

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);

    const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
    const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });

    const [boxes, setBoxes] = useState<MarkupBox[]>([]);
    const [selectedColor, setSelectedColor] = useState(config.defaultColor);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [mode, setMode] = useState<MarkupMode>("smart");

    const [historyPast, setHistoryPast] = useState<MarkupBox[][]>([]);
    const [historyFuture, setHistoryFuture] = useState<MarkupBox[][]>([]);

    const [pageAnalysisMap, setPageAnalysisMap] = useState<Record<number, PageAnalysis>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisLoaded, setAnalysisLoaded] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const [jobId, setJobId] = useState("");
    const [job, setJob] = useState<JobRecord | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [jobError, setJobError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);
    const analysisAbortRef = useRef<AbortController | null>(null);
    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
    const handledSuccessRef = useRef(false);
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

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

    const { src: scannedPreviewSrc, isLoading: scannedPreviewLoading } = usePreview({
        file,
        page: currentPage,
        scale: 2.0,
        enabled: isScannedPage,
        onError: (err: PreviewError) => console.error("Failed to render scanned page preview:", err.message),
    });

    const updateBoxesWithHistory = useCallback(
        (nextState: MarkupBox[] | ((prev: MarkupBox[]) => MarkupBox[])) => {
            setBoxes((prev) => {
                const computedNext = typeof nextState === "function" ? nextState(prev) : nextState;
                setHistoryPast((past) => [...past, prev]);
                setHistoryFuture([]);
                return computedNext;
            });
        },
        []
    );

    const undo = useCallback(() => {
        setHistoryPast((past) => {
            if (past.length === 0) return past;
            const previousState = past[past.length - 1];
            setBoxes((current) => {
                setHistoryFuture((future) => [current, ...future]);
                return previousState;
            });
            setActiveId(null);
            return past.slice(0, -1);
        });
    }, []);

    const redo = useCallback(() => {
        setHistoryFuture((future) => {
            if (future.length === 0) return future;
            const nextState = future[0];
            setBoxes((current) => {
                setHistoryPast((past) => [...past, current]);
                return nextState;
            });
            setActiveId(null);
            return future.slice(1);
        });
    }, []);

    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            const isMeta = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (isMeta && key === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (isMeta && key === "y") {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener("keydown", handleKeyboard);
        return () => window.removeEventListener("keydown", handleKeyboard);
    }, [redo, undo]);

    // Reset every piece of editor state whenever the source document changes.
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
        setMode("smart");
        setPageAnalysisMap({});
        setAnalysisLoaded(false);
        setAnalysisError(null);
        setIsAnalyzing(false);

        if (!file) return;

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

                if (cancelled || !pdf) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
            } catch (err) {
                console.error("Failed to parse PDF document:", err);
            } finally {
                if (!cancelled) setIsRenderingCanvas(false);
            }
        };

        void loadPdf();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [file]);

    useEffect(() => {
        if (!file) return;

        analysisAbortRef.current?.abort();
        const controller = new AbortController();
        analysisAbortRef.current = controller;

        const analyze = async () => {
            try {
                setIsAnalyzing(true);
                setAnalysisLoaded(false);
                setAnalysisError(null);

                const map = await analyzePdfStructure(
                    file,
                    (file as CustomPdfFile).originalPassword,
                    controller.signal
                );

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
    }, [file]);

    useEffect(() => {
        if (!currentPageAnalysis) return;
        if (currentPageAnalysis.kind === "scanned" && mode === "smart") {
            setMode("manual");
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

                const renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
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
        handledSuccessRef.current = false;
        const pollingJobId = jobId;

        const run = async () => {
            try {
                const finalJob = await waitForMarkupJob(
                    pollingJobId,
                    (nextJob) => {
                        setJob(nextJob);
                        setJobError(null);
                    },
                    controller.signal
                );

                if (controller.signal.aborted) return;

                setJob(finalJob);

                if (finalJob.status === "failed") {
                    throw new Error(finalJob.error || config.failureMessage);
                }

                if (finalJob.status !== "succeeded" || handledSuccessRef.current) return;
                handledSuccessRef.current = true;

                const blob = await downloadMarkupJobPdf(pollingJobId);

                const baseName = (file?.name || "document.pdf").replace(/\.pdf$/i, "");
                const fileName = `${baseName}-${config.fileSuffix}.pdf`;
                const processedFile = new File([blob], fileName, { type: "application/pdf" });

                await onCompleteRef.current({ file: processedFile, blob, fileName });

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

                notify(successNotice, "success");
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobId]);

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (!containerRef.current || pdfDimensions.width === 0) return;
        e.preventDefault();

        const rect = containerRef.current.getBoundingClientRect();
        const clickPdfX = (e.clientX - rect.left) / scaleFactor;
        const clickPdfY = (e.clientY - rect.top) / scaleFactor;

        const boxId = Math.random().toString(36).substring(7);
        isDrawingRef.current = true;
        drawStartRef.current = { x: clickPdfX, y: clickPdfY, id: boxId };
        setActiveId(boxId);

        updateBoxesWithHistory((prev) => [
            ...prev,
            {
                id: boxId,
                x: clickPdfX,
                y: clickPdfY,
                width: 1,
                height: 1,
                page: currentPage,
                color: selectedColor,
            },
        ]);
    };

    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
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
            prev.map((box) =>
                box.id === start.id
                    ? {
                        ...box,
                        x: Math.max(0, targetX),
                        y: Math.max(0, targetY),
                        width: Math.min(pdfDimensions.width - targetX, targetWidth),
                        height: Math.min(pdfDimensions.height - targetY, targetHeight),
                    }
                    : box
            )
        );
    };

    const onPointerUp = () => {
        isDrawingRef.current = false;
        drawStartRef.current = null;
    };

    const deleteActiveBox = () => {
        if (!activeId) return;
        updateBoxesWithHistory((prev) => prev.filter((b) => b.id !== activeId));
        setActiveId(null);
    };

    const goToPage = (page: number) => {
        setCurrentPage(page);
        setActiveId(null);
    };

    const submit = () => {
        if (!file) return;

        const validBoxes = boxes.filter((b) => b.width > 2 && b.height > 2);
        if (validBoxes.length === 0) {
            notify(config.emptyBoxesWarning, "warning");
            return;
        }

        if (currentPageAnalysis?.kind === "scanned" && mode === "smart") {
            notify(`This page is scanned. Please choose ${config.manualModeLabel} or Recognize Text.`, "warning");
            return;
        }

        const validFile = file as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);
                setJobError(null);
                setUploadProgress(0);

                const submission = await submitMarkupJob(
                    kind,
                    validFile,
                    validBoxes,
                    mode,
                    validFile.originalPassword
                );

                setJobId(submission.job_id);
                setJob(null);
                setUploadProgress(100);
                notify(config.queuedNotice, "info");
            } catch (err) {
                console.error(err);
                setJobError(getFriendlyErrorMessage(err));
                handleClientError(err);
                setIsProcessing(false);
            }
        });
    };

    const progress = Math.max(0, Math.min(100, job?.progress ?? uploadProgress));
    const statusText = jobError
        ? "Failed"
        : job?.status === "running" || job?.status === "queued"
            ? "Processing"
            : isProcessing
                ? "Uploading"
                : job?.status === "succeeded"
                    ? "Completed"
                    : "Idle";

    return {
        config,

        canvasRef,
        containerRef,
        scaleFactor,
        isRenderingCanvas,
        currentPage,
        totalPages,
        goToPage,

        boxes,
        currentPageBoxes,
        activeId,
        setActiveId,
        deleteActiveBox,

        selectedColor,
        setSelectedColor,
        mode,
        setMode,
        canUseSmartMode,

        canUndo: historyPast.length > 0,
        canRedo: historyFuture.length > 0,
        undo,
        redo,

        isAnalyzing,
        analysisLoaded,
        analysisError,
        currentPageAnalysis,
        pageKind,
        isScannedPage,
        isTextPage,
        isMixedPage,

        job,
        jobId,
        jobError,
        uploadProgress,
        progress,
        statusText,
        isProcessing,
        success,

        scannedPreviewSrc,
        scannedPreviewLoading,

        onPointerDown,
        onPointerMove,
        onPointerUp,

        submit,
    };
}
