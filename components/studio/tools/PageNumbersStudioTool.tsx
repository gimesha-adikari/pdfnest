"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Loader2, FileText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import { handleClientError} from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

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

interface PageNumbersStudioToolProps {
    baseFile: File | null;
    currentPageIndex: number;
    totalPages: number;
    onPageNumberedFile: (file: File) => Promise<void>;
}

const STYLISTIC_FONTS = [
    { id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold" },
    { id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium" },
    { id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal" },
];

export default function PageNumbersStudioTool({
                                                  baseFile,
                                                  currentPageIndex,
                                                  totalPages,
                                                  onPageNumberedFile,
                                              }: PageNumbersStudioToolProps) {
    const { requireAuth } = useAuth();

    const [fontFamily, setFontFamily] = useState<string>("Helvetica");
    const [fontSize, setFontSize] = useState<number>(12);
    const [position, setPosition] = useState<string>("bc");

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);

    const fileSizeMB = useMemo(() => {
        if (!baseFile) return "0.00";
        return (baseFile.size / 1024 / 1024).toFixed(2);
    }, [baseFile]);

    const previewPageNumber = useMemo(() => {
        return Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1;
    }, [currentPageIndex]);

    useEffect(() => {
        if (!baseFile) {
            setPdfDocument(null);
            setSuccess(false);
            setIsProcessing(false);
            setError(null);
            return;
        }

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);
                setError(null);

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await baseFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

                if (cancelled) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
            } catch (err) {
                console.error("Failed to parse page numbers preview:", err);
                if (!cancelled) {
                    setError("Could not load document preview.");
                }
            } finally {
                if (!cancelled) {
                    setIsRenderingCanvas(false);
                }
            }
        };

        void loadPdf();

        return () => {
            cancelled = true;
        };
    }, [baseFile]);

    useEffect(() => {
        if (!pdfDocument || !canvasRef.current) return;
        if (previewPageNumber < 1 || previewPageNumber > totalPages) return;

        let cancelled = false;

        const renderPage = async () => {
            try {
                setIsRenderingCanvas(true);

                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                }

                const page = await pdfDocument.getPage(previewPageNumber);
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const viewport = page.getViewport({ scale: 0.4 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const renderTask = page.render({
                    canvasContext: ctx,
                    viewport,
                } as any);

                renderTaskRef.current = renderTask;
                await renderTask.promise;
                renderTaskRef.current = null;
            } catch (err: unknown) {
                const errorObj = err as Error;
                if (errorObj?.name !== "RenderingCancelledException") {
                    console.error("Canvas raster generation skipped:", err);
                }
            } finally {
                if (!cancelled) {
                    setIsRenderingCanvas(false);
                }
            }
        };

        void renderPage();

        return () => {
            cancelled = true;
            if (renderTaskRef.current) renderTaskRef.current.cancel();
        };
    }, [pdfDocument, previewPageNumber, totalPages]);

    useEffect(() => {
        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
        };
    }, []);

    const handleNumberingProcessing = () => {
        requireAuth(async () => {
            if (!baseFile) return;

            try {
                setIsProcessing(true);
                setSuccess(false);
                setError(null);

                const formData = new FormData();
                formData.append("file", baseFile);

                const normalizedScale = (fontSize / 25).toFixed(2);
                const formatDescription = `font:${fontFamily}, scale:${normalizedScale} abs, pos:${position}, rot:0`;
                formData.append("description", formatDescription);

                const typedFile = baseFile as File & { originalPassword?: string };
                if (typedFile.originalPassword) {
                    formData.append("file_password", typedFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/add-page-numbers", formData);

                const outputFile = new File(
                    [responseBlob],
                    `numbered_${baseFile.name.replace(/\.pdf$/i, "")}.pdf`,
                    { type: "application/pdf" }
                );

                await onPageNumberedFile(outputFile);
                setSuccess(true);
                notify("Page numbers loaded into Studio.", "success");
            } catch (err) {
                console.error(err);
                handleClientError(err);
            } finally {
                setIsProcessing(false);
            }
        });
    };

    const fontStyleClass = useMemo(() => {
        const selected = STYLISTIC_FONTS.find(
            (font) => font.id === fontFamily
        );

        return selected?.cssClass ?? "font-sans font-bold";
    }, [fontFamily]);

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-muted">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Hash size={16} className="text-blue-500" />
                            Page Number Settings
                        </h3>

                        <div className="space-y-3">
                            <p className="text-xs text-muted">
                                Choose a typeface, scale, and placement for the page numbers.
                            </p>

                            <div className="space-y-2">
                                {STYLISTIC_FONTS.map((font) => (
                                    <button
                                        key={font.id}
                                        type="button"
                                        onClick={() => setFontFamily(font.id)}
                                        className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                                            fontFamily === font.id
                                                ? "border-blue-500 bg-blue-500/5 text-blue-600 dark:bg-blue-500/10"
                                                : "border-border bg-(--background)/50 text-foreground hover:bg-background"
                                        }`}
                                    >
                                        <span className={font.cssClass}>{font.name}</span>
                                        {fontFamily === font.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-muted">Font Scale (Points)</label>
                                <input
                                    type="number"
                                    min={6}
                                    max={72}
                                    value={fontSize}
                                    onChange={(e) => setFontSize(Number(e.target.value))}
                                    className="mt-2 w-full rounded-xl border border-border bg-transparent px-4
                                    py-3 text-sm text-foreground outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted">Vector Coordinates</label>
                                <select
                                    value={position}
                                    onChange={(e) => setPosition(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm
                                    text-foreground outline-none focus:border-blue-500"
                                >
                                    <option value="bc">Bottom Center (Standard)</option>
                                    <option value="bl">Bottom Left</option>
                                    <option value="br">Bottom Right</option>
                                    <option value="tc">Top Center</option>
                                    <option value="tl">Top Left</option>
                                    <option value="tr">Top Right</option>
                                </select>
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-500/20 bg-red-50/50 p-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                                <FileText size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                                <div className="text-xs">
                                    <p className="font-semibold">Page numbers compiled successfully!</p>
                                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                        The updated document has been loaded back into Studio.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleNumberingProcessing}
                            disabled={isProcessing || isRenderingCanvas}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Hash size={16} />}
                            Insert Sequence Tracking
                        </button>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border p-4">
                                <p className="text-sm text-muted">Current page</p>
                                <p className="mt-1 text-xl font-bold text-foreground">{previewPageNumber}</p>
                            </div>
                            <div className="rounded-2xl border border-border p-4">
                                <p className="text-sm text-muted">Document size</p>
                                <p className="mt-1 text-xl font-bold text-foreground">{fileSizeMB} MB</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border
                border-border bg-(--background)/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-border pb-3 text-sm font-bold
                     text-foreground">
                        <span className="flex items-center gap-2">
                            <FileText size={16} className="text-blue-500" />
                            Page Number Preview
                        </span>
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-0.5
                        font-mono text-xs text-muted select-none">
                            <span>
                                Page {previewPageNumber} of {totalPages}
                            </span>
                        </div>
                    </div>

                    {(isRenderingCanvas || !pdfDocument) && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl
                        bg-(--background)/40 text-xs font-medium text-muted backdrop-blur-sm">
                            <Loader2 className="mb-2 animate-spin text-blue-500" size={24} />
                            Rendering preview...
                        </div>
                    )}

                    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl border
                    border-border bg-gray-500/5 p-4 dark:bg-black/20">
                        <div className="relative max-h-full max-w-full rounded border border-gray-400/20 bg-white
                        shadow-xl">
                            <canvas ref={canvasRef} className="block max-h-[52vh] max-w-full rounded object-contain" />

                            <div
                                style={{
                                    position: "absolute",
                                    top: position.startsWith("t") ? "1rem" : position.startsWith("b") ? "auto" : "50%",
                                    bottom: position.startsWith("b") ? "1rem" : "auto",
                                    left: position.endsWith("l") ? "1rem" : position.endsWith("r") ? "auto" : "50%",
                                    right: position.endsWith("r") ? "1rem" : "auto",
                                    transform: `translate(${position.endsWith("l") || position.endsWith("r") ? "0%" : "-50%"}, ${position.startsWith("t") || position.startsWith("b") ? "0%" : "-50%"})`,
                                    opacity: 0.95,
                                    fontSize: `${Math.max(10, fontSize * 0.4)}px`,
                                }}
                                className="pointer-events-none z-10 flex select-none items-center justify-center text-center"
                            >
                                <span className={`whitespace-nowrap text-blue-600 ${fontStyleClass}`}>
                                    {previewPageNumber}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
