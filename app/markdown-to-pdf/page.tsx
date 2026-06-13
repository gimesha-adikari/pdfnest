"use client";

import { useState, useEffect } from "react";
import { FileCode, ShieldCheck, Loader2, Eye, Sliders } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import { notify } from "@/lib/notify";

export default function MarkdownToPdfPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

    const [uploadProgress, setUploadProgress] = useState(0);

    const [paperSize, setPaperSize] = useState("A4");

    // Expanded margin tracking state configuration matrix
    const [margins, setMargins] = useState({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });

    // Instantly refresh layout whenever any bounding field triggers updates
    useEffect(() => {
        if (file) {
            generateLivePreview(file);
        }
    }, [paperSize, margins.top, margins.bottom, margins.left, margins.right]);

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const selectedFile = acceptedFiles[0];
        setFile(selectedFile);
        setSuccess(false);
        await generateLivePreview(selectedFile);
    };

    const generateLivePreview = async (targetFile: File) => {
        try {
            setIsPreviewLoading(true);
            setUploadProgress(0);

            const formData = new FormData();
            formData.append("file", targetFile);
            formData.append("orientation", "portrait");
            formData.append("paperSize", paperSize);
            formData.append("marginTop", margins.top.toString());
            formData.append("marginBottom", margins.bottom.toString());
            formData.append("marginLeft", margins.left.toString());
            formData.append("marginRight", margins.right.toString());

            const pdfBlob = await uploadAndDownloadFile("/api/conversion/markdown-to-pdf", formData, (progress) => {
                setUploadProgress(progress);
            });
            setFinalBlob(pdfBlob);

            const previewFormData = new FormData();
            previewFormData.append("file", new File([pdfBlob], "intermed.pdf", { type: "application/pdf" }));

            const imageBlob = await
                uploadAndDownloadFile("/api/conversion/preview/page", previewFormData);

            if (previewUrl) window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(window.URL.createObjectURL(imageBlob));
        } catch (err) {
            console.error(err);
            notify("Could not update document layout preview coordinates.");
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleFinalDownload = () => {
        if (!finalBlob || !file) return;
        setIsProcessing(true);
        const downloadUrl = window.URL.createObjectURL(finalBlob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        link.download = `${baseName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        setSuccess(true);
        setIsProcessing(false);
    };

    return (
        <PdfToolLayout>
            <PdfToolHero
                title="Markdown to PDF Converter"
                description="Convert Markdown notes into clean, stylized portrait PDFs with precise upload and conversion tracking."
                icon={<FileCode size={32} className="text-pink-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT COLUMN: Controls & Setup panels */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">1. Stage Document</h2>
                            <PdfUploader onFilesAccepted={onDrop} title="Upload Markdown" description=".md or .markdown files" multiple={false} accept=".md,.markdown" />
                            {file && <PdfFileInfo file={file} onClear={() => { setFile(null); setPreviewUrl(null); setFinalBlob(null); setSuccess(false); }} />}
                        </div>

                        {file && (
                            <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                    <Sliders size={14} />
                                    <span>2. Format Layout Metrics</span>
                                </h2>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-[color:var(--muted)]">Paper Bounds Template</label>
                                    <select value={paperSize} onChange={(e) => { setPaperSize(e.target.value); setSuccess(false); }} className="w-full text-xs font-semibold p-3 border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl focus:border-indigo-500 text-[color:var(--foreground)] focus:outline-none">
                                        <option value="A4">A4 Dimensions (Portrait)</option>
                                        <option value="letter">US Letter Format</option>
                                        <option value="legal">US Legal Scale</option>
                                    </select>
                                </div>

                                {/* Custom Bounding Margins 2x2 Input Grid */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-[color:var(--muted)]">Print Margin Boundaries (Inches)</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Top</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.top} onChange={(e) => { setMargins({...margins, top: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Bottom</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.bottom} onChange={(e) => { setMargins({...margins, bottom: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Left</span>
                                            <input type="number" step="0.1" min="0" max="2" value={margins.left} onChange={(e) => { setMargins({...margins, left: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Right</span>
                                            <input type="number" step="0.1" min="0" max="2" value={margins.right} onChange={(e) => { setMargins({...margins, right: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                    </div>
                                </div>

                                {success && (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                        <p className="text-xs font-semibold">Bespoke document layout saved completely.</p>
                                    </div>
                                )}

                                {isPreviewLoading && uploadProgress > 0 && (
                                    <div className="space-y-1.5 animate-in fade-in duration-150">
                                        <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                            <span>{uploadProgress === 90 ? "Rendering PDF Assets..." : "Uploading Content"}</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[color:var(--background)] rounded-full overflow-hidden border border-[color:var(--border)]">
                                            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}

                                <PdfActionButton text="Save Portrait PDF Document" loadingText="Finalizing Streams..." loading={isProcessing} disabled={isProcessing || !finalBlob} onClick={handleFinalDownload} />
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Interactive Portrait Sheet Frame Wrapper */}
                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>3. Real-Time Document Layout</span>
                        </h2>

                        <div className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-xs font-semibold text-[color:var(--muted)]">
                                        {uploadProgress < 90 ? `Streaming Document Tracks (${uploadProgress}%)` : "Invoking Headless Compilation Engines..."}
                                    </p>
                                </div>
                            )}

                            {previewUrl ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    <img src={previewUrl} alt="Document Layout Mirror" className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl transition-transform duration-200" />
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-2">
                                    <FileCode size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                                    <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging area empty. Adjust left sidebar formatting variables to trigger real-time updates. </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
            <PdfFeatures />
        </PdfToolLayout>
    );
}