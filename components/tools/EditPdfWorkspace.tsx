"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {AlertTriangle, Download, FileEdit, Loader2, RefreshCw, RotateCw,} from "lucide-react";
import type {PDFDocumentProxy} from "pdfjs-dist";

import {useAuth} from "@/context/AuthContext";
import {useSharedTool} from "@/app/(site)/[toolId]/layout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import JobProgressCard from "@/components/studio/ui/JobProgressCard";
import {
    downloadEditorJob,
    type EditorJobRecord,
    submitEditorCompile,
    submitEditorExtract,
    waitForEditorJob,
} from "@/lib/editorJobs";
import {getBaseUrl} from "@/lib/api";
import {notify} from "@/lib/notify";
import {handleClientError} from "@/lib/errorHandler";
import { loadPdfJs } from "../shared/LoadPdfJs";

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

interface PdfJsPage {
    rotate: number;
    getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number };
    render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
        canvas?: HTMLCanvasElement;
    }) => {
        promise: Promise<void>;
        cancel: () => void;
    };
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface PdfRenderTask {
    promise: Promise<void>;
    cancel: () => void;
}

interface CustomPdfFile extends File {
    originalPassword?: string;
}

function hasScannedLikePages(analysis: PDFAnalysis | null): number[] {
    if (!analysis?.pages?.length) return [];

    return analysis.pages
        .filter((page) => page.kind === "scanned" || page.kind === "blank" || !page.hasSelectableText)
        .map((page) => page.page);
}

function EditPdfWorkspace() {
    const {requireAuth} = useAuth();
    const router = useRouter();
    const {toolId, file, setFile, setDownloadData} = useSharedTool();

    const [pages, setPages] = useState<PageData[]>([]);
    const [sourceTracker, setSourceTracker] = useState<string>("");
    const [uprightTracker, setUprightTracker] = useState<string>("");
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [analysis, setAnalysis] = useState<PDFAnalysis | null>(null);
    const [scannedPages, setScannedPages] = useState<number[]>([]);
    const [isDocumentRotated, setIsDocumentRotated] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [extractJobId, setExtractJobId] = useState<string>("");
    const [compileJobId, setCompileJobId] = useState<string>("");
    const [extractJob, setExtractJob] = useState<EditorJobRecord | null>(null);
    const [compileJob, setCompileJob] = useState<EditorJobRecord | null>(null);

    const compileSourceNameRef = useRef<string>("");

    useEffect(() => {
        if (!file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPages([]);
            setSourceTracker("");
            setUprightTracker("");
            setPdfDocument(null);
            setAnalysis(null);
            setScannedPages([]);
            setIsDocumentRotated(false);
            setIsExtracting(false);
            setIsCompiling(false);
            setSuccess(false);
            setError(null);
            setExtractJobId("");
            setCompileJobId("");
            setExtractJob(null);
            setCompileJob(null);
            localStorage.removeItem("pdfnest:edit:extractJobId");
            localStorage.removeItem("pdfnest:edit:compileJobId");
            return;
        }

        let cancelled = false;

        const queueExtraction = async () => {
            setIsExtracting(true);
            setPages([]);
            setPdfDocument(null);
            setAnalysis(null);
            setScannedPages([]);
            setIsDocumentRotated(false);
            setSuccess(false);
            setError(null);
            setExtractJob(null);

            try {
                const typedFile = file as CustomPdfFile;
                compileSourceNameRef.current = file.name;

                const analysisForm = new FormData();
                analysisForm.append("file", file);
                if (typedFile.originalPassword) {
                    analysisForm.append("file_password", typedFile.originalPassword);
                }

                try {
                    const analysisResponse = await fetch(`${getBaseUrl()}/api/structure/analyze`, {
                        method: "POST",
                        body: analysisForm,
                        credentials: "include",
                    });

                    if (analysisResponse.ok) {
                        const analysisData: PDFAnalysis = await analysisResponse.json();
                        if (!cancelled) {
                            setAnalysis(analysisData);
                            setScannedPages(hasScannedLikePages(analysisData));
                        }
                    }
                } catch (analysisError) {
                    console.error("Structure analysis failed, continuing with extraction job:", analysisError);
                }

                const formData = new FormData();
                formData.append("file", file);
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
                    setError("Failed to queue layout extraction.");
                    notify("Failed to queue layout extraction.", "error");
                    handleClientError(e);
                }
            } finally {
                if (!cancelled) setIsExtracting(false);
            }
        };

        void queueExtraction();

        return () => {
            cancelled = true;
        };
    }, [file]);

    useEffect(() => {
        const saved = localStorage.getItem("pdfnest:edit:extractJobId");
        if (saved && !extractJobId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExtractJobId(saved);
        }
    }, [extractJobId]);

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
                    console.error( new Error(job.error || "Extraction failed"));
                    return
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
                    notify('Extraction was unsuccessful',"error")
                    console.error(new Error("Malformed extraction result."));
                    return
                }

                setPages(result.pages);
                setSourceTracker(result.source_tracker || "");
                setUprightTracker(result.upright_tracker || result.source_tracker || "");

                const pdfjsLib = await loadPdfJs();

                const rawPdfTask = await pdfjsLib
                    .getDocument({data: new Uint8Array(await file!.arrayBuffer())})
                    .promise;

                let foundRotation = false;
                for (let i = 1; i <= rawPdfTask.numPages; i += 1) {
                    const rawPage = await rawPdfTask.getPage(i);
                    if (rawPage.rotate !== 0) {
                        foundRotation = true;
                        break;
                    }
                }

                if (!cancelled) {
                    setIsDocumentRotated(foundRotation);
                }

                let pdfBuffer = await file!.arrayBuffer();
                if (result.upright_tracker) {
                    try {
                        const uprightResponse = await fetch(
                            `${getBaseUrl()}/api/edit/file?path=${encodeURIComponent(result.upright_tracker)}`,
                            {credentials: "include"}
                        );
                        if (uprightResponse.ok) {
                            pdfBuffer = await uprightResponse.arrayBuffer();
                        }
                    } catch {
                        // keep original buffer
                    }
                }

                const pdf = await pdfjsLib.getDocument({data: new Uint8Array(pdfBuffer)}).promise;
                if (!cancelled) {
                    setPdfDocument(pdf);
                }

                if (foundRotation) {
                    notify(
                        "Warning: This PDF contains rotated pages. For best editing results, use our Rotate Tool.",
                        "warning"
                    );
                } else {
                    notify("Document layout mapped successfully.", "success");
                }

                localStorage.removeItem("pdfnest:edit:extractJobId");
                setExtractJobId("");
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setError("Failed to parse structural layout grids.");
                    notify("Failed to parse structural layout grids.", "error");
                    handleClientError(e);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [extractJobId, file]);

    useEffect(() => {
        const saved = localStorage.getItem("pdfnest:edit:compileJobId");
        if (saved && !compileJobId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCompileJobId(saved);
        }
    }, [compileJobId]);

    useEffect(() => {
        if (!compileJobId) return;

        let cancelled = false;

        void (async () => {
            try {
                const job = await waitForEditorJob(compileJobId, (nextJob) => {
                    if (!cancelled) setCompileJob(nextJob);
                });

                if (cancelled) return;

                setCompileJob(job);

                if (job.status === "failed") {
                    console.error( new Error(job.error || "Compilation failed"));
                }

                if (job.status !== "succeeded") return;

                const blob = await downloadEditorJob(compileJobId);
                const sourceName = compileSourceNameRef.current || file?.name || "edited_document.pdf";
                const editedFile = new File([blob], `edited_${sourceName}`, {
                    type: "application/pdf",
                });

                localStorage.removeItem("pdfnest:edit:compileJobId");
                setCompileJobId("");
                setSuccess(true);

                setDownloadData({
                    blob,
                    fileName: editedFile.name,
                });

                notify("Success! Patched PDF document compiled.", "success");
                router.push(`/${toolId}/download`);
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    notify("Compilation failure occurred.", "error");
                    handleClientError(e);
                }
            } finally {
                if (!cancelled) setIsCompiling(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [compileJobId, file, router, setDownloadData, toolId]);

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
        void requireAuth(async () => {
            if (!file || pages.length === 0) return;

            try {
                setIsCompiling(true);
                setSuccess(false);
                setError(null);
                setCompileJob(null);

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
                setIsCompiling(false);
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
                description="Modify text elements inline while preserving original formatting matrix loops perfectly."
            />

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

                    {isExtracting && !extractJobId && (
                        <div
                            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-(--background)/60 py-16 text-zinc-500 shadow-inner">
                            <div className="mb-5 h-14 w-14 animate-pulse rounded-full bg-indigo-500/10"/>
                            <Loader2 className="mb-4 animate-spin" size={32}/>
                            <p className="text-center text-sm">
                                Analyzing the PDF structure and preparing the extraction job...
                            </p>
                            <p className="mt-1 text-center text-xs opacity-70">
                                This also checks for scanned or image-based pages.
                            </p>
                        </div>
                    )}

                    {!isExtracting && scannedPages.length > 0 && (
                        <div
                            className="mb-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-600 shadow-sm dark:text-rose-300">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 shrink-0 text-rose-500" size={20}/>
                                <div className="w-full">
                                    <h4 className="text-sm font-bold">Scanned / Image-based PDF detected</h4>
                                    <p className="mt-0.5 text-xs opacity-90">
                                        This editor is designed for PDFs with selectable text. Scanned PDFs may not work
                                        as expected here.
                                    </p>
                                    <p className="mt-1 text-[11px] opacity-80">
                                        Problem pages: {scannedPages.join(", ")}
                                        {analysis ? ` • Pages analyzed: ${analysis.pageCount}` : ""}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isExtracting && isDocumentRotated && (
                        <div
                            className="mb-2 flex flex-col items-start justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-600 shadow-sm dark:text-amber-400 sm:flex-row sm:items-center">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20}/>
                                <div>
                                    <h4 className="text-sm font-bold">Rotated Document Detected</h4>
                                    <p className="mt-0.5 text-xs opacity-90">
                                        Editing rotated PDFs can lead to alignment offsets. Fix orientation first for
                                        best results.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/rotate-pdf"
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600"
                            >
                                <RotateCw size={14}/> Fix with Rotate Tool
                            </Link>
                        </div>
                    )}

                    {error && (
                        <div
                            className="rounded-2xl border border-red-500/20 bg-red-50/50 p-4 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {!isExtracting && pdfDocument && pages.length > 0 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between border-b pb-4">
                                <h3 className="flex items-center gap-2 font-semibold">
                                    <FileEdit size={18} className="text-indigo-500"/>
                                    Workspace Canvas: {file.name}
                                </h3>
                                <button
                                    onClick={() => {
                                        setFile(null);
                                        setPages([]);
                                        setPdfDocument(null);
                                        setSourceTracker("");
                                        setUprightTracker("");
                                        setAnalysis(null);
                                        setScannedPages([]);
                                        setIsDocumentRotated(false);
                                        setExtractJobId("");
                                        setCompileJobId("");
                                        setExtractJob(null);
                                        setCompileJob(null);
                                        setError(null);
                                        setSuccess(false);
                                        localStorage.removeItem("pdfnest:edit:extractJobId");
                                        localStorage.removeItem("pdfnest:edit:compileJobId");
                                        router.push(`/${toolId}`);
                                    }}
                                    className="flex items-center gap-1 text-sm text-red-500 hover:underline"
                                >
                                    <RefreshCw size={13}/> Reset Workspace
                                </button>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-2xl border border-border p-4">
                                    <p className="text-sm text-muted-foreground">Pages mapped</p>
                                    <p className="mt-1 text-xl font-bold text-foreground">{pages.length}</p>
                                </div>
                                <div className="rounded-2xl border border-border p-4">
                                    <p className="text-sm text-muted-foreground">Source tracker</p>
                                    <p className="mt-1 truncate text-xs font-mono text-foreground">{sourceTracker || "-"}</p>
                                </div>
                                <div className="rounded-2xl border border-border p-4">
                                    <p className="text-sm text-muted-foreground">Upright tracker</p>
                                    <p className="mt-1 truncate text-xs font-mono text-foreground">{uprightTracker || "-"}</p>
                                </div>
                                <div className="rounded-2xl border border-border p-4">
                                    <p className="text-sm text-muted-foreground">State</p>
                                    <p className="mt-1 text-xl font-bold text-indigo-500">{success ? "Updated" : "Editing"}</p>
                                </div>
                            </div>

                            <div
                                className="space-y-8 rounded-2xl border border-border bg-(--background)/30 p-4 sm:p-6">
                                {pages.map((page, pageIdx) => (
                                    <div
                                        key={page.page_num}
                                        className="relative mx-auto flex w-full max-w-full shrink-0 flex-col items-center rounded-2xl border border-border bg-white p-4 shadow-xl"
                                        style={{minHeight: page.height + 100}}
                                    >
                                        <div className="mb-3 flex w-full items-center justify-between">
                                            <span
                                                className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground">
                                                Page {page.page_num}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                Edit text directly on the page canvas
                                            </span>
                                        </div>

                                        <div
                                            className="relative overflow-hidden rounded border border-gray-200 shadow-sm">
                                            <PdfCanvasPage
                                                page={page}
                                                pdfDocument={pdfDocument}
                                                pageIdx={pageIdx}
                                                handleInputChange={handleInputChange}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={handleCompileSubmit}
                                disabled={isCompiling || pages.length === 0}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isCompiling ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16}/>
                                        Assembling layers across all pages...
                                    </>
                                ) : (
                                    <>
                                        <Download size={16}/>
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

export default EditPdfWorkspace

interface PdfCanvasPageProps {
    page: PageData;
    pdfDocument: PDFDocumentProxy;
    pageIdx: number;
    handleInputChange: (pageIdx: number, elementIdx: number, val: string) => void;
}

function PdfCanvasPage({ page, pdfDocument, pageIdx, handleInputChange }: PdfCanvasPageProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        let isMounted = true;
        let renderTask: PdfRenderTask | null = null;

        async function drawPageInstance() {
            if (!pdfDocument || !canvasRef.current) return;

            try {
                const pdfPage = await pdfDocument.getPage(page.page_num);
                if (!isMounted || !canvasRef.current) return;

                const canvas = canvasRef.current;
                const context = canvas.getContext("2d");
                if (!context) return;

                const viewport = pdfPage.getViewport({ scale: 1.0, rotation: 0 });

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                renderTask = pdfPage.render({
                    canvasContext: context,
                    canvas,
                    viewport,
                });

                await renderTask.promise;

                if (isMounted) setIsRendered(true);
            } catch (err: unknown) {
                const errorObj = err as Error;
                if (errorObj?.name !== "RenderingCancelledException") {
                    console.error(`Page ${page.page_num} render thread failed:`, err);
                }
            }
        }

        void drawPageInstance();

        return () => {
            isMounted = false;
            if (renderTask) renderTask.cancel();
        };
    }, [pdfDocument, page.page_num]);

    return (
        <div
            className="relative mx-auto bg-white shadow-xl select-none"
            style={{
                width: `${page.width}px`,
                height: `${page.height}px`,
                marginBottom: "24px",
            }}
        >
            <span className="absolute -left-20 top-2 z-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-bold text-zinc-500 shadow-sm">
                Page {page.page_num}
            </span>

            <canvas ref={canvasRef} className="absolute left-0 top-0 z-0 rounded" />

            <div
                className={`absolute left-0 top-0 z-10 h-full w-full pointer-events-none transition-opacity duration-300 ${
                    isRendered ? "opacity-100" : "opacity-0"
                }`}
            >
                {page.elements.map((element: LayoutElement, elementIdx: number) => {
                    const elementBg = element.bg_color || "#ffffff";
                    const elementText = element.text_color || "#000000";

                    return (
                        <input
                            key={elementIdx}
                            type="text"
                            value={element.text}
                            onChange={(e) => handleInputChange(pageIdx, elementIdx, e.target.value)}
                            className="pointer-events-auto absolute rounded bg-transparent px-1 text-[10px] outline-none focus:z-20"
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
    );
}