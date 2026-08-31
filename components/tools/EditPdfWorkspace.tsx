"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlertTriangle,
    Bold,
    ChevronLeft,
    ChevronRight,
    Download,
    Highlighter,
    Italic,
    Loader2,
    Maximize2,
    Palette,
    Redo2,
    RefreshCw,
    RotateCw,
    Strikethrough,
    Type,
    Underline,
    Undo2,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import {
    downloadEditorJob,
    type EditorJobRecord,
    submitEditorCompile,
    submitEditorExtract,
    waitForEditorJob,
} from "@/lib/editorJobs";
import { notify } from "@/lib/notify";
import { handleClientError } from "@/lib/errorHandler";
import { usePreviews } from "@/lib/preview/usePreviews";

interface ElementStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    background?: {
        enabled?: boolean;
        color?: string;
    } | string;
}

interface LayoutElement {
    text: string;
    original_text?: string;
    target_substring?: string;
    selection_start?: number;
    selection_end?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    font: string;
    bg_color?: string;
    text_color?: string;
    style?: ElementStyle;
    ocr_v2?: boolean;
    source?: string;
    provenance?: string[];
    word_ids?: string[];
    word_geometry?: Array<{ id: string; text: string; x: number; y: number; width: number; height: number }>;
    reading_order?: string[];
    confidence?: number;
}

interface PageData {
    page_num: number;
    width: number;
    height: number;
    elements: LayoutElement[];
}

interface ActiveSelection {
    pageIdx: number;
    elementIdx: number;
    selectionStart: number;
    selectionEnd: number;
    targetSubstring: string;
}

interface PageAnalysis {
    page: number;
    kind: "text" | "mixed" | "scanned" | "blank";
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

interface CustomPdfFile extends File {
    fileId?: string;
    tracker?: string;
    uprightTracker?: string;
}

interface ToolbarPosition {
    top: number;
    left: number;
}

function EditPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { file: sharedFile, setDownloadData, toolId } = useSharedTool();
    const searchParams = useSearchParams();
    const useOcrV2 = searchParams.get("ocr_v2") === "1";
    const file = sharedFile as CustomPdfFile | null;

    const [isExtracting, setIsExtracting] = useState(false);
    const [extractJobId, setExtractJobId] = useState<string | null>(null);
    const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);

    const [pages, setPages] = useState<PageData[]>([]);
    const [history, setHistory] = useState<PageData[][]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);

    const [sourceTracker, setSourceTracker] = useState<string>("");
    const [uprightTracker, setUprightTracker] = useState<string>("");

    const [isCompiling, setIsCompiling] = useState(false);
    const [compileJobId, setCompileJobId] = useState<string | null>(null);

    const [analysis, setAnalysis] = useState<PDFAnalysis | null>(null);

    const previewRequests = useMemo(
        () =>
            pages.map((page) => ({
                file,
                page: page.page_num,
                scale: 2.0,
                renderer: "server" as const,
                enabled: Boolean(file),
            })),
        [file, pages]
    );

    const previewResults = usePreviews(previewRequests);

    const [error, setError] = useState<string | null>(null);

    // Zoom & Navigation UX State
    const [zoomScale, setZoomScale] = useState<number>(1.0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [selectedElementIdx, setSelectedElementIdx] = useState<number | null>(null);
    const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const searchMatches = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase();
        if (!query) return [] as Array<{ pageIdx: number; elementIdx: number }>;
        return pages.flatMap((candidate, pageIdx) => candidate.elements.flatMap((element, elementIdx) =>
            element.text.toLocaleLowerCase().includes(query) ? [{ pageIdx, elementIdx }] : []
        ));
    }, [pages, searchQuery]);

    const containerRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Push snapshot to Undo/Redo history stack
    const recordHistorySnapshot = useCallback((newPages: PageData[]) => {
        const pagesCopy = JSON.parse(JSON.stringify(newPages)) as PageData[];
        setHistory((prev) => {
            const nextHist = prev.slice(0, historyIndex + 1);
            return [...nextHist, pagesCopy];
        });
        setHistoryIndex((prev) => prev + 1);
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            const targetState = history[historyIndex - 1];
            setPages(JSON.parse(JSON.stringify(targetState)));
            setHistoryIndex(historyIndex - 1);
            notify("Undo applied", "info");
        }
    }, [history, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const targetState = history[historyIndex + 1];
            setPages(JSON.parse(JSON.stringify(targetState)));
            setHistoryIndex(historyIndex + 1);
            notify("Redo applied", "info");
        }
    }, [history, historyIndex]);

    const handleResetWorkspace = useCallback(() => {
        if (history.length > 0) {
            setPages(JSON.parse(JSON.stringify(history[0])));
            setHistoryIndex(0);
            setSelectedElementIdx(null);
            setActiveSelection(null);
            notify("Workspace reset to initial state", "info");
        }
    }, [history]);

    const handleFitWidth = useCallback(() => {
        if (containerRef.current && pages[0]) {
            const availableW = containerRef.current.clientWidth - 64;
            if (availableW > 200) {
                const calculatedScale = Math.min(2.0, Math.max(0.5, Math.round((availableW / pages[0].width) * 100) / 100));
                setZoomScale(calculatedScale);
            }
        }
    }, [pages]);

    // Handle Style Change
    const handleStyleChange = useCallback((
        pageIdx: number,
        elementIdx: number,
        styleUpdate: Partial<ElementStyle>,
        targetSubstring?: string,
        selStart?: number,
        selEnd?: number
    ) => {
        const isStyleMutation = Object.keys(styleUpdate).length > 0;

        setPages((prev) => {
            const copy = [...prev];
            const page = copy[pageIdx];
            if (!page || !page.elements[elementIdx]) return prev;

            const element = { ...page.elements[elementIdx] };
            const currentStyle = element.style || {};

            if (isStyleMutation) {
                element.style = {
                    ...currentStyle,
                    ...styleUpdate,
                };
            }

            if (targetSubstring !== undefined) {
                element.target_substring = targetSubstring;
            }
            if (selStart !== undefined) {
                element.selection_start = selStart;
            }
            if (selEnd !== undefined) {
                element.selection_end = selEnd;
            }

            page.elements[elementIdx] = element;
            copy[pageIdx] = page;

            if (isStyleMutation) {
                recordHistorySnapshot(copy);
            }

            return copy;
        });

        if (targetSubstring !== undefined && selStart !== undefined && selEnd !== undefined) {
            setActiveSelection({
                pageIdx,
                elementIdx,
                selectionStart: selStart,
                selectionEnd: selEnd,
                targetSubstring,
            });
        }
    }, [recordHistorySnapshot]);

    // Keyboard Shortcuts Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const keyLower = e.key.toLowerCase();

            if (isCtrlOrCmd && keyLower === "z") {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
                return;
            }

            if (isCtrlOrCmd && keyLower === "y") {
                e.preventDefault();
                handleRedo();
                return;
            }

            if (e.key === "Escape") {
                setSelectedElementIdx(null);
                setActiveSelection(null);
                return;
            }

            if (isCtrlOrCmd && selectedElementIdx !== null) {
                const pIdx = currentPage - 1;
                const elem = pages[pIdx]?.elements[selectedElementIdx];
                if (elem) {
                    if (keyLower === "b") {
                        e.preventDefault();
                        handleStyleChange(pIdx, selectedElementIdx, { bold: !elem.style?.bold });
                    } else if (keyLower === "i") {
                        e.preventDefault();
                        handleStyleChange(pIdx, selectedElementIdx, { italic: !elem.style?.italic });
                    } else if (keyLower === "u") {
                        e.preventDefault();
                        handleStyleChange(pIdx, selectedElementIdx, { underline: !elem.style?.underline });
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentPage, handleRedo, handleStyleChange, handleUndo, pages, selectedElementIdx]);

    // Extract layout for the current live editor session.
    //
    // Extraction job IDs are intentionally NOT persisted by filename. The
    // source PDF is short-lived and may be deleted after compilation, so
    // restoring an old extraction job can point this workspace at a stale R2
    // source on a later visit.
    useEffect(() => {
        if (!file) return;

        let cancelled = false;

        const runExtraction = async () => {
            try {
                setIsExtracting(true);
                setError(null);
                setExtractJob(null);

                const formData = new FormData();
                formData.append("file", file);
                if (useOcrV2) formData.append("ocr_v2", "true");

                const submission = await submitEditorExtract(formData);
                if (cancelled) return;

                setSourceTracker(submission.source_tracker || "");
                setExtractJobId(submission.job_id);
            } catch (e) {
                if (cancelled) return;

                console.error(e);
                setIsExtracting(false);
                setError("Failed to start layout extraction job.");
                handleClientError(e);
            }
        };

        void runExtraction();

        return () => {
            cancelled = true;
        };
    }, [file, useOcrV2]);

    // Poll extract job
    useEffect(() => {
        if (!extractJobId) return;

        let cancelled = false;

        const pollExtract = async () => {
            try {
                const job = await waitForEditorJob(extractJobId);
                if (cancelled) return;

                setExtractJob(job);

                if (job.status === "succeeded" && job.result) {
                    setIsExtracting(false);
                    const pagesData = (job.result.pages || []) as PageData[];
                    setPages(pagesData);
                    setHistory([JSON.parse(JSON.stringify(pagesData))]);
                    setHistoryIndex(0);

                    setSourceTracker(typeof job.result.source_tracker === "string" ? job.result.source_tracker : sourceTracker);
                    setUprightTracker(typeof job.result.upright_tracker === "string" ? job.result.upright_tracker : uprightTracker);

                    if (job.result.analysis) {
                        setAnalysis(job.result.analysis as PDFAnalysis);
                    }
                } else if (job.status === "failed" || job.status === "cancelled") {
                    setIsExtracting(false);
                    setError(job.error || "Layout extraction failed.");
                }
            } catch (e) {
                if (cancelled) return;
                console.error(e);
                setIsExtracting(false);
                setError("Error polling layout extraction status.");
            }
        };

        void pollExtract();

        return () => {
            cancelled = true;
        };
    }, [extractJobId]);



    // Poll compile job.
    //
    // A successful compile consumes the current editor source on the backend.
    // We therefore treat the workspace as a one-shot editing session: after
    // the output is ready, replace the workspace history entry with the
    // download page so Back cannot reopen the consumed editor session.
    useEffect(() => {
        if (!compileJobId) return;

        let cancelled = false;

        const pollCompile = async () => {
            try {
                const job = await waitForEditorJob(compileJobId);
                if (cancelled) return;

                if (job.status === "succeeded") {
                    setIsCompiling(false);

                    const blob = await downloadEditorJob(job.id);

                    setDownloadData({
                        blob,
                        fileName: file?.name ? `edited_${file.name}` : "edited_document.pdf",
                    });

                    localStorage.removeItem("pdfnest:edit:compileJobId");

                    notify("PDF compiled successfully!", "success");

                    // Replace, rather than push, the workspace entry. If the
                    // user presses Back on the download page, the workspace is
                    // not restored with a source_tracker that has already been
                    // consumed/deleted by the compile workflow.
                    router.replace(`/${toolId || "edit-pdf"}/download`);
                    return;
                }

                if (job.status === "failed" || job.status === "cancelled") {
                    const jobError = typeof job.error === "string" ? job.error : "";
                    const normalizedError = jobError.toLowerCase();

                    const isMissingSource =
                        normalizedError.includes("source_not_found") ||
                        normalizedError.includes("nosuchkey") ||
                        normalizedError.includes("does not exist") ||
                        normalizedError.includes("source file not found") ||
                        normalizedError.includes("stream r2 object to disk failed");

                    setIsCompiling(false);
                    localStorage.removeItem("pdfnest:edit:compileJobId");

                    if (isMissingSource) {
                        const message =
                            "This editing session has expired. Please upload the PDF again to start a new editing session.";

                        setError(message);
                        notify(
                            "This editing session has expired. Please upload the PDF again.",
                            "error",
                        );

                        // Never leave the user inside a workspace whose source
                        // document no longer exists.
                        router.replace(`/${toolId || "edit-pdf"}`);
                        return;
                    }

                    setError(jobError || "Compilation failed.");
                }
            } catch (e) {
                if (cancelled) return;

                console.error(e);
                setIsCompiling(false);
                localStorage.removeItem("pdfnest:edit:compileJobId");
                setError("Error polling compilation status.");
            }
        };

        void pollCompile();

        return () => {
            cancelled = true;
        };
    }, [compileJobId, file, router, setDownloadData, toolId]);

    // Handle Input Text Change
    const handleInputChange = (pageIdx: number, elementIdx: number, val: string) => {
        setPages((prev) => {
            const copy = [...prev];
            const page = copy[pageIdx];
            if (!page || !page.elements[elementIdx]) return prev;
            page.elements[elementIdx] = {
                ...page.elements[elementIdx],
                text: val,
            };

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            typingTimeoutRef.current = setTimeout(() => {
                recordHistorySnapshot(copy);
            }, 800);

            return copy;
        });
    };

    const handleCompileSubmit = () => {
        void requireAuth(async () => {
            if (!file || pages.length === 0) return;

            try {
                // Each explicit export starts a fresh compile request.
                // Never reuse a previous compile job ID across sessions.
                localStorage.removeItem("pdfnest:edit:compileJobId");

                setIsCompiling(true);
                setError(null);

                const submission = await submitEditorCompile({
                    pages,
                    source_tracker: sourceTracker,
                    upright_tracker: uprightTracker,
                });

                setCompileJobId(submission.job_id);
                localStorage.setItem("pdfnest:edit:compileJobId", submission.job_id);

                notify("Compilation queued. Waiting for worker...", "info");
            } catch (e) {
                console.error(e);

                const serializedError =
                    e && typeof e === "object"
                        ? JSON.stringify(e).toLowerCase()
                        : String(e).toLowerCase();

                const isMissingSource =
                    serializedError.includes("source_not_found") ||
                    serializedError.includes("nosuchkey") ||
                    serializedError.includes("does not exist") ||
                    serializedError.includes("source file not found") ||
                    serializedError.includes("stream r2 object to disk failed");

                setIsCompiling(false);
                localStorage.removeItem("pdfnest:edit:compileJobId");

                if (isMissingSource) {
                    const message =
                        "This editing session has expired. Please upload the PDF again to start a new editing session.";

                    setError(message);
                    notify(
                        "This editing session has expired. Please upload the PDF again.",
                        "error",
                    );

                    // Do not attempt an automatic re-upload. The intended
                    // lifecycle is one upload -> one editor session -> one
                    // compile. A missing source means this session is over.
                    router.replace(`/${toolId || "edit-pdf"}`);
                    return;
                }

                notify("Compilation failed to queue.", "error");
                handleClientError(e);
            }
        });
    };

    if (!file) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-muted-foreground">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    return (
        <>
            <PdfToolHero
                title="Precision PDF Layout Editor"
                description={useOcrV2 ? "Find and edit text in native PDFs, with scanned text discovery when available." : "Modify text elements inline while preserving the document's original formatting."}
            />

            {useOcrV2 && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200" data-testid="editor-ocr-v2-mode">Scanned text discovery is enabled for this editor.</div>}

            <div className="mt-12 rounded-3xl border border-border bg-card p-8 shadow-lg">
                <div className="flex flex-col gap-4">
                    {(isExtracting ||
                        extractJobId ||
                        (extractJob &&
                            extractJob.status !== "succeeded" &&
                            extractJob.status !== "failed" &&
                            extractJob.status !== "cancelled")) && (
                        <JobProgressCard
                            title="Extracting layout"
                            job={extractJob}
                            active={isExtracting}
                            description="Extracting text layers and geometry metrics..."
                        />
                    )}

                    {error && (
                        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                            <AlertTriangle size={18} />
                            <p className="text-sm font-semibold">{error}</p>
                        </div>
                    )}

                    {pages.length > 0 && (
                        <div className="flex flex-col gap-6">
                            {/* Editor Control Header (Undo/Redo, Zoom, Fit Width, Page Nav, Reset) */}
                            <div className="sticky top-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-indigo-900/50 dark:bg-zinc-900/95">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleUndo}
                                        disabled={historyIndex <= 0}
                                        title="Undo (Ctrl+Z)"
                                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-gray-100 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                    >
                                        <Undo2 size={14} />
                                        Undo
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleRedo}
                                        disabled={historyIndex >= history.length - 1}
                                        title="Redo (Ctrl+Shift+Z)"
                                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-gray-100 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                    >
                                        <Redo2 size={14} />
                                        Redo
                                    </button>

                                    <div className="h-4 w-px bg-gray-200 dark:bg-zinc-800 mx-1" />

                                    {/* Zoom Controls */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setZoomScale((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100))}
                                            title="Zoom Out"
                                            className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                        >
                                            <ZoomOut size={14} />
                                        </button>

                                        <select
                                            value={zoomScale}
                                            onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                                            className="rounded-lg border border-gray-200 bg-transparent px-2 py-1 text-xs font-bold outline-none dark:border-zinc-800"
                                        >
                                            <option value={0.5} className="dark:bg-zinc-900">50%</option>
                                            <option value={0.75} className="dark:bg-zinc-900">75%</option>
                                            <option value={1.0} className="dark:bg-zinc-900">100%</option>
                                            <option value={1.25} className="dark:bg-zinc-900">125%</option>
                                            <option value={1.5} className="dark:bg-zinc-900">150%</option>
                                            <option value={2.0} className="dark:bg-zinc-900">200%</option>
                                        </select>

                                        <button
                                            type="button"
                                            onClick={() => setZoomScale((s) => Math.min(2.0, Math.round((s + 0.25) * 100) / 100))}
                                            title="Zoom In"
                                            className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                        >
                                            <ZoomIn size={14} />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleFitWidth}
                                            title="Fit Width"
                                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                        >
                                            <Maximize2 size={12} />
                                            Fit Width
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {useOcrV2 && <div className="flex items-center gap-2">
                                        <label htmlFor="editor-search" className="sr-only">Search editor text</label>
                                        <input id="editor-search" data-testid="editor-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text" className="w-36 rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-zinc-800" />
                                        <span data-testid="editor-search-count" className="text-xs font-semibold text-zinc-500">{searchMatches.length} matches</span>
                                        {searchMatches[0] && <button type="button" onClick={() => { setCurrentPage(searchMatches[0].pageIdx + 1); setSelectedElementIdx(searchMatches[0].elementIdx); }} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold hover:bg-gray-100 dark:border-zinc-800 dark:hover:bg-zinc-800">Select first</button>}
                                    </div>}
                                    {/* Page Nav */}
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            disabled={currentPage <= 1}
                                            className="rounded p-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-zinc-800"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span>Page {currentPage} of {pages.length}</span>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
                                            disabled={currentPage >= pages.length}
                                            className="rounded p-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-zinc-800"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleResetWorkspace}
                                        title="Reset Workspace"
                                        className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/50"
                                    >
                                        <RotateCw size={12} />
                                        Reset
                                    </button>
                                </div>
                            </div>

                            {/* Canvas & Overlay Workspace Container */}
                            <div ref={containerRef} className="flex flex-col items-center gap-8 overflow-x-auto py-4">
                                {pages.map((page, pageIdx) => {
                                    if (currentPage !== pageIdx + 1 && pages.length > 1) {
                                        return null;
                                    }

                                    return (
                                        <div key={pageIdx} className="flex flex-col items-center gap-2">
                                            <div className="flex w-full items-center justify-between px-2">
                                                <span className="text-xs font-bold text-zinc-500">
                                                    Page {page.page_num} ({page.elements.length} elements)
                                                </span>
                                            </div>

                                            <div className="relative overflow-hidden rounded-xl border border-gray-300 shadow-2xl dark:border-zinc-800">
                                                <PdfCanvasPage
                                                    page={page}
                                                    previewSrc={previewResults[pageIdx]?.src}
                                                    isPreviewLoading={previewResults[pageIdx]?.isLoading}
                                                    pageIdx={pageIdx}
                                                    zoomScale={zoomScale}
                                                    selectedElementIdx={selectedElementIdx}
                                                    setSelectedElementIdx={setSelectedElementIdx}
                                                    handleInputChange={handleInputChange}
                                                    handleStyleChange={handleStyleChange}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={handleCompileSubmit}
                                disabled={isCompiling || pages.length === 0}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isCompiling ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} />
                                        Assembling layers across all pages...
                                    </>
                                ) : (
                                    <>
                                        <Download size={16} />
                                        Export Precision Vector Document Changes
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default EditPdfWorkspace;

interface FormattingToolbarProps {
    element: LayoutElement;
    position: ToolbarPosition;
    onStyleChange: (
        styleUpdate: Partial<ElementStyle>,
        targetSubstring?: string,
        selStart?: number,
        selEnd?: number
    ) => void;
}

function FormattingToolbar({ element, position, onStyleChange }: FormattingToolbarProps) {
    const style = element.style || {};
    const font = style.fontFamily || "original";
    const size = style.fontSize || element.size || 12;
    const isBold = Boolean(style.bold);
    const isItalic = Boolean(style.italic);
    const isUnderline = Boolean(style.underline);
    const isStrikethrough = Boolean(style.strikethrough);
    const color = style.color || element.text_color || "#000000";

    let bgHex = "";
    if (typeof style.background === "string") {
        bgHex = style.background === "transparent" ? "" : style.background;
    } else if (typeof style.background === "object" && style.background?.enabled) {
        bgHex = style.background.color || "#FEF08A";
    }

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            onMouseDown={preventFocusLoss}
            style={{
                position: "fixed",
                top: `${position.top}px`,
                left: `${position.left}px`,
                zIndex: 9999,
            }}
            className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-indigo-900/50 dark:bg-zinc-900/95 text-xs text-zinc-800 dark:text-zinc-100 transition-all duration-150"
        >
            {/* Font Family Selector */}
            <select
                value={font}
                onChange={(e) => onStyleChange({ fontFamily: e.target.value })}
                className="rounded-lg border border-gray-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-indigo-500"
            >
                <option value="original" className="dark:bg-zinc-900">Original Font</option>
                <option value="helv" className="dark:bg-zinc-900">Helvetica</option>
                <option value="tiro" className="dark:bg-zinc-900">Times-Roman</option>
                <option value="cour" className="dark:bg-zinc-900">Courier</option>
                <option value="noto" className="dark:bg-zinc-900">Noto Sans</option>
            </select>

            {/* Font Size Selector */}
            <div className="flex items-center gap-1 border-r border-gray-200 dark:border-zinc-800 pr-2">
                <button
                    type="button"
                    onClick={() => onStyleChange({ fontSize: Math.max(6, size - 1) })}
                    className="rounded border border-gray-300 dark:border-zinc-700 px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 font-bold"
                >
                    -
                </button>
                <input
                    type="number"
                    value={Math.round(size)}
                    min={6}
                    max={72}
                    onChange={(e) => onStyleChange({ fontSize: Math.max(6, Math.min(72, parseInt(e.target.value) || 12)) })}
                    className="w-10 text-center font-bold bg-transparent border-0 outline-none"
                />
                <button
                    type="button"
                    onClick={() => onStyleChange({ fontSize: Math.min(72, size + 1) })}
                    className="rounded border border-gray-300 dark:border-zinc-700 px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 font-bold"
                >
                    +
                </button>
            </div>

            {/* Formatting Toggles */}
            <div className="flex items-center gap-1 border-r border-gray-200 dark:border-zinc-800 pr-2">
                <button
                    type="button"
                    onClick={() => onStyleChange({ bold: !isBold })}
                    title="Bold (Ctrl+B)"
                    className={`rounded p-1.5 ${isBold ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
                >
                    <Bold size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => onStyleChange({ italic: !isItalic })}
                    title="Italic (Ctrl+I)"
                    className={`rounded p-1.5 ${isItalic ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
                >
                    <Italic size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => onStyleChange({ underline: !isUnderline })}
                    title="Underline (Ctrl+U)"
                    className={`rounded p-1.5 ${isUnderline ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
                >
                    <Underline size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => onStyleChange({ strikethrough: !isStrikethrough })}
                    title="Strikethrough"
                    className={`rounded p-1.5 ${isStrikethrough ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
                >
                    <Strikethrough size={14} />
                </button>
            </div>

            {/* Text Color Picker & Presets */}
            <div className="flex items-center gap-1 border-r border-gray-200 dark:border-zinc-800 pr-2">
                <Palette size={14} className="text-zinc-500" />
                <div className="flex items-center gap-1">
                    {["#000000", "#4B5563", "#1E3A8A", "#DC2626", "#16A34A", "#7C3AED"].map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => onStyleChange({ color: c })}
                            className="h-4 w-4 rounded-full border border-gray-300 dark:border-zinc-700 transition hover:scale-110"
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    <input
                        type="color"
                        value={color.startsWith("#") ? color : "#000000"}
                        onChange={(e) => onStyleChange({ color: e.target.value })}
                        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                </div>
            </div>

            {/* Highlight Background Picker & Presets */}
            <div className="flex items-center gap-1">
                <Highlighter size={14} className="text-zinc-500" />
                <div className="flex items-center gap-1">
                    {["#FEF08A", "#BBF7D0", "#BFDBFE", "#FBCFE8"].map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => onStyleChange({ background: c })}
                            className="h-4 w-4 rounded-full border border-gray-300 dark:border-zinc-700 transition hover:scale-110"
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    {bgHex && (
                        <button
                            type="button"
                            onClick={() => onStyleChange({ background: "transparent" })}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-red-500 hover:underline"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

interface PdfCanvasPageProps {
    page: PageData;
    previewSrc?: string;
    isPreviewLoading?: boolean;
    pageIdx: number;
    zoomScale: number;
    selectedElementIdx: number | null;
    setSelectedElementIdx: (idx: number | null) => void;
    handleInputChange: (pageIdx: number, elementIdx: number, val: string) => void;
    handleStyleChange: (
        pageIdx: number,
        elementIdx: number,
        styleUpdate: Partial<ElementStyle>,
        targetSubstring?: string,
        selStart?: number,
        selEnd?: number
    ) => void;
}

function PdfCanvasPage({
                           page,
                           previewSrc,
                           isPreviewLoading,
                           pageIdx,
                           zoomScale,
                           selectedElementIdx,
                           setSelectedElementIdx,
                           handleInputChange,
                           handleStyleChange,
                       }: PdfCanvasPageProps) {
    const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null);
    const activeInputRef = useRef<HTMLInputElement | null>(null);

    const scaledWidth = page.width * zoomScale;
    const scaledHeight = page.height * zoomScale;

    const updateToolbarPosition = useCallback(() => {
        if (selectedElementIdx === null || !activeInputRef.current) {
            setToolbarPosition(null);
            return;
        }

        const rect = activeInputRef.current.getBoundingClientRect();
        const toolbarHeight = 52;
        const toolbarWidth = 520;

        let top = rect.top - toolbarHeight - 12;
        if (top < 60) {
            top = rect.bottom + 12;
        }

        let left = rect.left + rect.width / 2 - toolbarWidth / 2;
        left = Math.max(16, Math.min(window.innerWidth - toolbarWidth - 16, left));

        setToolbarPosition({ top, left });
    }, [selectedElementIdx]);

    useEffect(() => {
        updateToolbarPosition();
        window.addEventListener("scroll", updateToolbarPosition, { passive: true });
        window.addEventListener("resize", updateToolbarPosition, { passive: true });

        return () => {
            window.removeEventListener("scroll", updateToolbarPosition);
            window.removeEventListener("resize", updateToolbarPosition);
        };
    }, [updateToolbarPosition]);

    return (
        <div
            className="relative bg-white dark:bg-zinc-950 rounded-xl"
            style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
        >
            {previewSrc ? (
                <img
                    src={previewSrc}
                    alt={`Page ${page.page_num}`}
                    className="absolute left-0 top-0 z-0 h-full w-full object-fill rounded-xl select-none"
                    draggable={false}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-900 rounded-xl">
                    <Loader2 className="animate-spin text-indigo-500" size={24} />
                </div>
            )}

            <div className="absolute left-0 top-0 z-10 h-full w-full pointer-events-none">
                {page.elements.map((element: LayoutElement, elementIdx: number) => {
                    const isSelected = selectedElementIdx === elementIdx;
                    const elemX = element.x * zoomScale;
                    const elemY = element.y * zoomScale;
                    const elemWidth = (element.width + 2) * zoomScale;
                    const elemHeight = (element.height + 1) * zoomScale;
                    const elemSize = element.size * zoomScale;

                    // Determine user background highlight fill if explicitly set
                    let bgStyle = "transparent";
                    if (typeof element.style?.background === "string") {
                        bgStyle = element.style.background;
                    } else if (typeof element.style?.background === "object" && element.style.background?.enabled) {
                        bgStyle = element.style.background.color || "#FEF08A";
                    }

                    return (
                        <div
                            key={elementIdx}
                            className="pointer-events-none absolute"
                            style={{
                                left: `${elemX}px`,
                                top: `${elemY}px`,
                                width: `${elemWidth}px`,
                                height: `${elemHeight}px`,
                            }}
                        >
                            {isSelected && toolbarPosition && (
                                <FormattingToolbar
                                    element={element}
                                    position={toolbarPosition}
                                    onStyleChange={(styleUpdate, targetSub, selStart, selEnd) =>
                                        handleStyleChange(pageIdx, elementIdx, styleUpdate, targetSub, selStart, selEnd)
                                    }
                                />
                            )}

                            <input
                                ref={(el) => {
                                    if (isSelected) {
                                        activeInputRef.current = el;
                                    }
                                }}
                                type="text"
                                value={element.text}
                                aria-label="Edit selected PDF text"
                                onFocus={() => {
                                    setSelectedElementIdx(elementIdx);
                                    setTimeout(updateToolbarPosition, 10);
                                }}
                                onBlur={(e) => {
                                    if (!e.relatedTarget) {
                                        setSelectedElementIdx(null);
                                    }
                                }}
                                onChange={(e) => handleInputChange(pageIdx, elementIdx, e.target.value)}
                                onSelect={(e) => {
                                    const input = e.currentTarget;
                                    const start = input.selectionStart || 0;
                                    const end = input.selectionEnd || 0;
                                    const selText = input.value.substring(start, end);
                                    if (selText && selText.trim()) {
                                        handleStyleChange(pageIdx, elementIdx, {}, selText.trim(), start, end);
                                    }
                                }}
                                style={{
                                    fontSize: `${elemSize}px`,
                                    lineHeight: `${elemHeight}px`,
                                    fontFamily: element.font || "sans-serif",
                                    // PROBLEM 2 FIX: Inactive text uses transparent color so canvas text shows naturally with 0 ghosting/doubling!
                                    color: isSelected
                                        ? element.style?.color || element.text_color || "#000000"
                                        : "transparent",
                                    caretColor: isSelected ? "#4F46E5" : "transparent",
                                    fontWeight: element.style?.bold ? "bold" : "normal",
                                    fontStyle: element.style?.italic ? "italic" : "normal",
                                    textDecoration: [
                                        element.style?.underline ? "underline" : "",
                                        element.style?.strikethrough ? "line-through" : "",
                                    ].filter(Boolean).join(" "),
                                    backgroundColor: isSelected
                                        ? bgStyle !== "transparent" ? bgStyle : "#ffffff"
                                        : bgStyle !== "transparent" ? bgStyle : "transparent",
                                }}
                                className={`pointer-events-auto h-full w-full border-b outline-none transition-all duration-150 ${
                                    isSelected
                                        ? "border-2 border-indigo-500 shadow-md"
                                        : "border-transparent hover:border-indigo-300 hover:bg-indigo-50/10"
                                }`}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
