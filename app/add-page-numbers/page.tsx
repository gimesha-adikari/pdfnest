"use client";

import {useMemo, useState, useEffect} from "react";
import {Hash, ShieldCheck, Loader2, FileText, Move, Languages} from "lucide-react";
import {uploadAndDownloadFile} from "@/lib/apiClient";
import {getFriendlyErrorMessage} from "@/lib/errorHandler"; // Kept error decoder isolated safely
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
    {id: "Helvetica", name: "Sans-Serif Modern (Helvetica)", cssClass: "font-sans font-bold"},
    {id: "Times-Roman", name: "Classic Editorial (Times Roman)", cssClass: "font-serif font-medium"},
    {id: "Courier", name: "Monospace Tech (Courier)", cssClass: "font-mono font-normal"}
];

export default function PageNumbersPage() {
    const [file, setFile] = useState<File | null>(null);
    const [fontFamily, setFontFamily] = useState<string>("Helvetica");
    const [fontSize, setFontSize] = useState<number>(12);
    const [position, setPosition] = useState<string>("bc"); // default Bottom-Center

    const [thumbnailSrc, setThumbnailSrc] = useState<string>("");
    const [isRenderingThumbnail, setIsRenderingThumbnail] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [success, setSuccess] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setThumbnailSrc("");
            return;
        }

        let isMounted = true;
        setIsRenderingThumbnail(true);
        setError(null);

        const renderPreview = async () => {
            try {
                // Dynamically load to safely isolate window object executions away from Next SSR
                const pdfjs = await import("pdfjs-dist");
                pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";

                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjs.getDocument({data: arrayBuffer });
                const pdf = await loadingTask.promise;

                if (pdf.numPages === 0) throw new Error("Empty PDF document context.");

                const page = await pdf.getPage(1);
                const viewport = page.getViewport({scale: 0.4 });

                if (!isMounted) return;

                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                if (context) {
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport,
                    };
                    await page.render(renderContext).promise;

                    if (isMounted) {
                        setThumbnailSrc(canvas.toDataURL("image/jpeg", 0.85));
                    }
                }

                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();

            } catch (err) {
                console.error("Preview render skipped gracefully:", err);
                if (isMounted) {
                    setThumbnailSrc("");
                }
            } finally {
                if (isMounted) setIsRenderingThumbnail(false);
            }
        };

        renderPreview();

        return () => {
            isMounted = false;
        };
    }, [file]);

    const handleNumberingProcessing = async () => {
        if (!file) return;

        setIsProcessing(true);
        setSuccess(false);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const normalizedScale = (fontSize / 25).toFixed(2);
            const formatDescription = `font:${fontFamily}, scale:${normalizedScale} abs, pos:${position}, rot:0`;
            formData.append("description", formatDescription);

            if ((file as any).originalPassword){
                formData.append("file_password", (file as any).originalPassword)
            }

            const responseBlob = await uploadAndDownloadFile("/api/structure/add-page-numbers", formData);


            const downloadUrl = window.URL.createObjectURL(responseBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `numbered_${file.name}`;
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            setSuccess(true);
        } catch (err) {
            console.error(err);
            setError(getFriendlyErrorMessage(err));
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Number PDF Pages"
                description="Embed automatic sequential pagination elements across your document frames with absolute typeface alignment control."
                icon={<Hash size={32} className="text-blue-500" />}
            />

            <div className="mx-auto max-w-5xl px-4 py-8">
                {!file ? (
                    /* CRITICAL RESTORATION: Left your component invocation exactly
                       as originally written, keeping your custom onFilesAccepted handler intact.
                    */
                    <PdfUploader
                        onFilesAccepted={(files) => {
                            if (files && files.length > 0) {
                                setFile(files[0]);
                            }
                        }}
                        accept=".pdf"
                        multiple={false}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 lg:col-span-7">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Stylistic Typeface Profiles</h3>
                            <div className="mt-4 space-y-3">
                                {STYLISTIC_FONTS.map((font) => (
                                    <button
                                        key={font.id}
                                        onClick={() => setFontFamily(font.id)}
                                        className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                                            fontFamily === font.id
                                                ? "border-blue-500 bg-blue-500/5 text-blue-600 dark:bg-blue-500/10"
                                                : "border-gray-100 bg-gray-50/50 text-gray-700 hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                                        }`}
                                    >
                                        <span className={font.cssClass}>{font.name}</span>
                                        {fontFamily === font.id && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Font Scale (Points)</label>
                                    <input
                                        type="number"
                                        min={6}
                                        max={72}
                                        value={fontSize}
                                        onChange={(e) => setFontSize(Number(e.target.value))}
                                        className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:text-zinc-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Vector Coordinates</label>
                                    <select
                                        value={position}
                                        onChange={(e) => setPosition(e.target.value)}
                                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
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
                                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-50/50 p-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div className="w-full mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={16}/>
                                    <div className="text-xs">
                                        <p className="font-semibold">Page indexing compiled successfully!</p>
                                        <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/70">The
                                            sequential background indices have been integrated safely into all internal
                                            page streams.</p>
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

                        {/* Right Hand Side Layout Preview Grid */}
                        <div className="flex flex-col items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-6 dark:border-zinc-800/50 dark:bg-zinc-900/20 lg:col-span-5">
                            <div className="w-full">
                                <PdfFileInfo file={file} onClear={() => setFile(null)} />
                            </div>

                            <div className="relative my-auto flex h-64 w-full items-center justify-center rounded-xl bg-white/50 p-4 shadow-inner dark:bg-zinc-900/50">
                                {isRenderingThumbnail ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader2 className="animate-spin text-blue-500" size={24} />
                                        <span className="text-xs text-gray-400">Rasterizing structural layers...</span>
                                    </div>
                                ) : thumbnailSrc ? (
                                    <div className="relative shadow-lg border border-gray-200/60 dark:border-zinc-800">
                                        <img src={thumbnailSrc} alt="Document Preview Frame" className="max-h-56 object-contain" />

                                        <div className={`absolute inset-x-0 p-2 text-[10px] font-bold text-blue-600 flex ${
                                            position.startsWith('t') ? 'top-0' : 'bottom-0'
                                        } ${
                                            position.endsWith('l') ? 'justify-start pl-4' : position.endsWith('r') ? 'justify-end pr-4' : 'justify-center'
                                        }`}>
                                            <span className="bg-blue-100 px-1 rounded shadow-sm border border-blue-300 animate-pulse">Page 1</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                        <FileText size={32} strokeWidth={1.5} />
                                        <span className="text-xs">No active preview grid structural context</span>
                                    </div>
                                )}
                            </div>

                            <div className="w-full text-center text-[11px] text-gray-400">
                                Canvas container bounds mapped to automatic standard execution pipelines.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}