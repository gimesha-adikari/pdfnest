"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, Globe, Loader2, ShieldCheck, Sliders } from "lucide-react";
import {getBaseUrl, uploadAndDownloadFile} from "@/lib/api";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import { PdfProgressTracker } from "@/components/pdf/PdfProgressTracker";
import PdfToolHero from "@/components/pdf/PdfToolHero";

export default function UrlToPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [url, setUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

    const [taskId, setTaskId] = useState<string>("");
    const [paperSize, setPaperSize] = useState("A4");
    const [margins, setMargins] = useState({ top: 0.0, bottom: 0.0, left: 0.0, right: 0.0 });

    useEffect(() => {
        if (file) {
            const ingestedUrl = (file as any).targetUrl;
            if (ingestedUrl && !url) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setUrl(ingestedUrl);
            }
        } else {
            setFile(new File([], "placeholder.pdf", { type: "application/pdf" }));
        }
    }, [file, setFile, url]);

    const generateLiveWebPreview = useCallback(async () => {
        requireAuth(async () => {
            try {
                setIsPreviewLoading(true);
                setSuccess(false);
                setTaskId("");

                const formData = new FormData();
                formData.append("url", url);
                formData.append("paperSize", paperSize);
                formData.append("marginTop", margins.top.toString());
                formData.append("marginBottom", margins.bottom.toString());
                formData.append("marginLeft", margins.left.toString());
                formData.append("marginRight", margins.right.toString());

                const response = await fetch(`${getBaseUrl()}/api/conversion/html-to-pdf-async`, {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                });


                if (!response.ok) throw new Error("Could not initialize remote HTML headless layout context instance nodes.");

                const data = await response.json();
                setTaskId(data.taskId);
            } catch (err: any) {
                console.error(err);
                notify(err.message || "Could not generate target viewport snapshot preview.","error");
                setIsPreviewLoading(false);
            }
        });
    }, [url, paperSize, margins, requireAuth]);

    const handleTaskComplete = async (downloadUrl: string) => {
        try {
            const response = await fetch(`${getBaseUrl()}${downloadUrl}`);
            if (!response.ok) throw new Error("Re-download framework pipeline error.");

            const pdfBlob = await response.blob();
            setFinalBlob(pdfBlob);

            const previewFormData = new FormData();
            previewFormData.append("file", new File([pdfBlob], "web_snapshot.pdf", { type: "application/pdf" }));

            const imageBlob = await uploadAndDownloadFile("/api/conversion/preview/page", previewFormData);

            if (previewUrl) window.URL.revokeObjectURL(previewUrl);
            setPreviewUrl(window.URL.createObjectURL(imageBlob));
        } catch (err) {
            notify("Failed to collect final generated binary asset stream from backend cluster nodes safely.","error");
        } finally {
            setIsPreviewLoading(false);
            setTaskId("");
        }
    };

    useEffect(() => {
        if (url && url.startsWith("http") && url.length > 12) {
            const delayDebounceHook = setTimeout(() => {
                generateLiveWebPreview();
            }, 800);
            return () => clearTimeout(delayDebounceHook);
        }
    }, [url, paperSize, margins.top, margins.bottom, margins.left, margins.right, generateLiveWebPreview]);

    const handleFinalDownload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!finalBlob || !url) return;

        setIsProcessing(true);
        let cleanName = "web_capture";
        try {
            const parsedDomain = new URL(url);
            cleanName = parsedDomain.hostname.replace("www.", "") + "_layout";
        } catch (_) {}

        setDownloadData({
            blob: finalBlob,
            fileName: `${cleanName}.pdf`
        });

        setSuccess(true);
        setIsProcessing(false);
        router.push(`/${toolId}/download`);
    };

    return (
        <>
            <PdfToolHero
                title="URL to PDF Converter"
                description="Capture and convert complex webpage viewport DOM documents into high-fidelity printable vector sheets with full real-time adjustments."
                icon={<Globe size={32} className="text-indigo-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8 w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                                        onChange={(e) => {
                                            setUrl(e.target.value);
                                            setSuccess(false);
                                        }}
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
                                            <input type="number" step="0.05" min="0" max="2" value={margins.top} onChange={(e) => { setMargins({ ...margins, top: parseFloat(e.target.value) || 0 }); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Bottom</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.bottom} onChange={(e) => { setMargins({ ...margins, bottom: parseFloat(e.target.value) || 0 }); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Left</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.left} onChange={(e) => { setMargins({ ...margins, left: parseFloat(e.target.value) || 0 }); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                        </div>
                                        <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                            <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Right</span>
                                            <input type="number" step="0.05" min="0" max="2" value={margins.right} onChange={(e) => { setMargins({ ...margins, right: parseFloat(e.target.value) || 0 }); setSuccess(false); }} className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                        </div>
                                    </div>
                                </div>

                                {success && (
                                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                                        <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                                        <p className="text-xs font-semibold">Web capture output extracted successfully!</p>
                                    </div>
                                )}

                                <PdfActionButton
                                    text="Save Captured Webpage PDF"
                                    loadingText="Locking Vector Tracks..."
                                    loading={isProcessing}
                                    disabled={isProcessing || !finalBlob}
                                    onClick={handleFinalDownload}
                                />
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4 w-full">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>3. Real-Time Document Layout</span>
                        </h2>

                        <div className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            {isPreviewLoading && taskId ? (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6">
                                    <p className="text-xs font-bold text-[color:var(--foreground)] mb-3">Headless Chromium Node Compiling DOM...</p>
                                    <PdfProgressTracker taskId={taskId} onComplete={handleTaskComplete} />
                                </div>
                            ) : isPreviewLoading ? (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-xs font-semibold text-[color:var(--muted)] text-center max-w-xs px-4">Contacting remote address clusters...</p>
                                </div>
                            ) : null}

                            {previewUrl ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    <img src={previewUrl} alt="Webpage Document Capture Preview" className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl transition-transform duration-200" />
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-2">
                                    <Globe size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                                    <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging workspace inactive. Input a valid link on the left to compile preview vectors. </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}