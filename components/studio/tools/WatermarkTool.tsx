"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Type,
    ShieldCheck,
    Loader2,
    FileText,
    Move,
    RotateCw,
    Sparkles,
    Image as ImageIcon,
    Trash2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { uploadAndDownloadFile } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";

type CustomPdfFile = File & {
    originalPassword?: string;
};

interface PdfJsRenderTask {
    cancel: () => void;
    promise: Promise<void>;
}

interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
    }) => PdfJsRenderTask;
}

interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface WatermarkStudioToolProps {
    baseFile: File | null;
    currentPageIndex: number;
    totalPages: number;
    onWatermarkedFile: (file: File) => Promise<void>;
}

const STYLISTIC_FONTS = [
    { id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold" },
    { id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium" },
    { id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal" },
];

export default function WatermarkStudioTool({
                                                baseFile,
                                                currentPageIndex,
                                                totalPages,
                                                onWatermarkedFile,
                                            }: WatermarkStudioToolProps) {
    const { requireAuth } = useAuth();

    const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");
    const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
    const [fontFamily, setFontFamily] = useState<string>("Helvetica");

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>("");

    const [fontSize, setFontSize] = useState<number>(48);
    const [rotation, setRotation] = useState<number>(45);
    const [position, setPosition] = useState<string>("cc");
    const [opacity, setOpacity] = useState<number>(0.3);

    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);

    const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
    const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const renderTaskRef = useRef<PdfJsRenderTask | null>(null);

    const fileExtractedSize = useMemo(() => {
        if (!baseFile) return "0.00";
        return (baseFile.size / 1024 / 1024).toFixed(2);
    }, [baseFile]);

    const fontStyleClass = useMemo(() => {
        const found = STYLISTIC_FONTS.find((font) => font.id === fontFamily);
        return found ? found.cssClass : "font-sans font-bold";
    }, [fontFamily]);

    const previewPageNumber = useMemo(() => {
        return Number.isFinite(currentPageIndex) ? currentPageIndex + 1 : 1;
    }, [currentPageIndex]);

    useEffect(() => {
        return () => {
            if (imagePreview) URL.revokeObjectURL(imagePreview);
        };
    }, [imagePreview]);

    useEffect(() => {
        if (!baseFile) {
            setPdfDocument(null);
            setSuccess(false);
            setIsProcessing(false);
            return;
        }

        let cancelled = false;

        const loadPdf = async () => {
            try {
                setIsRenderingCanvas(true);

                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await baseFile.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;

                if (cancelled) return;

                setPdfDocument(pdf as unknown as PdfJsDocument);
            } catch (err) {
                console.error("Failed to parse visual document framework:", err);
                notify("Could not load document preview.");
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

                const viewport = page.getViewport({ scale: 1.2 });
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

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            setImageFile(selected);
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            setImagePreview(URL.createObjectURL(selected));
            setSuccess(false);
        }
    };

    const handleWatermarkProcessing = () => {
        requireAuth(async () => {
            if (!baseFile) return;
            if (watermarkType === "text" && !watermarkText.trim()) return;
            if (watermarkType === "image" && !imageFile) return;

            const validFile = baseFile as CustomPdfFile;

            try {
                setIsProcessing(true);
                setSuccess(false);

                let backendPosition = position;
                if (position === "cc") backendPosition = "c";
                else if (position === "cl") backendPosition = "l";
                else if (position === "cr") backendPosition = "r";

                const normalizedScale = watermarkType === "image"
                    ? (fontSize / 600).toFixed(2)
                    : (fontSize / 50).toFixed(2);

                const description = `font:${fontFamily}, pos:${backendPosition}, scale:${normalizedScale}, rot:${-rotation}, op:${opacity}`;

                const formData = new FormData();
                formData.append("file", validFile);
                formData.append("description", description);

                if (watermarkType === "text") {
                    formData.append("text", watermarkText.trim());
                } else if (watermarkType === "image" && imageFile) {
                    formData.append("watermarkImage", imageFile);
                }

                if (validFile.originalPassword) {
                    formData.append("file_password", validFile.originalPassword);
                }

                const responseBlob = await uploadAndDownloadFile("/api/structure/watermark", formData);

                const outputFile = new File(
                    [responseBlob],
                    `${validFile.name.replace(/\.pdf$/i, "")}-marked.pdf`,
                    { type: "application/pdf" }
                );

                await onWatermarkedFile(outputFile);
                setSuccess(true);
                notify("Watermark loaded into Studio.");
            } catch (err) {
                console.error(err);
                notify(getFriendlyErrorMessage(err));
            } finally {
                setIsProcessing(false);
            }
        });
    };

    if (!baseFile) {
        return (
            <div className="flex h-full w-full items-center justify-center p-8 text-[color:var(--muted)]">
                <p>Select or upload a document in Studio first.</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden p-4 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col lg:col-span-5">
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-6 space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                            <Sparkles size={16} className="text-indigo-500" />
                            Watermark Settings
                        </h3>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                <Sparkles size={12} /> Watermark Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/50 p-1">
                                <button
                                    type="button"
                                    onClick={() => setWatermarkType("text")}
                                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${watermarkType === "text" ? "border border-[color:var(--border)] bg-[var(--card)] text-indigo-500 shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                >
                                    <Type size={14} /> Text Stamp
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setWatermarkType("image")}
                                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition ${watermarkType === "image" ? "border border-[color:var(--border)] bg-[var(--card)] text-indigo-500 shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                >
                                    <ImageIcon size={14} /> Image Logo
                                </button>
                            </div>
                        </div>

                        {watermarkType === "text" && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                        <FileText size={12} /> Stamp Text
                                    </label>
                                    <input
                                        type="text"
                                        value={watermarkText}
                                        onChange={(e) => {
                                            setWatermarkText(e.target.value);
                                            setSuccess(false);
                                        }}
                                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                        placeholder="e.g. CONFIDENTIAL"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        Font Family
                                    </label>
                                    <select
                                        value={fontFamily}
                                        onChange={(e) => {
                                            setFontFamily(e.target.value);
                                            setSuccess(false);
                                        }}
                                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[color:var(--foreground)] outline-none transition focus:border-indigo-500"
                                    >
                                        {STYLISTIC_FONTS.map((font) => (
                                            <option key={font.id} value={font.id}>
                                                {font.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {watermarkType === "image" && (
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                    <ImageIcon size={12} /> Watermark Image
                                </label>
                                {!imageFile ? (
                                    <div className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--background)]/30 p-6 text-center transition hover:border-indigo-500">
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/jpg"
                                            onChange={handleImageChange}
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                        />
                                        <ImageIcon size={24} className="mb-2 text-[color:var(--muted)]" />
                                        <p className="text-xs font-bold text-[color:var(--foreground)]">Select Watermark Image</p>
                                        <p className="mt-0.5 text-[10px] text-[color:var(--muted)]">Supports transparent PNG and JPG</p>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/50 p-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <img
                                                src={imagePreview}
                                                className="h-10 w-10 rounded bg-[color:var(--border)]/20 p-0.5 object-contain"
                                                alt="preview"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate font-mono text-xs font-bold text-[color:var(--foreground)]">{imageFile.name}</p>
                                                <p className="text-[10px] text-[color:var(--muted)]">{(imageFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImageFile(null);
                                                setImagePreview("");
                                            }}
                                            className="shrink-0 rounded-lg p-1.5 text-red-500 transition hover:bg-red-500/10"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-4 border-t border-[color:var(--border)] pt-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                    <span>Scale</span>
                                    <span className="font-mono text-indigo-500">{fontSize}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="300"
                                    value={fontSize}
                                    onChange={(e) => setFontSize(Number(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                    <span className="flex items-center gap-1"><RotateCw size={12} /> Rotation</span>
                                    <span className="font-mono text-indigo-500">{rotation}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={rotation}
                                    onChange={(e) => setRotation(Number(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                    <span>Opacity</span>
                                    <span className="font-mono text-indigo-500">{Math.round(opacity * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="1.0"
                                    step="0.05"
                                    value={opacity}
                                    onChange={(e) => setOpacity(Number(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1.5">
                                <Move size={12} /> Position
                            </label>
                            <div className="grid max-w-[240px] grid-cols-3 gap-1.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)]/50 p-1.5">
                                {["tl", "tc", "tr", "cl", "cc", "cr", "bl", "bc", "br"].map((pos) => (
                                    <button
                                        key={pos}
                                        type="button"
                                        onClick={() => setPosition(pos)}
                                        className={`rounded-md border py-1.5 text-center text-[10px] font-bold uppercase transition ${position === pos ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col lg:col-span-7">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/30 p-4">
                    <div className="mb-4 flex items-center justify-between border-b border-[color:var(--border)] pb-3 text-sm font-bold text-[color:var(--foreground)]">
                        <span className="flex items-center gap-2">
                            <Move size={16} className="text-indigo-500" /> Watermark Preview
                        </span>
                        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-xs text-[color:var(--muted)] select-none">
                            <span>
                                Page {previewPageNumber} of {totalPages}
                            </span>
                        </div>
                    </div>

                    {(isRenderingCanvas || !pdfDocument) && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-[color:var(--background)]/40 text-xs font-medium text-[color:var(--muted)] backdrop-blur-sm">
                            <Loader2 className="mb-2 animate-spin text-indigo-500" size={24} />
                            Rendering preview...
                        </div>
                    )}

                    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border)] bg-gray-500/5 p-4 dark:bg-black/20">
                        <div className="relative max-h-full max-w-full rounded border border-gray-400/20 bg-white shadow-xl">
                            <canvas ref={canvasRef} className="block max-h-[52vh] max-w-full rounded object-contain" />

                            <div
                                style={{
                                    position: "absolute",
                                    top: position.startsWith("t") ? "1rem" : position.startsWith("b") ? "auto" : "50%",
                                    bottom: position.startsWith("b") ? "1rem" : "auto",
                                    left: position.endsWith("l") ? "1rem" : position.endsWith("r") ? "auto" : "50%",
                                    right: position.endsWith("r") ? "1rem" : "auto",
                                    transform: `translate(${position.endsWith("l") || position.endsWith("r") ? "0%" : "-50%"}, ${position.startsWith("t") || position.startsWith("b") ? "0%" : "-50%"}) rotate(${rotation}deg)`,
                                    opacity,
                                    fontSize: `${Math.max(10, fontSize * 0.4)}px`,
                                    width: watermarkType === "image" ? `${fontSize * 1.5}px` : "auto",
                                }}
                                className="pointer-events-none z-10 flex select-none items-center justify-center text-center transition-all duration-75"
                            >
                                {watermarkType === "text" ? (
                                    <span className={`whitespace-nowrap font-black text-red-500 ${fontStyleClass}`}>
                                        {watermarkText || "STAMP"}
                                    </span>
                                ) : imagePreview ? (
                                    <img
                                        src={imagePreview}
                                        className="h-auto w-full select-none object-contain"
                                        alt="watermark preview layer"
                                    />
                                ) : (
                                    <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-500">
                                        IMAGE NOT ATTACHED
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {success && (
                        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={16} />
                            <div className="text-xs">
                                <p className="font-semibold">Watermark compiled successfully!</p>
                                <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">
                                    The updated document has been loaded back into Studio.
                                </p>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleWatermarkProcessing}
                        disabled={isProcessing || (watermarkType === "text" && !watermarkText.trim()) || (watermarkType === "image" && !imageFile)}
                        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Move size={16} />}
                        Apply Watermark
                    </button>
                </div>
            </div>
        </div>
    );
}
