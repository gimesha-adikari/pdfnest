"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PlusSquare, Loader2, ShieldCheck, ChevronLeft, ChevronRight, Eye } from "lucide-react";
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

export default function InsertBlankWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [insertAt, setInsertAt] = useState<"start" | "end" | "after">("end");
    const [targetPage, setTargetPage] = useState<number>(1);
    const [numPages, setNumPages] = useState<number>(1);

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

    useEffect(() => {
        if (!file) {
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
                setTargetPage(pdf.numPages); // Defaults insertion position 'after' to final page
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

    const handleInsertProcessing = async () => {
        if (!file) return;

        const validFile = file as CustomPdfFile;

        requireAuth(async () => {
            try {
                setIsProcessing(true);
                setSuccess(false);

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("insertAt", insertAt);
                formData.append("count", String(numPages));
                if (insertAt === "after") {
                    formData.append("targetPage", String(targetPage));
                }

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/insert-blank", formData);

                setDownloadData({
                    blob: responseBlob,
                    fileName: `${validFile.name.replace(/\.pdf$/i, "")}-with-blank.pdf`
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
                title="Insert Blank Pages"
                description="Inject clear template margins or empty sheet spaces seamlessly into any position of your PDF file format layout."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">

                    {/* Controls Sidebar */}
                    <div className="lg:col-span-5 space-y-6">
                        <PdfFileInfo file={file} onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }} />

                        <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <PlusSquare size={16} className="text-indigo-500" />
                                Placement Strategies
                            </h3>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Insert Strategy</label>
                                <select
                                    value={insertAt}
                                    onChange={(e) => setInsertAt(e.target.value as any)}
                                    className="w-full px-4 py-2.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] font-medium outline-none transition focus:border-indigo-500"
                                >
                                    <option value="start">At the absolute beginning</option>
                                    <option value="end">At the absolute end</option>
                                    <option value="after">After a specific sheet page number</option>
                                </select>
                            </div>

                            {insertAt === "after" && (
                                <div className="flex flex-col gap-1.5 animate-fadeIn">
                                    <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Insert After Page Number</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={1}
                                            max={totalPages}
                                            value={targetPage}
                                            onChange={(e) => setTargetPage(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                                            className="w-full px-4 py-2.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] font-medium outline-none transition focus:border-indigo-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setTargetPage(currentPage)}
                                            className="text-xs shrink-0 font-semibold px-3 py-2.5 rounded-xl border border-indigo-500/30 text-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10 transition"
                                        >
                                            Use Current ({currentPage})
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] text-[color:var(--muted)] font-bold uppercase">Number of Blank Sheets to Add</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={numPages}
                                    onChange={(e) => setNumPages(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full px-4 py-2.5 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl text-[color:var(--foreground)] font-medium outline-none transition focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Source asset size</p>
                                <p className="mt-1 text-xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                            </div>
                            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-transparent">
                                <p className="text-sm text-[color:var(--muted)]">Total Pages</p>
                                <p className="mt-1 text-xl font-bold text-indigo-500">{totalPages} Pages</p>
                            </div>
                        </div>

                        <PdfActionButton
                            text="Insert Blank Pages Now"
                            loadingText="Inverting Layout Matrices..."
                            loading={isProcessing}
                            disabled={isProcessing || isRenderingCanvas}
                            onClick={handleInsertProcessing}
                        />
                    </div>

                    {/* Reference Preview Panel */}
                    <div className="lg:col-span-7 flex flex-col bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative w-full">
                        {isRenderingCanvas && (
                            <div className="absolute inset-0 bg-[color:var(--background)]/40 backdrop-blur-sm rounded-2xl z-20 flex flex-col items-center justify-center text-xs font-medium text-[color:var(--muted)]">
                                <Loader2 className="animate-spin text-indigo-500 mb-2" size={24} />
                                Synchronizing structural matrix frames...
                            </div>
                        )}

                        <div className="w-full flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-[color:var(--foreground)] text-sm font-bold mb-4">
                            <span className="flex items-center gap-2"><Eye size={16} className="text-indigo-500" /> Reference Viewer</span>
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

                            {/* "Insert After This Page" Action Anchor Overlay */}
                            <button
                                type="button"
                                onClick={() => {
                                    setInsertAt("after");
                                    setTargetPage(currentPage);
                                }}
                                className="absolute bottom-4 bg-slate-900/90 text-white font-medium text-xs px-3 py-1.5 rounded-xl shadow-md opacity-0 group-hover:opacity-100 backdrop-blur-sm hover:bg-indigo-600 transition duration-200"
                            >
                                Insert blank page after page {currentPage}
                            </button>
                        </div>

                        {success && (
                            <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                <div className="text-xs">
                                    <p className="font-semibold">Blank spaces mapped successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The layout matrices structural vectors have processed correctly.
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