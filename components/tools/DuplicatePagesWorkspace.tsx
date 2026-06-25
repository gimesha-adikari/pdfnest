"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2, ShieldCheck, ChevronLeft, ChevronRight, Eye, AlertCircle, Sparkles } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/[toolId]/layout";
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

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function DuplicatePagesWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [pageSelection, setPageSelection] = useState<string>("1");
    const [numCopies, setNumCopies] = useState<number>(1);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const validationError = useMemo(() => {
        if (!pageSelection.trim() || totalPages === 0) return null;

        const segments = pageSelection.split(",");
        for (const segment of segments) {
            const clean = segment.trim();
            if (!clean) continue;

            if (clean.includes("-")) {
                const range = clean.split("-");
                const start = parseInt(range[0]);
                const end = parseInt(range[1]);
                if (isNaN(start) || isNaN(end) || start > totalPages || end > totalPages || start < 1 || end < 1) {
                    return `Range "${clean}" falls outside available document boundaries (Pages 1-${totalPages})`;
                }
            } else {
                const pageNum = parseInt(clean);
                if (isNaN(pageNum) || pageNum > totalPages || pageNum < 1) {
                    return `Page index "${clean}" is invalid or exceeds document limit (${totalPages})`;
                }
            }
        }
        return null;
    }, [pageSelection, totalPages]);

    useEffect(() => {
        if (!file) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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

                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }

                const page = await pdfDocument.getPage(currentPage);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const viewport = page.getViewport({ scale: 1.2 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const renderTask = page.render({
                    canvasContext: ctx,
                    viewport: viewport
                });
                renderTaskRef.current = renderTask;

                await renderTask.promise;
                renderTaskRef.current = null;
            } catch (err: unknown) {
                const errorObj = err as Error;
                if (errorObj?.name !== "RenderingCancelledException") {
                    console.error("Canvas raster generation skipped:", err);
                }
            } finally {
                setIsRenderingCanvas(false);
            }
        };

        renderPage();

        return () => {
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, currentPage]);

    const applyPreset = (type: "current" | "all" | "even" | "odd") => {
        if (totalPages === 0) return;
        if (type === "current") setPageSelection(String(currentPage));
        if (type === "all") setPageSelection(`1-${totalPages}`);
        if (type === "even") {
            const evens = [];
            for (let i = 2; i <= totalPages; i += 2) evens.push(i);
            setPageSelection(evens.join(", ") || "2");
        }
        if (type === "odd") {
            const odds = [];
            for (let i = 1; i <= totalPages; i += 2) odds.push(i);
            setPageSelection(odds.join(", ") || "1");
        }
    };

    const handleDuplicateProcessing = async () => {
        if (!file) return;
        if (!pageSelection.trim()) {
            notify("Please provide the page number(s) you wish to duplicate.");
            return;
        }
        if (validationError) {
            notify(validationError);
            return;
        }

        const validFile = file as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("pages", pageSelection.trim());
                formData.append("copies", String(numCopies));

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/duplicate", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-duplicated.pdf`
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

    return (
        <>
            <PdfToolHero
                title="Duplicate PDF Pages"
                description="Clone specific pages or custom range layouts multiple times within your document sequence instantly."
            />

            <div className="mt-12 rounded-3xl border border-border bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">

                    {/* Controls Sidebar */}
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo file={file} onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }} />

                        <div className="rounded-2xl border border-border p-5 bg-[color:var(--background)]/50 space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <CopyPlus size={16} className="text-indigo-500" />
                                Duplication Configurations
                            </h3>

                            {/* Preset Selection Buttons Wrapper */}
                            <div className="flex flex-wrap gap-1.5 pb-1">
                                <button type="button" onClick={() => applyPreset("current")} className="text-[10px] px-2.5 py-1 font-bold rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 hover:bg-indigo-500/20 transition flex items-center gap-1">
                                    <Sparkles size={10} /> Current Page
                                </button>
                                <button type="button" onClick={() => applyPreset("all")} className="text-[10px] px-2.5 py-1 font-semibold rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] hover:bg-[color:var(--background)] transition">
                                    All Pages
                                </button>
                                <button type="button" onClick={() => applyPreset("even")} className="text-[10px] px-2.5 py-1 font-semibold rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] hover:bg-[color:var(--background)] transition">
                                    Evens
                                </button>
                                <button type="button" onClick={() => applyPreset("odd")} className="text-[10px] px-2.5 py-1 font-semibold rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] hover:bg-[color:var(--background)] transition">
                                    Odds
                                </button>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] text-muted font-bold uppercase">
                                    Target Page Numbers
                                </label>
                                <input
                                    type="text"
                                    value={pageSelection}
                                    onChange={(e) => setPageSelection(e.target.value)}
                                    placeholder="e.g. 1, 3, 5-7"
                                    className={`w-full px-4 py-2.5 text-sm border bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium transition focus:border-indigo-500 ${validationError ? 'border-red-500/50' : 'border-[color:var(--border)]'}`}
                                />

                                {validationError ? (
                                    <span className="text-[10px] text-red-500 font-medium flex items-center gap-1 mt-0.5 animate-pulse">
                                        <AlertCircle size={12} /> {validationError}
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-[color:var(--muted)]">
                                        Specify discrete numbers or intervals using commas or hyphens.
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">
                                    Number of Clones / Copies per Page
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={numCopies}
                                    onChange={(e) => setNumCopies(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full px-4 py-2.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] outline-none font-medium transition focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Document size</p>
                                <p className="mt-1 text-xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                            </div>
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Total Sheets</p>
                                <p className="mt-1 text-xl font-bold text-indigo-500">{totalPages} Pages</p>
                            </div>
                        </div>

                        <PdfActionButton
                            text="Duplicate Pages Now"
                            loadingText="Cloning Target Elements..."
                            loading={isProcessing}
                            disabled={isProcessing || isRenderingCanvas || !!validationError}
                            onClick={handleDuplicateProcessing}
                        />
                    </div>

                    {/* Simulator Preview Area */}
                    <div className="lg:col-span-7 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative w-full">
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                                Rendering Document Preview Matrix...
                            </div>
                        )}

                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                            <span className="flex items-center gap-2"><Eye size={16} className="text-indigo-500" /> Document Reference Viewport</span>
                            {totalPages > 0 && (
                                <div className="flex items-center gap-2 border border-[color:var(--border)] px-2 py-0.5 rounded-lg bg-[var(--card)] text-xs text-[color:var(--muted)] font-mono select-none">
                                    <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"><ChevronLeft size={14} /></button>
                                    <span>Page {currentPage} of {totalPages}</span>
                                    <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="hover:text-[color:var(--foreground)] disabled:opacity-20 transition"><ChevronRight size={14} /></button>
                                </div>
                            )}
                        </div>

                        <div className="w-full flex flex-col items-center justify-center bg-gray-500/5 dark:bg-black/20 rounded-xl border border-[color:var(--border)] p-4 relative overflow-hidden min-h-[420px] group">
                            <div className="relative shadow-xl rounded border border-gray-400/20 bg-white max-w-full h-auto">
                                <canvas ref={canvasRef} className="max-w-full h-auto block rounded" />
                            </div>

                            {/* "Use This Page" Overlay Helper */}
                            <button
                                type="button"
                                onClick={() => setPageSelection(String(currentPage))}
                                className="absolute bottom-4 bg-slate-900/90 text-white font-medium text-xs px-3 py-1.5 rounded-xl shadow-md opacity-0 group-hover:opacity-100 backdrop-blur-sm hover:bg-indigo-600 transition duration-200"
                            >
                                Duplicate This Page ({currentPage})
                            </button>
                        </div>

                        {success && (
                            <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Duplication successful!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The document matrix copies were added successfully.
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