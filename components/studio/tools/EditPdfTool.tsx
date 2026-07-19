"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {AlertTriangle, Download, FileEdit, Loader2, RefreshCw, RotateCw} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import {notify} from "@/lib/notify";
import {getFriendlyErrorMessage, handleClientError} from "@/lib/errorHandler";
import {getBaseUrl} from "@/lib/api";


import {
    downloadEditorJob,
    type EditorJobRecord,
    submitEditorCompile,
    submitEditorExtract,
    waitForEditorJob,
} from "@/lib/editorJobs";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import {loadPdfJs} from "@/components/shared/LoadPdfJs";

interface LayoutElement {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    font: string;
    bg_color?: string;
    text_color?: string;
}

interface PageData {
    page_num: number;
    width: number;
    height: number;
    elements: LayoutElement[];
}

interface PdfJsPage {
    rotate: number;
    getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
        canvas?: HTMLCanvasElement;
    }) => { promise: Promise<void>; cancel: () => void };
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
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

interface EditPdfToolProps {
    baseFile: File | null;
    onEditedFile: (file: File) => Promise<void>;
}

type CustomPdfFile = File & {
    originalPassword?: string;
};

function hasScannedLikePages(analysis: PDFAnalysis | null): number[] {
    if (!analysis?.pages?.length) return [];

    return analysis.pages
        .filter((page) => page.kind === "scanned" || page.kind === "blank" || !page.hasSelectableText)
        .map((page) => page.page);
}


export default function EditPdfTool({baseFile, onEditedFile}: EditPdfToolProps) {
    const {requireAuth} = useAuth();

    const [pages, setPages] = useState<PageData[]>([]);
    const [sourceTracker, setSourceTracker] = useState<string>("");
    const [uprightTracker, setUprightTracker] = useState<string>("");
    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [analysis, setAnalysis] = useState<PDFAnalysis | null>(null);
    const [scannedPages, setScannedPages] = useState<number[]>([]);

    const [isExtracting, setIsExtracting] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [isDocumentRotated, setIsDocumentRotated] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const renderTaskRefs = useRef<Map<number, { cancel: () => void }>>(new Map());

    const [extractJobId, setExtractJobId] = useState<string>("");
    const [compileJobId, setCompileJobId] = useState<string>("");
    const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);
    const [compileJob, setCompileJob] = useState<EditorJobRecord | null>(null);

    const onEditedFileRef = useRef(onEditedFile);
    const compileSourceNameRef = useRef<string>("");

    useEffect(() => {
        onEditedFileRef.current = onEditedFile;
    }, [onEditedFile]);

    useEffect(() => {
        if (!baseFile) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPages([]);
            setSourceTracker("");
            setUprightTracker("");
            setPdfDocument(null);
            setAnalysis(null);
            setScannedPages([]);
            setIsDocumentRotated(false);
            setSuccess(false);
            setError(null);
            setIsExtracting(false);
            setIsCompiling(false);
            return;
        }

        let cancelled = false;

        const parsePdfLayout = async () => {
            setIsExtracting(true);
            setPages([]);
            setPdfDocument(null);
            setAnalysis(null);
            setScannedPages([]);
            setIsDocumentRotated(false);
            setSuccess(false);
            setError(null);

            try {
                const typedFile = baseFile as CustomPdfFile;

                const analysisForm = new FormData();
                analysisForm.append("file", baseFile);
                if (typedFile.originalPassword) {
                    analysisForm.append("file_password", typedFile.originalPassword);
                }

                const analysisResponse = await fetch(`${getBaseUrl()}/api/structure/analyze`, {
                    method: "POST",
                    body: analysisForm,
                    credentials: "include",
                });

                if (analysisResponse.ok) {
                    const analysisData: PDFAnalysis = await analysisResponse.json();
                    if (!cancelled) {
                        setAnalysis(analysisData);
                        const scanned = hasScannedLikePages(analysisData);
                        setScannedPages(scanned);
                    }
                }

                const formData = new FormData();
                formData.append("file", baseFile);
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const submission = await submitEditorExtract(formData);

                if (cancelled) return;

                setExtractJobId(submission.job_id);
                localStorage.setItem("pdfnest:edit:extractJobId", submission.job_id);
                notify("Layout extraction queued. Waiting for worker...", "info");
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError(getFriendlyErrorMessage(e));
                    notify("Failed to queue layout extraction.", "error");
                }
            } finally {
                if (!cancelled) {
                    setIsExtracting(false);
                }
            }
        };


        void parsePdfLayout();

        return () => {
            cancelled = true;
            renderTaskRefs.current.forEach((task) => task.cancel());
            renderTaskRefs.current.clear();
        };
    }, [baseFile]);


    useEffect(() => {
        const saved = localStorage.getItem("pdfnest:edit:extractJobId");
        if (saved && !extractJobId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExtractJobId(saved);
        }
    }, []);

    useEffect(() => {
        if (!extractJobId) return;

        let cancelled = false;

        void (async () => {
            try {
                const job = await waitForEditorJob(extractJobId, (nextJob) => {
                    if (!cancelled) setExtractJob(nextJob);
                });

                if (cancelled) return;

                setExtractJob(job);

                if (job.status === "failed") {
                    throw new Error(job.error || "Extraction failed");
                }

                if (job.status !== "succeeded") return;

                const result = job.result as
                    | {
                    pages?: PageData[];
                    source_tracker?: string;
                    upright_tracker?: string;
                }
                    | null;

                if (!result?.pages) {
                    throw new Error("Malformed extraction result.");
                }

                setPages(result.pages);
                setSourceTracker(result.source_tracker || "");
                setUprightTracker(result.upright_tracker || result.source_tracker || "");

                const pdfjsLib = await loadPdfJs();

                if (baseFile == null) {
                    notify("Compilation failed", "error");
                    return;
                }

                const rawPdfTask = await pdfjsLib.getDocument({
                    data: new Uint8Array(await baseFile.arrayBuffer()),
                }).promise;

                let foundRotation = false;
                for (let i = 1; i <= rawPdfTask.numPages; i++) {
                    const rawPage = await rawPdfTask.getPage(i);
                    if (rawPage.rotate !== 0) {
                        foundRotation = true;
                        break;
                    }
                }

                if (!cancelled) {
                    setIsDocumentRotated(foundRotation);
                }


                const arrayBuffer = await (baseFile.arrayBuffer());
                const pdf = await pdfjsLib.getDocument({data: new Uint8Array(arrayBuffer)}).promise;

                if (!cancelled) {
                    setPdfDocument(pdf as unknown as PdfJsDocument);
                }

                if (foundRotation) {
                    notify(
                        "Warning: This PDF contains rotated pages. For best editing results, use Rotate Tool first.",
                        "warning"
                    );
                } else {
                    notify("Document layout mapped successfully.", "success");
                }

                localStorage.removeItem("pdfnest:edit:extractJobId");
                setExtractJobId("");
            } catch (e) {
                if (e != null)
                    console.error(e);
                if (!cancelled) {
                    setError(getFriendlyErrorMessage(e));
                    notify("Failed to parse structural layout grids.", "error");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [extractJobId, baseFile]);

    useEffect(() => {
        if (!pdfDocument || pages.length === 0) return;

        let cancelled = false;

        const renderVisiblePages = async () => {
            for (const page of pages) {
                const canvas = pageCanvasRefs.current.get(page.page_num);
                if (!canvas) continue;

                try {
                    const pdfPage = await pdfDocument.getPage(page.page_num);
                    if (cancelled) return;

                    const context = canvas.getContext("2d");
                    if (!context) continue;

                    const viewport = pdfPage.getViewport({scale: 1.0, rotation: 0});
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.width = `${viewport.width}px`;
                    canvas.style.height = `${viewport.height}px`;

                    const task = pdfPage.render({
                        canvasContext: context,
                        viewport,
                        canvas,
                    });

                    renderTaskRefs.current.set(page.page_num, task);
                    await task.promise;
                } catch (err: unknown) {
                    const errorObj = err as Error;
                    if (errorObj?.name !== "RenderingCancelledException") {
                        console.error(`Page ${page.page_num} render thread failed:`, err);
                    }
                }
            }
        };

        void renderVisiblePages();

        return () => {
            cancelled = true;
            renderTaskRefs.current.forEach((task) => task.cancel());
            renderTaskRefs.current.clear();
        };
    }, [pdfDocument, pages]);

    const handleInputChange = (pageIdx: number, elementIdx: number, val: string) => {
        setPages((prev) => {
            const copy = [...prev];
            const page = copy[pageIdx];
            if (!page || !page.elements[elementIdx]) return prev;
            page.elements[elementIdx] = {
                ...page.elements[elementIdx],
                text: val,
            };
            return copy;
        });
    };

    const handleCompileSubmit = () => {
        requireAuth(async () => {

            console.log("Compile effect started", compileJobId);

            if (!baseFile || pages.length === 0) return;

            try {
                setIsCompiling(true);
                setSuccess(false);
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
                if (e==null)
                    return
                console.error(e);
                notify("Compilation failed to queue.", "error");
                handleClientError(e);
            } finally {
                setIsCompiling(false);
            }
        });
    };

    useEffect(() => {
        const saved = localStorage.getItem("pdfnest:edit:compileJobId");
        if (saved && !compileJobId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCompileJobId(saved);
        }
    }, []);

    useEffect(() => {
        if (!compileJobId) return;

        let cancelled = false;

        void (async () => {
            try {
                console.log("Waiting...");

                const jobId = compileJobId;
                const sourceName = compileSourceNameRef.current || "edited_document.pdf";

                const job = await waitForEditorJob(jobId, (nextJob) => {
                    if (!cancelled) setCompileJob(nextJob);
                });

                if (cancelled) return;

                console.log("Job:", job.status);

                setCompileJob(job);

                if (job.status === "failed") {
                    throw new Error(job.error || "Compilation failed");
                }

                if (job.status !== "succeeded") return;

                console.log("Downloading...");

                const blob = await downloadEditorJob(jobId);

                console.log("Downloaded");

                if (baseFile == null) {
                    notify("Compilation failed", "error");
                    return;
                }

                const editedFile = new File([blob], `edited_${sourceName}`, {
                    type: "application/pdf",
                });

                localStorage.removeItem("pdfnest:edit:compileJobId");
                setCompileJobId("");

                await onEditedFileRef.current(editedFile);

                console.log("onEditedFile finished");

                setSuccess(true);
                notify("Edited PDF loaded back into Studio.", "success");

                console.log("Compile cleared");
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    notify("Compilation failure occurred.", "error");
                    handleClientError(e);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [compileJobId]);

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-muted">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-12">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <FileEdit size={16} className="text-indigo-500"/>
                                    Precision PDF Layout Editor
                                </h3>
                                <p className="mt-1 text-xs text-muted">
                                    Edit text elements directly on the mapped page canvases.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPages([]);
                                    setPdfDocument(null);
                                    setSourceTracker("");
                                    setUprightTracker("");
                                    setAnalysis(null);
                                    setScannedPages([]);
                                    setSuccess(false);
                                    setError(null);
                                    notify("Workspace reset.", "info");
                                }}
                                className="inline-flex items-center gap-1 rounded-xl border border-border
                                px-3 py-2 text-sm font-medium text-foreground transition hover:bg-background"
                            >
                                <RefreshCw size={13}/> Reset Workspace
                            </button>
                        </div>

                        <div className="mt-2"></div>

                        {(isExtracting ||
                            extractJobId ||
                            (extractJob &&
                                extractJob.status !== "succeeded" &&
                                extractJob.status !== "failed" &&
                                extractJob.status !== "cancelled")) && (
                            <JobProgressCard
                                title="Extracting layout"
                                job={extractJob}
                                active={Boolean(isExtracting || extractJobId)}
                                description="The worker is analyzing the document and building the editable layout map."
                                accent="indigo"
                            />
                        )}

                        {(isCompiling ||
                            compileJobId ||
                            (compileJob &&
                                compileJob.status !== "succeeded" &&
                                compileJob.status !== "failed" &&
                                compileJob.status !== "cancelled")) && (
                            <JobProgressCard
                                title="Compiling edited PDF"
                                job={compileJob}
                                active={Boolean(isCompiling || compileJobId)}
                                description="The worker is rebuilding the PDF and preparing the final download."
                                accent="emerald"
                            />
                        )}

                        {isExtracting && (
                            <div className="flex flex-col items-center justify-center py-20 text-muted">
                                <Loader2 className="mb-4 animate-spin" size={32}/>
                                <p>Deconstructing text lines and tracking alignment grids across all pages...</p>
                            </div>
                        )}

                        {!isExtracting && scannedPages.length > 0 && (
                            <div
                                className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-600 shadow-sm dark:text-rose-300">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="mt-0.5 shrink-0 text-rose-500" size={20}/>
                                    <div>
                                        <h4 className="text-sm font-bold">Scanned / Image-based PDF detected</h4>
                                        <p className="mt-0.5 text-xs opacity-90">
                                            This editor is designed for PDFs with selectable text. Scanned PDFs may not
                                            work as expected here.
                                        </p>
                                        <p className="mt-1 text-[11px] opacity-80">
                                            Problem pages: {scannedPages.join(", ")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isExtracting && isDocumentRotated && (
                            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-500/30
                            bg-amber-500/10 p-4 text-amber-600 shadow-sm dark:text-amber-400 sm:flex-row
                            sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20}/>
                                    <div>
                                        <h4 className="text-sm font-bold">Rotated Document Detected</h4>
                                        <p className="mt-0.5 text-xs opacity-90">
                                            Editing rotated PDFs can lead to alignment offsets. Fix orientation first
                                            for best results.
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    href="/rotate-pdf"
                                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4
                                    py-2 text-xs font-bold text-white shadow-sm transition
                                    hover:bg-amber-600"
                                >
                                    <RotateCw size={14}/> Fix with Rotate Tool
                                </Link>
                            </div>
                        )}

                        {error && (
                            <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-50/50 p-4
                            text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {!isExtracting && pages.length > 0 && pdfDocument && (
                            <div className="space-y-6">
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Pages mapped</p>
                                        <p className="mt-1 text-xl font-bold text-foreground">{pages.length}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Source tracker</p>
                                        <p className="mt-1 truncate text-xs font-mono text-foreground">
                                            {sourceTracker || "-"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">Upright tracker</p>
                                        <p className="mt-1 truncate text-xs font-mono text-foreground">
                                            {uprightTracker || "-"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-4">
                                        <p className="text-sm text-muted">State</p>
                                        <p className="mt-1 text-xl font-bold text-indigo-500">
                                            {success ? "Updated" : "Editing"}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-8 rounded-2xl border border-border bg-(--background)/30
                                p-4 sm:p-6">
                                    {pages.map((page, pageIdx) => (
                                        <div
                                            key={page.page_num}
                                            className="relative mx-auto flex w-full max-w-full shrink-0
                                            flex-col items-center rounded-2xl border border-border bg-white
                                            p-4 shadow-xl"
                                            style={{minHeight: page.height + 100}}
                                        >
                                            <div className="mb-3 flex w-full items-center justify-between">
                                                <span className="rounded-lg border border-border bg-card
                                                px-2 py-1 text-xs font-bold text-foreground">
                                                    Page {page.page_num}
                                                </span>
                                                <span className="text-xs text-muted">
                                                    Edit text directly on the page canvas
                                                </span>
                                            </div>

                                            <div className="relative overflow-hidden rounded border
                                            border-gray-200 shadow-sm">
                                                <canvas
                                                    ref={(node) => {
                                                        if (node) {
                                                            pageCanvasRefs.current.set(page.page_num, node);
                                                        } else {
                                                            pageCanvasRefs.current.delete(page.page_num);
                                                        }
                                                    }}
                                                    className="block"
                                                />

                                                <div className="absolute inset-0 z-10 opacity-100">
                                                    {page.elements.map((element, elementIdx) => {
                                                        const elementBg = element.bg_color || "#ffffff";
                                                        const elementText = element.text_color || "#000000";

                                                        return (
                                                            <input
                                                                key={`${page.page_num}-${elementIdx}`}
                                                                type="text"
                                                                value={element.text}
                                                                onChange={(e) => handleInputChange(pageIdx, elementIdx, e.target.value)}
                                                                className="absolute rounded bg-transparent px-1 text-[10px] outline-none focus:z-20"
                                                                style={{
                                                                    left: `${element.x}px`,
                                                                    top: `${element.y}px`,
                                                                    width: `${element.width + 2}px`,
                                                                    height: `${element.height + 1}px`,
                                                                    fontSize: `${element.size}px`,
                                                                    lineHeight: 1,
                                                                    backgroundColor: elementBg,
                                                                    color: elementText,
                                                                    border: "none",
                                                                    boxShadow: "none",
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCompileSubmit}
                                    disabled={isCompiling || pages.length === 0}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl
                                    bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition
                                    hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isCompiling ? (
                                        <><Loader2 className="animate-spin" size={16}/>
                                            Assembling Layers Across All Pages...
                                        </>
                                    ) : (
                                        <><Download size={16}/>
                                            Export Precision Vector Document Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
