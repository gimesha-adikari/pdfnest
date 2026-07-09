"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Code, Eye, Loader2, ShieldCheck, Sliders } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { useSharedTool } from "@/app/(site)/[toolId]/layout";

export default function CodeToPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [paperSize, setPaperSize] = useState("A4");
    const [margins, setMargins] = useState({ top: 0.0, bottom: 0.0, left: 0.0, right: 0.0 });

    const generateLiveCodePreview = async (targetFile: File) => {
        requireAuth(async () => {
            try {
                setIsPreviewLoading(true);
                setUploadProgress(0);

                const formData = new FormData();
                formData.append("file", targetFile);
                formData.append("paperSize", paperSize);
                formData.append("marginTop", margins.top.toString());
                formData.append("marginBottom", margins.bottom.toString());
                formData.append("marginLeft", margins.left.toString());
                formData.append("marginRight", margins.right.toString());

                const pdfBlob = await uploadAndDownloadFile("/api/conversion/code-to-pdf", formData, (progress) => {
                    setUploadProgress(progress);
                });
                setFinalBlob(pdfBlob);

                const previewFormData = new FormData();
                previewFormData.append("file", new File([pdfBlob], "code_snapshot.pdf", { type: "application/pdf" }));

                const imageBlob = await uploadAndDownloadFile("/api/conversion/preview/page", previewFormData);

                if (previewUrl) window.URL.revokeObjectURL(previewUrl);
                setPreviewUrl(window.URL.createObjectURL(imageBlob));
            } catch (err) {
                console.error(err);
                notify("Could not compute syntax highlight document layout previews.");
            } finally {
                setIsPreviewLoading(false);
            }
        });
    };

    useEffect(() => {
        if (file) {
            generateLiveCodePreview(file);
        }
    }, [paperSize, margins.top, margins.bottom, margins.left, margins.right]);

    const handleFinalDownloadSubmission = () => {
        requireAuth(async () => {
            if (!finalBlob || !file) return;
            setIsProcessing(true);

            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

            // Forward finalized payload data straight out to universal download screen
            setDownloadData({
                blob: finalBlob,
                fileName: `${baseName}.pdf`
            });

            setIsProcessing(false);
            router.push(`/${toolId}/download`);
        });
    };

    // Clean TypeScript guard clause prevents TS2322 properties errors below
    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Code to PDF Converter"
                description="Configure target page matrices, plain text indentation margins, and prism script tracking templates."
                icon={<Code size={32} className="text-pink-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT COLUMN: Configuration Metrics */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">1. Active Script</h2>
                            <PdfFileInfo file={file} onClear={() => {
                                setFile(null);
                                setPreviewUrl(null);
                                setFinalBlob(null);
                                router.push(`/${toolId}`);
                            }} />
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-200">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                <Sliders size={14} />
                                <span>2. Format Script Layout Metrics</span>
                            </h2>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-[color:var(--muted)]">Target Page Template</label>
                                <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}
                                        className="w-full text-xs font-semibold p-3 border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl focus:border-indigo-500 text-[color:var(--foreground)] focus:outline-none">
                                    <option value="A4">A4 Standard Format</option>
                                    <option value="letter">US Letter Dimension Format</option>
                                    <option value="legal">US Legal Scale</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-[color:var(--muted)]">Page Margin Spacing (Inches)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Top</span>
                                        <input type="number" step="0.05" min="0" max="2" value={margins.top}
                                               onChange={(e) => setMargins({ ...margins, top: parseFloat(e.target.value) || 0 })}
                                               className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Bottom</span>
                                        <input type="number" step="0.05" min="0" max="2" value={margins.bottom}
                                               onChange={(e) => setMargins({ ...margins, bottom: parseFloat(e.target.value) || 0 })}
                                               className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Left</span>
                                        <input type="number" step="0.05" min="0" max="2" value={margins.left}
                                               onChange={(e) => setMargins({ ...margins, left: parseFloat(e.target.value) || 0 })}
                                               className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">Right</span>
                                        <input type="number" step="0.05" min="0" max="2" value={margins.right}
                                               onChange={(e) => setMargins({ ...margins, right: parseFloat(e.target.value) || 0 })}
                                               className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]" />
                                    </div>
                                </div>
                            </div>

                            {isPreviewLoading && uploadProgress > 0 && (
                                <div className="space-y-1.5 animate-in fade-in duration-150">
                                    <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-[color:var(--muted)]">
                                        <span>{uploadProgress === 90 ? "Invoking High-Fidelity Highlighters..." : "Streaming Code Chunks"}</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-[color:var(--background)] rounded-full overflow-hidden border border-[color:var(--border)]">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                                             style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                </div>
                            )}

                            <PdfActionButton text="Save Code Highlight PDF" loadingText="Locking Document Tracks..."
                                             loading={isProcessing} disabled={isProcessing || !finalBlob}
                                             onClick={handleFinalDownloadSubmission} />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Real-Time Vector Preview Sheet Deck */}
                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>3. Real-Time Document Layout</span>
                        </h2>

                        <div className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            {isPreviewLoading && (
                                <div className="absolute inset-0 bg-[color:var(--card)]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                                    <p className="text-xs font-semibold text-[color:var(--muted)] text-center">
                                        {uploadProgress < 90 ? `Streaming script arrays over network (${uploadProgress}%)` : "Prism compiling syntax elements and rendering layout sheets..."}
                                    </p>
                                </div>
                            )}

                            {previewUrl ? (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    <img src={previewUrl} alt="Code Layout Document Snapshot Mirror"
                                         className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl" />
                                </div>
                            ) : (
                                <div className="text-center p-8 space-y-2">
                                    <Code size={40} className="mx-auto text-[color:var(--border)] stroke-[1.5]" />
                                    <p className="text-xs font-medium text-[color:var(--muted)] max-w-xs mx-auto"> Staging workspace inactive. </p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}