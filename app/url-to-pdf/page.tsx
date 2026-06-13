"use client";

import { useState, useEffect } from "react";
import { Globe, ShieldCheck, Loader2, Eye, Sliders } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/apiClient";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { notify } from "@/lib/notify";

export default function UrlToPdfPage() {
    const [url, setUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

    const [uploadProgress, setUploadProgress] = useState(0);

    const [paperSize, setPaperSize] = useState("A4");
    const [margins, setMargins] = useState({ top: 0.0, bottom: 0.0, left: 0.0, right: 0.0 }); // Defaulting to 0 for full bleed captures

    // Trigger visual preview compilation when configuration updates occur
    useEffect(() => {
        // Simple safety check: only fire when a complete URL protocol block is filled
        if (url && url.startsWith("http") && url.length > 12) {
            const delayDebounceHook = setTimeout(() => {
                generateLiveWebPreview();
            }, 800); // 800ms debounce buffer ensures we don't spam requests while a user is typing their URL string
            return () => clearTimeout(delayDebounceHook);
        }
    }, [url, paperSize, margins.top, margins.bottom, margins.left, margins.right]);

    const generateLiveWebPreview = async () => {
        try {
            setIsPreviewLoading(true);
            setUploadProgress(0);

            // Web URL payloads map to key-value objects inside multipart fields
            const formData = new FormData();
            formData.append("url", url);
            formData.append("paperSize", paperSize);
            formData.append("marginTop", margins.top.toString());
            formData.append("marginBottom", margins.bottom.toString());
            formData.append("marginLeft", margins.left.toString());
            formData.append("marginRight", margins.right.toString());

            // 1. Post request stream tracks to back-end compilation pipelines
            const pdfBlob = await uploadAndDownloadFile("/api/conversion/url-to-pdf", formData, (progress) => {
                setUploadProgress(progress);
            });
            setFinalBlob(pdfBlob);

            // 2. Wrap compiled PDF into fresh file form binary to catch page image snapshot
            const previewFormData = new FormData();
            previewFormData.append("file", new File([pdfBlob], "web_snapshot.pdf", { type: "application/pdf" }));

            const imageBlob = await uploadAndDownloadFile("/api/conversion/preview/page", previewFormData);

            if (previewUrl) window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(window.URL.createObjectURL(imageBlob));
        } catch (err) {
            console.error(err);
            notify("Could not generate target viewport snapshot preview.");
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const handleFinalDownload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!finalBlob || !url) return;

        setIsProcessing(true);
        const downloadUrl = window.URL.createObjectURL(finalBlob);
        const link = document.createElement("a");
        link.href = downloadUrl;

        // Extract a clean file filename based on standard domain mapping string properties
        let cleanName = "web_capture";
        try {
            const parsedDomain = new URL(url);
            cleanName = parsedDomain.hostname.replace("www.", "") + "_layout";
        } catch (_) {}

        link.download = `${cleanName}.pdf`;
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
                title="URL to PDF Converter"
                description="Capture and convert complex webpage viewport DOM documents into high-fidelity printable vector sheets with full real-time adjustments."
                icon={<Globe size={32} className="text-indigo-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT COLUMN: Input form controls and layout adjustment panel */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">1. Webpage Address Link</h2>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-[color:var(--muted)]">Target Web URL</label>
                                <div className="relative flex items-center">
                                    <Globe className="absolute left-4 text-[color:var(--muted)]" size={18} />
                                    <input
                                        type="url"
                                        placeholder="https://example.com/portfolio"
                                        value={url}
                                        onChange={(e) => { setUrl(e.target.value); setSuccess(false); }}
                                        className="w-full pl-12 pr-4 py-3 text-sm border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl focus:border-indigo-500 focus:outline-none font-medium text-[color:var(--foreground)] transition-colors"
                                    />
                                </div>
                            </div>
                        </div>

                        {url && url.startsWith("http") && (
                            <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-200">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                    <Sliders size={14} />
                                    <span>2. Format Printing Boundaries</span>
                                </h2>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-[color:var(--muted)]">Target Sheet Dimensions</label>
                                    <select value={paperSize} onChange={(e) => { setPaperSize(e.target.value); setSuccess(false); }} className="w-full text-xs font-semibold p-3 border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl focus:border-indigo-500 text-[color:var(--foreground)] focus:outline-none">
                                        <option value="A4">A4 HD Print Matrix Layout</option>
                                        <option value="letter">US Letter Format</option>
                                        <option value="legal">US Legal Scale</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-[color:var(--muted)]">Print Margins Overrides (Inches)</label>
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
                                            <input type="number" step="0.05" min="0" max="2" value={margins.left} onChange={(e) => { setMargins({...margins, left: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Right</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.right} onChange={(e) => { setMargins({...margins, right: parseFloat(e.target.value) || 0}); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"/>
                                        </div>
                                    </div>
                                </div>

                                {success && (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                        <p className="text-xs font-semibold">Web capture output extracted successfully!</p>
                                    </div>
                                )}

                                {isPreviewLoading && uploadProgress > 0 && (
                                    <div className="space-y-1.5 animate-in fade-in duration-150">
                                        <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                            <span>{uploadProgress === 90 ? "Invoking Headless Engine Browser..." : "Connecting Target Network Links"}</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[color:var(--background)] rounded-full overflow-hidden border border-[color:var(--border)]">
                                            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}

                                <PdfActionButton text="Save Captured Webpage PDF" loadingText="Locking Vector Tracks..." loading={isProcessing} disabled={isProcessing || !finalBlob} onClick={handleFinalDownload} />
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Continuous Real-Time Preview Panel (7 cols) */}
                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>3. Real-Time Document Layout</span>
                        </h2>

                        <div className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-xs font-semibold text-[color:var(--muted)] text-center max-w-xs px-4">
                                        {uploadProgress < 90 ? `Contacting remote address clusters (${uploadProgress}%)` : "Hydrating layout trees & parsing lazy components... This takes a brief moment."}
                                    </p>
                                </div>
                            )}

                            {previewUrl ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    <img src={previewUrl} alt="Webpage Document Capture Preview" className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl transition-transform duration-200" />
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-2">
                                    <Globe size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                                    <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging workspace inactive. Input a valid http/https destination address link on the left configuration block to compile page preview vectors. </p>
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