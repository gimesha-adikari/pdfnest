"use client";

import { useMemo, useState, useEffect } from "react";
import { Hash, ShieldCheck, Loader2, FileText, Move, Languages } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

const STYLISTIC_FONTS = [
    { id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold" },
    { id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium" },
    { id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal" }
];

export default function PageNumbersPage() {
    const [file, setFile] = useState<File | null>(null);
    const [fontFamily, setFontFamily] = useState<string>("Helvetica");
    const [fontSize, setFontSize] = useState<number>(12);
    const [position, setPosition] = useState<string>("bc"); // default Bottom-Center

    const [thumbnailSrc, setThumbnailSrc] = useState<string>("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isReadingTotal, setIsReadingTotal] = useState(false);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        return () => {
            setThumbnailSrc("");
        };
    }, [file]);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const uploadedFile = acceptedFiles[0];

        setFile(uploadedFile);
        setSuccess(false);
        setThumbnailSrc("");
        setIsReadingTotal(true);

        try {
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

            const arrayBuffer = await uploadedFile.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);

            const loadingTask = pdfjsLib.getDocument({ data: typedArray });
            const pdf = await loadingTask.promise;
            setIsReadingTotal(false);

            setIsGeneratingPreview(true);
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.6 });

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");

            if (ctx) {
                const renderTask = page.render({ canvasContext: ctx, viewport });
                await renderTask.promise;

                setThumbnailSrc(canvas.toDataURL("image/jpeg", 0.8));

                canvas.width = 0;
                canvas.height = 0;
            }

            await loadingTask.destroy();
        } catch (error) {
            console.error(error);
            alert("Could not load viewport layout structures for page generation modeling.");
            setThumbnailSrc("");
        } finally {
            setIsReadingTotal(false);
            setIsGeneratingPreview(false);
        }
    };

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const activeFontMetadata = useMemo(() => {
        return STYLISTIC_FONTS.find(f => f.id === fontFamily) || STYLISTIC_FONTS[0];
    }, [fontFamily]);

    const overlayAlignmentStyles = useMemo(() => {
        switch (position) {
            case "tl": return "top-4 left-4 justify-start items-start";
            case "tc": return "top-4 left-1/2 -translate-x-1/2 justify-center items-start";
            case "tr": return "top-4 right-4 justify-end items-start";
            case "bl": return "bottom-4 left-4 justify-start items-end";
            case "bc": return "bottom-4 left-1/2 -translate-x-1/2 justify-center items-end";
            case "br": return "bottom-4 right-4 justify-end items-end";
            default:   return "bottom-4 left-1/2 -translate-x-1/2 justify-center items-end";
        }
    }, [position]);

    const handleNumberingProcessing = async () => {
        if (!file) return;

        try {
            setIsProcessing(true);
            setSuccess(false);

            const normalizedScale = (fontSize / 500).toFixed(2);
            const description = `font:${fontFamily}, pos:${position}, scale:${normalizedScale}, rot:0`;

            const formData = new FormData();
            formData.append("file", file);
            formData.append("description", description);

            await uploadAndDownloadFile("/structure/add-page-numbers", formData, `${file.name.replace(/\.pdf$/i, "")}-numbered.pdf`);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : "Page stamp configuration runtime failure.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Number PDF Pages"
                description="Stamp consecutive page numerical headers and footers structurally on native document vector grids."
            />

            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg">
                <PdfUploader
                    onFilesAccepted={onDrop}
                    title="Upload PDF Document"
                    description="Drop file here to initialize the viewport sequence layout matrix"
                />

                {file && (
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-5 space-y-6">
                            <PdfFileInfo file={file} />

                            <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                                <h3 className="text-md font-bold flex items-center gap-2 border-b border-[color:var(--border)] pb-2 text-[color:var(--foreground)]">
                                    <Hash size={16} className="text-indigo-500" /> Typography Settings
                                </h3>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-1">
                                        <Languages size={12} /> Numbering Font Style
                                    </label>
                                    <select
                                        value={fontFamily}
                                        onChange={(e) => setFontFamily(e.target.value)}
                                        className="w-full px-3 py-2 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm outline-none focus:border-indigo-500 font-medium transition text-[color:var(--foreground)] cursor-pointer"
                                    >
                                        {STYLISTIC_FONTS.map((font) => (
                                            <option key={font.id} value={font.id}>
                                                {font.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                        <span>Label Sizing</span>
                                        <span className="text-indigo-500 font-mono text-xs">{fontSize}pt</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={8}
                                        max={28}
                                        value={fontSize}
                                        onChange={(e) => setFontSize(Number(e.target.value))}
                                        className="w-full accent-indigo-500 h-1 bg-[color:var(--border)] rounded-lg cursor-pointer"
                                    />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[color:var(--border)] p-5 bg-[color:var(--background)]/50 space-y-4">
                                <h3 className="text-md font-bold flex items-center gap-2 border-b border-[color:var(--border)] pb-2 text-[color:var(--foreground)]">
                                    <Move size={16} className="text-indigo-500" /> Page Alignment
                                </h3>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Grid Attachment Location</label>
                                    <div className="grid grid-cols-3 gap-1.5 max-w-[180px]">
                                        {[
                                            { id: "tl", label: "↖" }, { id: "tc", label: "↑" }, { id: "tr", label: "↗" },
                                            { id: "bl", label: "↙" }, { id: "bc", label: "↓" }, { id: "br", label: "↘" }
                                        ].map((btn) => (
                                            <button
                                                key={btn.id}
                                                onClick={() => setPosition(btn.id)}
                                                className={`py-1.5 text-center text-sm font-bold border rounded-lg transition-all ${position === btn.id ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'border-[color:var(--border)] bg-[var(--card)] text-[color:var(--muted)] hover:border-[color:var(--muted)]'}`}
                                            >
                                                {btn.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-7 flex flex-col items-center justify-start bg-[color:var(--background)]/30 border border-[color:var(--border)] rounded-2xl p-6 relative min-h-[400px]">
                            <div className="w-full flex items-center justify-between mb-4 border-b border-[color:var(--border)] pb-2 text-[color:var(--muted)] text-xs font-semibold">
                                <span className="flex items-center gap-1.5">Interactive Document Preview Frame</span>
                                <span>Page 1 Simulation</span>
                            </div>

                            {isReadingTotal || isGeneratingPreview ? (
                                <div className="flex flex-col items-center justify-center flex-1 py-20 text-[color:var(--muted)]">
                                    <Loader2 className="animate-spin mb-3 text-indigo-500" size={28} />
                                    <p className="text-sm">Assembling digital mockups...</p>
                                </div>
                            ) : (
                                <div className="relative border shadow-xl bg-white max-w-full rounded-md overflow-hidden aspect-[1/1.414] max-h-[480px]">
                                    {thumbnailSrc ? (
                                        <img src={thumbnailSrc} alt="Preview Context" className="w-full h-full object-contain pointer-events-none select-none" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-20 text-[color:var(--muted)] opacity-40">
                                            <FileText size={48} className="mb-2" />
                                        </div>
                                    )}

                                    {thumbnailSrc && (
                                        <div className={`absolute inset-0 p-5 flex pointer-events-none select-none z-20 ${overlayAlignmentStyles}`}>
                                            <div
                                                style={{
                                                    fontSize: `${fontSize}px`,
                                                }}
                                                className={`text-slate-500 font-sans tracking-wide transition-all ${activeFontMetadata.cssClass}`}
                                            >
                                                1
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {success && (
                                <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16} />
                                    <div className="text-xs">
                                        <p className="font-semibold">Page indexing compiled successfully!</p>
                                        <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">The sequential background indices have been integrated safely into all internal page streams.</p>
                                    </div>
                                </div>
                            )}

                            <div className="w-full mt-6">
                                <PdfActionButton
                                    text="Insert Sequence Tracking"
                                    loadingText="Compiling Vector Pages on Server..."
                                    loading={isProcessing}
                                    disabled={!file}
                                    onClick={handleNumberingProcessing}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}