"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Code, Eye, Loader2, Sliders } from "lucide-react";
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
import type { PreviewResource } from "@/lib/preview/types";
import type { ExecutionResult } from "@/lib/execution/types";
import type { BackendError } from "@/lib/notify";

type CodeFailure = { title: string; message: string };

function normalizeCodeFailure(error: unknown): CodeFailure {
    const err = error as {
        status?: number;
        backend?: { code?: string };
        originalError?: { status?: number; backend?: { code?: string } };
    } | null;
    // Select fixed copy from the deployed status/code pair, never diagnostics.
    const status = err?.status ?? err?.originalError?.status;
    const code = err?.backend?.code ?? err?.originalError?.backend?.code;
    if (status === 413 && code === "CODE_SOURCE_TOO_LARGE") {
        return {
            title: "Code source too large",
            message: "Code files can contain at most 16 MiB of raw source. Upload a smaller file or split your code into smaller files and try again.",
        };
    }
    return {
        title: "Code conversion failed",
        message: "We couldn't create a PDF preview from this code. Check your file and upload it again to retry.",
    };
}

export default function CodeToPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData, setConversionGeneration } = useSharedTool();

    const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");
    const [paperSize, setPaperSize] = useState("A4");
    const [margins, setMargins] = useState({ top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 });
    // This offscreen snapshot represents the generated PDF's printable output.
    // PDF.js display intent waits for animation frames, which hidden tabs pause.
    const [renderer] = useState(() => new ClientPdfRenderer({ renderingIntent: "print" }));
    // File object identity matters: two uploads with the same name/size are
    // still different inputs. A fresh token also distinguishes A -> B -> A.
    const input = useMemo(() => ({
        file, processingMode, paperSize,
        top: margins.top, bottom: margins.bottom, left: margins.left, right: margins.right,
    }), [file, processingMode, paperSize, margins.top, margins.bottom, margins.left, margins.right]);
    // Only an authenticated Save transfers a completed generation to download.
    const downloadHandoff = useRef<typeof input | null>(null);
    const latestInput = useRef<typeof input | null>(null);
    const [attempt, setAttempt] = useState<{
        input: typeof input;
        settled: boolean;
        output: { result: ExecutionResult; preview: PreviewResource; signal: AbortSignal } | null;
        failure: CodeFailure | null;
    }>({ input, settled: false, output: null, failure: null });
    // Reset this component's state during render on an input change, so Save
    // and the displayed preview cannot expose old output before effects run.
    if (attempt.input !== input) {
        setAttempt({ input, settled: false, output: null, failure: null });
    }
    const currentOutput = attempt.input === input ? attempt.output : null;
    const currentFailure = attempt.input === input ? attempt.failure : null;
    const isPreviewLoading = Boolean(file) && (attempt.input !== input || !attempt.settled);
    const previewUrl = currentOutput?.preview.url;

    // Update ownership at commit, before a delayed authentication continuation
    // can act on the previous render. Unmount also invalidates continuations.
    useLayoutEffect(() => {
        latestInput.current = input;
        downloadHandoff.current = null;
        setDownloadData(null);
        setConversionGeneration(input.file ? input : null);
        return () => {
            latestInput.current = null;
            // Keep the intentional Save -> download handoff, but invalidate
            // shared output on an ordinary unmount as well as input changes.
            if (downloadHandoff.current !== input) {
                setDownloadData(null);
                setConversionGeneration(null);
            }
        };
    }, [input, setDownloadData, setConversionGeneration]);

    useEffect(() => {
        const controller = new AbortController();
        const isCurrent = () => latestInput.current === input && !controller.signal.aborted;
        let resource: PreviewResource | undefined;
        const generate = async () => {
            if (!input.file) return;
            try {
                const result = await ExecutionManager.run({
                    tool: "code-to-pdf",
                    files: [input.file],
                    mode: input.processingMode,
                    signal: controller.signal,
                    params: {
                        paperSize: input.paperSize,
                        marginTop: input.top,
                        marginBottom: input.bottom,
                        marginLeft: input.left,
                        marginRight: input.right,
                    },
                });
                if (!isCurrent()) return;
                // Give PDF.js a unique cache identity per execution as well.
                const previewId = crypto.randomUUID();
                const previewPdfFile = new File([result.blob], `preview_${previewId}.pdf`, { type: "application/pdf" });
                const preview = await renderer.render({
                    document: { id: previewId, version: previewId, pageCount: 1, file: previewPdfFile },
                    page: 1,
                    scale: 2.0,
                    mode: "page",
                }, controller.signal);
                if (!isCurrent()) { preview.revoke?.(); return; }
                if (!preview.url) { preview.revoke?.(); throw new Error("Preview unavailable"); }
                resource = preview;
                setAttempt({ input, settled: true, output: { result, preview, signal: controller.signal }, failure: null });
            } catch (err: unknown) {
                if (!isCurrent()) return;
                const failure = normalizeCodeFailure(err);
                setAttempt({ input, settled: true, output: null, failure });
                setDownloadData(null);
                // Preserve quota/auth notifications. Rendering failures use the
                // same safe copy in the toast and durable status.
                const notification = err as { billing?: BackendError; originalError?: { billing?: BackendError } } | null;
                const billing = notification?.billing ?? notification?.originalError?.billing;
                handleClientError(billing ? { billing } : new Error(failure.message));
            }
        };
        void generate();
        return () => {
            controller.abort();
            resource?.revoke?.();
        };
    }, [input, renderer, setDownloadData]);

    const handleFinalDownloadSubmission = () => {
        if (!currentOutput || isPreviewLoading || !input.file) return;
        const ready = currentOutput;
        const sourceFile = input.file;
        requireAuth(() => {
            if (latestInput.current !== input || ready.signal.aborted) return;
            downloadHandoff.current = input;
            setDownloadData({
                blob: ready.result.blob,
                fileName: ready.result.fileName,
                source: { file: sourceFile, generation: input },
            });
            router.push(`/${toolId}/download`);
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Code to PDF Converter"
                description="Format programming source code files into clean, syntax-highlighted vector PDF documents with deterministic page layouts."
                icon={<Code size={32} className="text-pink-500" />}
            />

            <div className="mx-auto max-w-7xl px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* LEFT COLUMN: Configuration Metrics */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                1. Active Script
                            </h2>
                            <PdfFileInfo
                                file={file}
                                onClear={() => {
                                    setFile(null);
                                    router.push(`/${toolId}`);
                                }}
                            />
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-200">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                                <Sliders size={14} />
                                <span>2. Format Script Layout Metrics</span>
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
                                                setMargins({ ...margins, top: parseFloat(e.target.value) || 0 })
                                            }
                                            className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"
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
                                                setMargins({ ...margins, bottom: parseFloat(e.target.value) || 0 })
                                            }
                                            className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"
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
                                                setMargins({ ...margins, left: parseFloat(e.target.value) || 0 })
                                            }
                                            className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"
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
                                                setMargins({ ...margins, right: parseFloat(e.target.value) || 0 })
                                            }
                                            className="bg-transparent text-xs font-bold focus:outline-none w-full text-right text-[color:var(--foreground)]"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 border-t border-[color:var(--border)] pt-4">
                                <label className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                    Execution Mode
                                </label>
                                <ProcessingModeSelector
                                    mode={processingMode}
                                    onChange={setProcessingMode}
                                    disabled={isPreviewLoading}
                                />
                            </div>

                            <PdfActionButton
                                text="Save Code Highlight PDF"
                                loadingText="Rendering Vector PDF..."
                                loading={isPreviewLoading}
                                disabled={!currentOutput || isPreviewLoading}
                                onClick={handleFinalDownloadSubmission}
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Real-Time Vector Preview Sheet Deck */}
                    <div className="lg:col-span-7 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-6 shadow-lg space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-[color:var(--muted)] flex items-center gap-2">
                            <Eye size={16} />
                            <span>3. Real-Time Document Layout</span>
                        </h2>

                        <div role="region" aria-label="Code conversion status" className="relative w-full aspect-[3/4] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] overflow-hidden flex items-center justify-center p-4">
                            <div role="status" aria-live="polite" aria-atomic="true" className={previewUrl ? "sr-only" : "max-w-md text-center"}>
                                {isPreviewLoading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 aria-hidden="true" className="animate-spin text-indigo-500" size={32} />
                                        <p className="text-xs font-semibold text-[color:var(--muted)]">
                                            Tokenizing code and rendering vector layout sheets...
                                        </p>
                                    </div>
                                ) : currentFailure ? (
                                    <>
                                        <h3 className="text-base font-semibold">{currentFailure.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{currentFailure.message}</p>
                                    </>
                                ) : previewUrl ? <p>PDF preview ready.</p> : <p>Select options to render code layout.</p>}
                            </div>
                            {previewUrl && (
                                <div className="w-full h-full flex items-center justify-center overflow-auto shadow-inner bg-neutral-900 rounded-xl p-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt="Code Layout Document Snapshot Mirror"
                                        className="max-w-full max-h-full object-contain rounded-md border border-neutral-700/50 shadow-2xl"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
