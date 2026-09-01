"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Highlighter, Languages, Loader2, RotateCcw, ShieldCheck, Strikethrough, Underline } from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useAuth } from "@/context/AuthContext";
import OcrLanguagePicker from "@/components/tools/OcrLanguagePicker";
import MarkupPdfPreview, { type MarkupPreviewState, type MarkupTextSelection } from "@/components/tools/MarkupPdfPreview";
import { fetchOcrMarkupPreview, safeOcrMarkupPreviewMessage, type OcrMarkupPreview } from "@/lib/ocrMarkupPreview";
import {
    cancelOcrAwareMarkup,
    downloadOcrAwareMarkup,
    getOcrAwareMarkupCapabilities,
    OcrAwareMarkupError,
    safeOcrAwareMarkupMessage,
    submitOcrAwareMarkup,
    waitForOcrAwareMarkupJob,
    type OcrAwareMarkupAction,
    type OcrAwareMarkupCapabilities,
    type OcrAwareMarkupJob,
    type OcrAwareMarkupMode,
} from "@/lib/ocrAwareMarkupV2";

const MAX_PDF_BYTES = 100 * 1024 * 1024;

const LABELS: Record<OcrAwareMarkupAction, { title: string; verb: string; color: string }> = {
    highlight: { title: "Highlight text in PDF", verb: "Highlight", color: "#FFFF00" },
    underline: { title: "Underline text in PDF", verb: "Underline", color: "#2563EB" },
    strikeout: { title: "Strike out text in PDF", verb: "Strike out", color: "#DC2626" },
};

const ACTION_INSTRUCTIONS: Record<OcrAwareMarkupAction, string> = {
    highlight: "highlight it",
    underline: "underline it",
    strikeout: "strike it out",
};

const ICONS = { highlight: Highlighter, underline: Underline, strikeout: Strikethrough };
const DEFAULT_MODES: OcrAwareMarkupMode[] = ["smart", "ocr", "native"];

function applyCapabilities(next: OcrAwareMarkupCapabilities): OcrAwareMarkupCapabilities {
    return { ...next, languages: next.languages.filter((item) => item.code && item.name) };
}

function capabilityFailure(cause: unknown): string {
    if (cause instanceof OcrAwareMarkupError && (cause.status === 401 || cause.status === 403 || cause.code === "AUTHENTICATION_REQUIRED")) {
        return "Sign in to load available languages.";
    }
    if (cause instanceof OcrAwareMarkupError && cause.status === 0) return "We couldn't connect to the processing service.";
    return "We couldn't load the available languages.";
}

function errorMessage(cause: unknown): string {
    if (cause instanceof OcrAwareMarkupError) return safeOcrAwareMarkupMessage(cause.code);
    if (cause instanceof DOMException && cause.name === "AbortError") return "Markup processing was cancelled.";
    return "We couldn't connect to the processing service.";
}

function validatePdf(file: File): string | null {
    const hasPdfType = file.type === "application/pdf";
    const hasPdfExtension = file.name.toLocaleLowerCase().endsWith(".pdf");
    if (!hasPdfType && !hasPdfExtension) return "Choose a PDF file to continue.";
    if (file.size <= 0) return "This PDF is empty. Choose another file.";
    if (file.size > MAX_PDF_BYTES) return "This PDF is too large. Choose a file under 100 MB.";
    return null;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(job: OcrAwareMarkupJob): string {
    if (job.status === "QUEUED") return "Queued";
    if (job.status === "RUNNING") {
        const currentPage = job.progress?.current_page;
        return currentPage ? `Processing page ${currentPage} of ${job.progress.total_pages}` : "Processing your PDF";
    }
    if (job.status === "SUCCEEDED") return "Complete";
    if (job.status === "CANCELLED") return "Cancelled";
    if (job.status === "FAILED") return "Could not complete";
    return "Processing";
}

export default function OcrAwareMarkupV2Workspace({ action }: { action: OcrAwareMarkupAction }) {
    const { file, setFile } = useSharedTool();
    const { openAuthModal, isLoggedIn, isLoading: isAuthLoading } = useAuth();
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState<OcrAwareMarkupMode>("smart");
    const [language, setLanguage] = useState("auto");
    const [color, setColor] = useState(LABELS[action].color);
    const [capabilities, setCapabilities] = useState<OcrAwareMarkupCapabilities | null>(null);
    const [capabilityError, setCapabilityError] = useState<string | null>(null);
    const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
    const [job, setJob] = useState<OcrAwareMarkupJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultFile, setResultFile] = useState<File | null>(null);
    const [selection, setSelection] = useState<MarkupTextSelection | null>(null);
    const [previewState, setPreviewState] = useState<MarkupPreviewState>({ status: "idle", page: 1, pageCount: 0, pageHasSelectableText: false, pageHasScannedContent: false });
    const [ocrPreview, setOcrPreview] = useState<OcrMarkupPreview | null>(null);
    const [ocrPreviewStatus, setOcrPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [ocrPreviewError, setOcrPreviewError] = useState<string | null>(null);
    const [ocrPreviewKey, setOcrPreviewKey] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const ocrPreviewRequestRef = useRef<{ key: string; controller: AbortController } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const loadCapabilities = useCallback(async () => {
        setIsLoadingCapabilities(true);
        setCapabilityError(null);
        try {
            const next = applyCapabilities(await getOcrAwareMarkupCapabilities());
            if (next.languages.length === 0) throw new OcrAwareMarkupError("UNSUPPORTED_LANGUAGE", "No languages are available.", 200);
            setCapabilities(next);
        } catch (cause) {
            setCapabilities(null);
            setCapabilityError(capabilityFailure(cause));
        } finally {
            setIsLoadingCapabilities(false);
        }
    }, []);

    useEffect(() => {
        // Capability discovery is an external request; its completion updates UI state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadCapabilities();
    }, [loadCapabilities]);

    useEffect(() => () => {
        abortRef.current?.abort();
        ocrPreviewRequestRef.current?.controller.abort();
    }, []);

    useEffect(() => {
        return () => {
            if (resultUrl) URL.revokeObjectURL(resultUrl);
        };
    }, [resultUrl]);

    const openFileChooser = useCallback(() => {
        const input = fileInputRef.current;
        if (!input) return;
        // Clear only the native input value. The selected document stays intact
        // until a replacement file is actually chosen.
        input.value = "";
        input.click();
    }, []);

    const cancelActiveJobWithoutAwait = useCallback(() => {
        abortRef.current?.abort();
        if (job && ["QUEUED", "RUNNING"].includes(job.status)) {
            void cancelOcrAwareMarkup(job.job_id).catch(() => undefined);
        }
    }, [job]);

    const clearResult = useCallback(() => {
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
        setResultFile(null);
    }, [resultUrl]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.target.files?.[0];
        if (!nextFile) return;
        const validationError = validatePdf(nextFile);
        if (validationError) {
            setUploadError(validationError);
            event.currentTarget.value = "";
            return;
        }

        cancelActiveJobWithoutAwait();
        setUploadError(null);
        setError(null);
        setJob(null);
        setSelection(null);
        setQuery("");
        setLanguage("auto");
        setMode("smart");
        setOcrPreview(null);
        setOcrPreviewStatus("idle");
        setOcrPreviewError(null);
        setOcrPreviewKey(null);
        clearResult();
        setFile(nextFile);
        event.currentTarget.value = "";
    };

    const handleTextSelected = useCallback((nextSelection: MarkupTextSelection) => {
        setSelection(nextSelection);
        setQuery(nextSelection.text);
        setMode(nextSelection.source === "ocr" ? "ocr" : "native");
        setError(null);
    }, []);

    const handleLanguageChange = useCallback((value: string) => {
        setLanguage(value);
        setOcrPreview(null);
        setOcrPreviewStatus("idle");
        setOcrPreviewError(null);
        setOcrPreviewKey(null);
        if (selection?.source === "ocr") {
            setSelection(null);
            setQuery("");
        }
    }, [selection]);

    useEffect(() => {
        const previewFile = file;
        if (!previewFile || !capabilities || !isLoggedIn || isAuthLoading) {
            ocrPreviewRequestRef.current?.controller.abort();
            ocrPreviewRequestRef.current = null;
            return;
        }
        if (!previewState.pageHasScannedContent) {
            return;
        }

        const previewKey = `${previewFile.name}:${previewFile.size}:${previewFile.lastModified}:${language}`;
        const activeRequest = ocrPreviewRequestRef.current;
        if (activeRequest && activeRequest.key !== previewKey) {
            activeRequest.controller.abort();
            ocrPreviewRequestRef.current = null;
        }
        if (ocrPreviewKey === previewKey || ocrPreviewRequestRef.current?.key === previewKey) return;

        const controller = new AbortController();
        ocrPreviewRequestRef.current = { key: previewKey, controller };
        // The OCR preview is scoped to the selected document and language. It
        // may be refreshed without discarding the PDF or its native preview.
        setOcrPreviewStatus("loading");
        setOcrPreviewError(null);
        setOcrPreviewKey(previewKey);
        void fetchOcrMarkupPreview(previewFile, language, controller.signal)
            .then((next) => {
                if (controller.signal.aborted) return;
                setOcrPreview(next);
                setOcrPreviewStatus("ready");
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setOcrPreview(null);
                setOcrPreviewStatus("error");
                setOcrPreviewError(safeOcrMarkupPreviewMessage(cause));
            })
            .finally(() => {
                if (ocrPreviewRequestRef.current?.controller === controller) ocrPreviewRequestRef.current = null;
            });
    }, [capabilities, file, isAuthLoading, isLoggedIn, language, ocrPreviewKey, previewState.pageHasScannedContent]);

    const submit = useCallback(async () => {
        if (!file || !query.trim() || !capabilities) return;
        if (!isLoggedIn) {
            openAuthModal("login");
            return;
        }

        setError(null);
        setJob(null);
        setIsSubmitting(true);
        clearResult();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const created = await submitOcrAwareMarkup(action, file, query.trim(), mode, language, color);
            setJob(created);
            const completed = await waitForOcrAwareMarkupJob(created.job_id, setJob, controller.signal);
            setJob(completed);
            if (completed.status !== "SUCCEEDED") {
                setError(safeOcrAwareMarkupMessage(completed.error?.code || completed.status));
                return;
            }
            const blob = await downloadOcrAwareMarkup(created.job_id);
            setResultUrl(URL.createObjectURL(blob));
            setResultFile(new File([blob], `${action}-marked.pdf`, { type: "application/pdf" }));
        } catch (cause) {
            if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(errorMessage(cause));
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setIsSubmitting(false);
        }
    }, [action, capabilities, color, file, isLoggedIn, language, mode, openAuthModal, query, clearResult]);

    const cancel = useCallback(async () => {
        abortRef.current?.abort();
        if (job && ["QUEUED", "RUNNING"].includes(job.status)) {
            try {
                const cancelled = await cancelOcrAwareMarkup(job.job_id);
                setJob(cancelled);
            } catch {
                setError("We couldn't cancel this markup job.");
            }
        }
        setIsSubmitting(false);
    }, [job]);

    const startOver = useCallback(() => {
        cancelActiveJobWithoutAwait();
        setFile(null);
        setQuery("");
        setSelection(null);
        setJob(null);
        setError(null);
        setUploadError(null);
        setLanguage("auto");
        setMode("smart");
        setOcrPreview(null);
        setOcrPreviewStatus("idle");
        setOcrPreviewError(null);
        setOcrPreviewKey(null);
        clearResult();
        openFileChooser();
    }, [cancelActiveJobWithoutAwait, clearResult, openFileChooser, setFile]);

    const meta = LABELS[action];
    const Icon = ICONS[action];
    const availableModes = (capabilities?.modes || DEFAULT_MODES).filter((item, index, values) => values.indexOf(item) === index);
    const active = isSubmitting || Boolean(job && ["QUEUED", "RUNNING"].includes(job.status));
    const visibleOcrPreview = isLoggedIn && !isAuthLoading && Boolean(capabilities) ? ocrPreview : null;
    const visibleOcrPreviewStatus = visibleOcrPreview ? ocrPreviewStatus : "idle";
    const disabledReason = isSubmitting
        ? "Processing…"
        : !file
            ? "Choose a PDF first."
            : uploadError
                ? uploadError
                : isLoadingCapabilities
                    ? "Loading available languages…"
                    : !capabilities
                        ? "Languages unavailable."
                        : !query.trim()
                            ? "Select text in the preview or enter a phrase."
                            : isAuthLoading || !isLoggedIn
                                ? "Sign in required."
                                : null;
    const canSubmit = !disabledReason;

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6" data-testid={`markup-v2-${action}`}>
            <div className="text-center">
                <div className="mb-4 flex justify-center"><div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)]"><FileText className="text-[var(--primary)]" /></div></div>
                <h1 className="text-3xl font-bold text-[var(--foreground)]">{meta.title}</h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">Review your PDF, select text visually or find a phrase, then {ACTION_INSTRUCTIONS[action]} with a durable PDF result.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:items-start">
                <div className="space-y-4">
                    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-[var(--foreground)]">Review your document</h2>
                                <p className="mt-1 text-xs text-[var(--muted)]">Check the page and drag across selectable text before you apply a mark.</p>
                            </div>
                            {file && <button type="button" data-testid="markup-v2-choose-another" onClick={openFileChooser} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> Choose another PDF</button>}
                        </div>
                        <div className="mt-4">
                            <MarkupPdfPreview file={file} ocrPreview={visibleOcrPreview} ocrPreviewStatus={visibleOcrPreviewStatus} ocrPreviewError={visibleOcrPreview ? ocrPreviewError : null} activeSelectionText={selection?.source === "ocr" ? selection.text : null} onTextSelected={handleTextSelected} onStateChange={setPreviewState} />
                        </div>
                    </section>
                </div>

                <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6">
                    <div>
                        <h2 className="text-base font-semibold text-[var(--foreground)]">Set up your mark</h2>
                        <p className="mt-1 text-xs text-[var(--muted)]">Choose text in the preview or use Find text for a keyboard-friendly workflow.</p>
                    </div>

                    <div className="block text-sm font-medium text-[var(--foreground)]">
                        <span>PDF document</span>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            {!file && <button type="button" data-testid="markup-v2-choose-pdf" onClick={openFileChooser} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"><FileText size={15} /> Choose PDF</button>}
                            <span className="text-xs font-normal text-[var(--muted)]">Choose a PDF to review before applying a mark.</span>
                        </div>
                        <input ref={fileInputRef} data-testid="markup-v2-file-input" aria-label="Choose a PDF document" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleFileChange} />
                    </div>
                    {file && <div data-testid="markup-v2-selected-file" className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm"><p className="truncate font-semibold text-[var(--foreground)]">{file.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{formatFileSize(file.size)} · PDF selected</p></div>}
                    {uploadError && <p role="alert" data-testid="markup-v2-upload-error" className="text-xs text-red-700 dark:text-red-300">{uploadError}</p>}

                    <label className="block text-sm font-medium text-[var(--foreground)]">
                        <span>Text to {meta.verb.toLowerCase()}</span>
                        <input data-testid="markup-v2-query" aria-label="Text query" value={query} onChange={(event) => { setQuery(event.target.value); setSelection(null); setError(null); }} placeholder="Select text in the preview or enter an exact phrase" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
                    </label>

                    {selection && <div data-testid="markup-v2-selection-summary" className="rounded-xl border border-indigo-300/60 bg-indigo-500/5 px-3 py-3 text-xs text-[var(--muted)]"><p className="font-semibold text-[var(--foreground)]">Selected text</p><p className="mt-1 break-words">“{selection.text}”</p><p className="mt-2">Page {selection.page} · All matching occurrences will be marked.</p></div>}
                    {query.trim() && !selection && <p className="text-xs text-[var(--muted)]">Find text mode marks every matching occurrence of this phrase.</p>}

                    <label className="block text-sm font-medium text-[var(--foreground)]">
                        <span>How should we find the text?</span>
                        <select data-testid="markup-v2-mode" aria-label="How should we find the text?" value={mode} onChange={(event) => setMode(event.target.value as OcrAwareMarkupMode)} disabled={active} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                            {availableModes.map((item) => <option key={item} value={item}>{item === "smart" ? "Smart (recommended)" : item === "ocr" ? "Recognize scanned text" : "Use existing PDF text"}</option>)}
                        </select>
                        <span className="mt-2 block text-xs font-normal text-[var(--muted)]">{mode === "smart" ? "Uses existing PDF text when available and OCR when needed." : mode === "ocr" ? "Finds text in image-based pages with OCR." : "Uses the PDF's existing text layer."}</span>
                    </label>

                    <div className="rounded-xl border border-[var(--border)] p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]"><Languages size={16} className="text-[var(--primary)]" /> Language</div>
                        <p className="mt-1 text-xs text-[var(--muted)]">Detect automatically, or choose languages manually when the document needs guidance.</p>
                        {isLoadingCapabilities ? <p className="mt-3 text-xs text-[var(--muted)]">Loading available languages…</p> : capabilityError ? <div className="mt-3 space-y-3"><p role="alert" className="text-xs text-red-700 dark:text-red-300">{capabilityError}</p><button type="button" data-testid="markup-v2-capability-retry" onClick={() => void loadCapabilities()} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold">Try again</button></div> : <OcrLanguagePicker languages={capabilities?.languages || []} value={language} onChange={handleLanguageChange} disabled={active} />}
                    </div>

                    <label className="block text-sm font-medium text-[var(--foreground)]">Mark color<input aria-label="Mark color" type="color" value={color} onChange={(event) => setColor(event.target.value)} disabled={active} className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" /></label>

                    {!isAuthLoading && !isLoggedIn && <div className="rounded-xl border border-amber-300/60 bg-amber-500/5 px-3 py-3 text-xs text-[var(--muted)]"><p className="flex items-center gap-2 font-semibold text-[var(--foreground)]"><ShieldCheck size={14} /> Sign in to apply a durable mark.</p><button type="button" onClick={() => openAuthModal("login")} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Sign in</button></div>}

                    <div className="flex flex-wrap gap-3">
                        <button data-testid="markup-v2-submit" type="submit" disabled={!canSubmit || active} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}{isSubmitting ? "Processing" : `${meta.verb} text`}</button>
                        {active && <button data-testid="markup-v2-cancel" type="button" onClick={() => void cancel()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold">Cancel processing</button>}
                        <button data-testid="markup-v2-reset" type="button" onClick={startOver} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm"><RotateCcw size={16} /> Start over</button>
                    </div>
                    {disabledReason && <p data-testid="markup-v2-disabled-reason" className="text-xs text-[var(--muted)]">{disabledReason}</p>}

                    {job && <div aria-live="polite" data-testid="markup-v2-job-status" className="rounded-xl border border-[var(--border)] p-3 text-sm"><div className="flex items-center gap-2 font-semibold text-[var(--foreground)]"><span>{statusLabel(job)}</span>{job.status === "SUCCEEDED" && <CheckCircle2 className="text-green-600" size={17} />}</div><p className="mt-1 text-xs text-[var(--muted)]">{job.progress?.completed_pages || 0}/{job.progress?.total_pages || 0} pages · {job.progress?.percent || 0}%</p></div>}
                    {error && <p role="alert" data-testid="markup-v2-error" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">{error}</p>}
                    {resultUrl && resultFile && <section data-testid="markup-v2-result" className="space-y-3 rounded-xl border border-green-300/60 bg-green-500/5 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200"><CheckCircle2 size={16} /> Your marked PDF is ready.</p><div data-testid="markup-v2-result-preview" className="rounded-lg border border-green-300/50 bg-white/50 p-2"><MarkupPdfPreview file={resultFile} readOnly testIdPrefix="markup-result-pdf" /></div><div className="flex flex-wrap gap-2"><a data-testid="markup-v2-download" href={resultUrl} download={`${action}-document.pdf`} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"><Download size={16} /> Download marked PDF</a><button type="button" data-testid="markup-v2-result-replace" onClick={openFileChooser} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Mark another PDF</button></div></section>}
                </form>
            </div>

            {previewState.status === "loading" && <span className="sr-only" role="status">Loading PDF preview</span>}
        </div>
    );
}
