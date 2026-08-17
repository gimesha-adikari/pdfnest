"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileCode, Eye, Loader2, Sliders } from "lucide-react";
import { notify } from "@/lib/notify";
import { handleClientError } from "@/lib/errorHandler";
import { useAuth } from "@/context/AuthContext";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import type { ProcessingMode } from "@/lib/execution/types";
import { ClientPdfRenderer } from "@/lib/preview/ClientPdfRenderer";

export default function MarkdownToPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [isProcessing, setIsProcessing] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
    const [finalFileName, setFinalFileName] = useState<string>("");
    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

    const [paperSize, setPaperSize] = useState("A4");
    const [margins, setMargins] = useState({ top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 });
    const rendererRef = useRef<ClientPdfRenderer | null>(null);

    if (!rendererRef.current) {
        rendererRef.current = new ClientPdfRenderer();
    }

    const generateLiveMarkdownPreview = async (targetFile: File) => {
        try {
            setIsPreviewLoading(true);

            const result = await ExecutionManager.run({
                tool: "markdown-to-pdf",
                files: [targetFile],
                mode: processingMode,
                params: {
                    paperSize,
                    marginTop: margins.top,
                    marginBottom: margins.bottom,
                    marginLeft: margins.left,
                    marginRight: margins.right,
                },
            });

            setFinalBlob(result.blob);
            setFinalFileName(result.fileName);

            // Render Page 1 to Image URL via ClientPdfRenderer
            const previewPdfFile = new File([result.blob], "preview_rendered.pdf", { type: "application/pdf" });
            const controller = new AbortController();
            const previewResource = await rendererRef.current!.render(
                {
                    document: {
                        id: `md_preview_${Date.now()}`,
                        version: `${Date.now()}`,
                        pageCount: 1,
                        file: previewPdfFile,
                    },
                    page: 1,
                    scale: 2.0,
                    mode: "page",
                },
                controller.signal
            );

            if (previewUrl) {
                window.URL.revokeObjectURL(previewUrl);
            }

            if (previewResource.url) {
                setPreviewUrl(previewResource.url);
            }
        } catch (err: unknown) {
            console.error("[MarkdownToPdfWorkspace] Live preview error:", err);
            handleClientError(err);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    useEffect(() => {
        if (file) {
            generateLiveMarkdownPreview(file);
        }
        return () => {
            if (previewUrl) {
                window.URL.revokeObjectURL(previewUrl);
            }
        };
    }, [file, paperSize, margins.top, margins.bottom, margins.left, margins.right, processingMode]);

    const handleFinalDownloadSubmission = () => {
        requireAuth(async () => {
            if (!finalBlob || !file) return;
            setIsProcessing(true);

            const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
            const outputName = finalFileName || `converted_${baseName}.pdf`;

            setDownloadData({
                blob: finalBlob,
                fileName: outputName,
            });

            setIsProcessing(false);
            router.push(`/${toolId}/download`);
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Markdown to PDF Converter"
                description="Convert Markdown notes (.md) into clean, typography-focused stylized portrait vector PDFs with deterministic page layouts."
                icon={<FileCode size={32} className="text-cyan-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT COLUMN: Configuration Metrics */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                1. Active Document
                            </h2>
                            <PdfFileInfo
                                file={file}
                                onClear={() => {
                                    setFile(null);
                                    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
                                    setPreviewUrl(null);
                                    setFinalBlob(null);
                                    router.push(`/${toolId}`);
                                }}
                            />
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-200">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                <Sliders size={14} />
                                <span>2. Page Layout Metrics</span>
                            </h2>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-[color:var(--muted)]">Target Page Template</label>
                                <select
                                    value={paperSize}
                                    onChange={(e) => setPaperSize(e.target.value)}
                                    className="w-full text-xs font-semibold p-3 border border-[color:var(--border)] bg-[color:var(--background)] rounded-xl focus:border-indigo-500 text-[color:var(--foreground)] focus:outline-none"
                                >
                                    <option value="A4">A4 Standard Format (595 × 842 pt)</option>
                                    <option value="letter">US Letter Format (612 × 792 pt)</option>
                                    <option value="legal">US Legal Scale (612 × 1008 pt)</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-[color:var(--muted)]">
                                    Page Margin Spacing (Inches)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">
                                            Top
                                        </span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="2.5"
                                            value={margins.top}
                                            onChange={(e) =>
                                                setMargins((m) => ({ ...m, top: parseFloat(e.target.value) || 0 }))
                                            }
                                            className="w-full text-xs font-semibold bg-transparent focus:outline-none text-[color:var(--foreground)]"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">
                                            Bottom
                                        </span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="2.5"
                                            value={margins.bottom}
                                            onChange={(e) =>
                                                setMargins((m) => ({ ...m, bottom: parseFloat(e.target.value) || 0 }))
                                            }
                                            className="w-full text-xs font-semibold bg-transparent focus:outline-none text-[color:var(--foreground)]"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">
                                            Left
                                        </span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="2.5"
                                            value={margins.left}
                                            onChange={(e) =>
                                                setMargins((m) => ({ ...m, left: parseFloat(e.target.value) || 0 }))
                                            }
                                            className="w-full text-xs font-semibold bg-transparent focus:outline-none text-[color:var(--foreground)]"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-1.5 rounded-xl">
                                        <span className="text-[10px] uppercase font-bold text-[color:var(--muted)] w-8">
                                            Right
                                        </span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="2.5"
                                            value={margins.right}
                                            onChange={(e) =>
                                                setMargins((m) => ({ ...m, right: parseFloat(e.target.value) || 0 }))
                                            }
                                            className="w-full text-xs font-semibold bg-transparent focus:outline-none text-[color:var(--foreground)]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* EXECUTION MODE CONTROLS */}
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                3. Execution Infrastructure
                            </h2>
                            <ProcessingModeSelector
                                mode={processingMode}
                                onChange={setProcessingMode}
                                disabled={isProcessing || isPreviewLoading}
                            />
                        </div>

                        <PdfActionButton
                            text="Save Markdown Vector PDF"
                            loadingText="Rendering Vector PDF..."
                            loading={isProcessing}
                            disabled={isProcessing || !finalBlob}
                            onClick={handleFinalDownloadSubmission}
                        />
                    </div>

                    {/* RIGHT COLUMN: Live Vector Document Mirror */}
                    <div className="lg:col-span-7">
                        <div className="sticky top-6 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                    <Eye size={14} />
                                    <span>Interactive Document Mirror</span>
                                </h2>
                                <span className="text-[11px] font-medium text-[color:var(--muted)] bg-[color:var(--background)] px-2 py-0.5 rounded-lg border border-[color:var(--border)]">
                                    {paperSize} Page 1 View
                                </span>
                            </div>

                            <div className="relative min-h-[460px] flex items-center justify-center rounded-2xl bg-[#0f0f12] border border-[color:var(--border)] overflow-hidden shadow-inner p-4">
                                {isPreviewLoading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="animate-spin text-cyan-400" size={32} />
                                        <p className="text-xs font-medium text-[color:var(--muted)]">
                                            Formatting Vector Markdown Layout...
                                        </p>
                                    </div>
                                ) : previewUrl ? (
                                    <div className="relative max-w-full flex justify-center items-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={previewUrl}
                                            alt="Markdown Layout Document Snapshot Mirror"
                                            className="max-h-[580px] w-auto rounded-lg shadow-2xl border border-[#2d2d34]"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-center text-zinc-500">
                                        <FileCode size={36} className="opacity-40" />
                                        <p className="text-xs">Select options to render vector layout</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}