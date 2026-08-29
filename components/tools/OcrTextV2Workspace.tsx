"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Clipboard,
    Download,
    FileText,
    Languages,
    Loader2,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    UploadCloud,
    XCircle,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import {
    cancelOcrTextV2Job,
    createOcrTextV2Job,
    getOcrTextV2Capabilities,
    getOcrTextV2Job,
    getOcrTextV2Result,
    normalizeOcrTextV2State,
    OcrTextV2ApiError,
    type OcrTextV2Capabilities,
    type OcrTextV2JobStatus,
    type OcrTextV2Result,
    type OcrTextV2RoutingPolicy,
    type OcrTextV2State,
    safeDownloadFilename,
    safeMessageForCode,
    warningMessage,
} from "@/lib/ocrV2";

const RESUME_STORAGE_KEY = "pdfnest:ocr-text-v2:active-job";
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredOcrJob {
    jobId: string;
    fileName: string;
    language: string;
    routingPolicy: OcrTextV2RoutingPolicy;
}

function isJobId(value: string | null): value is string {
    return Boolean(value && JOB_ID_PATTERN.test(value));
}

function readStoredJob(): StoredOcrJob | null {
    if (typeof window === "undefined") return null;
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(RESUME_STORAGE_KEY) || "null");
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<StoredOcrJob>;
        if (typeof candidate.jobId !== "string" || !isJobId(candidate.jobId) || typeof candidate.fileName !== "string" || typeof candidate.language !== "string") return null;
        const routingPolicy = candidate.routingPolicy;
        if (routingPolicy !== "AUTO" && routingPolicy !== "FAST" && routingPolicy !== "QUALITY") return null;
        return { jobId: candidate.jobId, fileName: candidate.fileName, language: candidate.language, routingPolicy };
    } catch {
        return null;
    }
}

function saveStoredJob(job: StoredOcrJob): void {
    try {
        window.localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(job));
    } catch {
        // Resume is a convenience; a storage quota/privacy failure must not break the job.
    }
}

function displayError(error: unknown): string {
    if (error instanceof OcrTextV2ApiError) return error.message || safeMessageForCode(error.code);
    return "OCR could not complete this request. Please try again.";
}

function errorCode(error: unknown): string {
    return error instanceof OcrTextV2ApiError ? error.code : "ENGINE_FAILURE";
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function percentFor(job: OcrTextV2JobStatus | null): number {
    const percent = job?.progress?.percent;
    return typeof percent === "number" ? Math.max(0, Math.min(100, percent)) : 0;
}

function statusLabel(state: OcrTextV2State): string {
    switch (state) {
        case "IDLE": return "Ready when you are";
        case "FILE_READY": return "PDF ready to process";
        case "SUBMITTING": return "Starting OCR";
        case "QUEUED": return "Waiting to start";
        case "RUNNING": return "Processing your PDF";
        case "SUCCEEDED": return "Text extraction complete";
        case "FAILED": return "OCR could not finish";
        case "CANCELLING": return "Cancelling OCR";
        case "CANCELLED": return "OCR cancelled";
    }
}

export default function OcrTextV2Workspace() {
    const { requireAuth, isAuthenticated, isLoading: isAuthLoading } = useAuth();
    const { file, setFile, toolId } = useSharedTool();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [capabilities, setCapabilities] = useState<OcrTextV2Capabilities | null>(null);
    const [capabilityError, setCapabilityError] = useState<string | null>(null);
    const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
    const [language, setLanguage] = useState("");
    const [routingPolicy, setRoutingPolicy] = useState<OcrTextV2RoutingPolicy>("AUTO");
    const [state, setState] = useState<OcrTextV2State>(file ? "FILE_READY" : "IDLE");
    const [jobId, setJobId] = useState<string | null>(null);
    const [job, setJob] = useState<OcrTextV2JobStatus | null>(null);
    const [result, setResult] = useState<OcrTextV2Result | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCodeValue, setErrorCodeValue] = useState<string | null>(null);
    const [selectedPage, setSelectedPage] = useState(0);
    const [copyState, setCopyState] = useState<"idle" | "all" | "page">("idle");
    const [isDownloading, setIsDownloading] = useState(false);
    const [resumedFileName, setResumedFileName] = useState("");
    const resultLoadedForRef = useRef<string | null>(null);
    const pollFailureCountRef = useRef(0);

    const fileName = file?.name || resumedFileName || "your PDF";
    const active = state === "SUBMITTING" || state === "QUEUED" || state === "RUNNING" || state === "CANCELLING";
    const canSubmit = Boolean(file && language && capabilities && state === "FILE_READY");
    const selectedLanguageName = useMemo(
        () => capabilities?.languages.find((item) => item.code === language)?.name || language,
        [capabilities, language]
    );
    const selectedPageResult = result?.pages[selectedPage] || null;

    const loadCapabilities = useCallback(async () => {
        if (!isAuthenticated) return;
        setIsLoadingCapabilities(true);
        setCapabilityError(null);
        try {
            const next = await getOcrTextV2Capabilities();
            const usableLanguages = next.languages.filter((item) => item.code && item.name);
            if (usableLanguages.length === 0) {
                throw new OcrTextV2ApiError("UNSUPPORTED_LANGUAGE", "No OCR languages are currently available.", 200);
            }
            setCapabilities({ ...next, languages: usableLanguages });
            setLanguage((current) => current && usableLanguages.some((item) => item.code === current) ? current : "");
        } catch (loadError) {
            setCapabilities(null);
            setCapabilityError(displayError(loadError));
        } finally {
            setIsLoadingCapabilities(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated) return;
        const timer = window.setTimeout(() => { void loadCapabilities(); }, 0);
        return () => window.clearTimeout(timer);
    }, [isAuthLoading, isAuthenticated, loadCapabilities]);

    useEffect(() => {
        if (jobId || file) return;
        const queryJobId = searchParams.get("job_id");
        const stored = readStoredJob();
        const candidate = isJobId(queryJobId) ? queryJobId : stored?.jobId;
        if (!candidate) return;
        const timer = window.setTimeout(() => {
            setJobId(candidate);
            setState("QUEUED");
            if (stored) {
                setResumedFileName(stored.fileName);
                setLanguage(stored.language);
                setRoutingPolicy(stored.routingPolicy);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [file, jobId, searchParams]);

    useEffect(() => {
        if (!jobId || !active) return;
        let mounted = true;
        let timer: number | undefined;
        let interval = 1500;
        pollFailureCountRef.current = 0;

        const schedule = () => {
            if (mounted) timer = window.setTimeout(poll, interval);
        };

        const loadResult = async () => {
            if (!mounted || resultLoadedForRef.current === jobId) return;
            try {
                const nextResult = await getOcrTextV2Result(jobId);
                if (!mounted) return;
                resultLoadedForRef.current = jobId;
                setResult(nextResult);
                setSelectedPage(0);
                setState("SUCCEEDED");
                setError(null);
            } catch (resultError) {
                if (!mounted) return;
                setState("FAILED");
                setError(displayError(resultError));
            }
        };

        const poll = async () => {
            try {
                const nextJob = await getOcrTextV2Job(jobId);
                if (!mounted) return;
                pollFailureCountRef.current = 0;
                setJob(nextJob);
                const nextState = normalizeOcrTextV2State(nextJob.status);
                if (nextState === "SUCCEEDED") {
                    await loadResult();
                    return;
                }
                if (nextState === "FAILED" || nextState === "CANCELLED") {
                    setState(nextState);
                    setErrorCodeValue(nextJob.error?.code || (nextState === "CANCELLED" ? "CANCELLED" : "ENGINE_FAILURE"));
                    setError(nextJob.error?.message || (nextState === "CANCELLED" ? safeMessageForCode("CANCELLED") : safeMessageForCode("ENGINE_FAILURE")));
                    return;
                }
                setState(state === "CANCELLING" ? "CANCELLING" : nextState);
                interval = nextState === "QUEUED" ? 2000 : 1500;
                schedule();
            } catch (pollError) {
                if (!mounted) return;
                pollFailureCountRef.current += 1;
                if (pollFailureCountRef.current >= 5) {
                    setState("FAILED");
                    setErrorCodeValue(errorCode(pollError));
                    setError(displayError(pollError));
                    return;
                }
                interval = Math.min(interval * 2, 8000);
                schedule();
            }
        };

        void poll();
        return () => {
            mounted = false;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [active, jobId, state]);

    const persistResume = useCallback((nextJobId: string) => {
        saveStoredJob({
            jobId: nextJobId,
            fileName,
            language,
            routingPolicy,
        });
    }, [fileName, language, routingPolicy]);

    const submit = useCallback(async () => {
        if (!file || !language || !capabilities || !canSubmit) return;
        setState("SUBMITTING");
        setError(null);
        setErrorCodeValue(null);
        setResult(null);
        setJob(null);
        resultLoadedForRef.current = null;
        const requestId = crypto.randomUUID();
        const idempotencyKey = crypto.randomUUID();

        try {
            let response: OcrTextV2JobStatus | null = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    response = await createOcrTextV2Job(file, language, routingPolicy, idempotencyKey, requestId);
                    break;
                } catch (submitError) {
                    const retryable = submitError instanceof OcrTextV2ApiError && (submitError.status === 0 || submitError.status >= 500 || submitError.status === 409);
                    if (!retryable || attempt === 2) throw submitError;
                    await wait(submitError.status === 409 ? 1200 : 800 * (attempt + 1));
                }
            }
            if (!response || !isJobId(response.job_id)) throw new OcrTextV2ApiError("INVALID_ENGINE_OUTPUT", "The OCR service returned an invalid job reference.", 502);
            setJobId(response.job_id);
            setJob(response);
            setState(normalizeOcrTextV2State(response.status));
            persistResume(response.job_id);
            router.replace(`/${toolId}/workspace?job_id=${encodeURIComponent(response.job_id)}`);
        } catch (submitError) {
            setState("FAILED");
            setErrorCodeValue(errorCode(submitError));
            setError(displayError(submitError));
        }
    }, [canSubmit, capabilities, file, language, persistResume, routingPolicy, router, toolId]);

    const handleSubmit = () => {
        requireAuth(() => { void submit(); });
    };

    const cancel = useCallback(async () => {
        if (!jobId || (state !== "QUEUED" && state !== "RUNNING")) return;
        setState("CANCELLING");
        setError(null);
        try {
            const nextJob = await cancelOcrTextV2Job(jobId);
            setJob(nextJob);
            const nextState = normalizeOcrTextV2State(nextJob.status);
            setState(nextState === "QUEUED" || nextState === "RUNNING" ? "CANCELLING" : nextState);
            if (nextState === "CANCELLED") setError(safeMessageForCode("CANCELLED"));
        } catch (cancelError) {
            setState(job?.status ? normalizeOcrTextV2State(job.status) : "RUNNING");
            setErrorCodeValue(errorCode(cancelError));
            setError(displayError(cancelError));
        }
    }, [job, jobId, state]);

    const reset = useCallback(() => {
        try { window.localStorage.removeItem(RESUME_STORAGE_KEY); } catch { /* optional browser storage */ }
        setJobId(null);
        setJob(null);
        setResult(null);
        setError(null);
        setErrorCodeValue(null);
        setState("IDLE");
        setSelectedPage(0);
        setCopyState("idle");
        setResumedFileName("");
        resultLoadedForRef.current = null;
        setFile(null);
        router.push(`/${toolId}`);
    }, [router, setFile, toolId]);

    const copyText = useCallback(async (text: string, scope: "all" | "page") => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyState(scope);
            window.setTimeout(() => setCopyState("idle"), 1800);
        } catch {
            setError("Copy was blocked by the browser. Select the text and copy it manually.");
        }
    }, []);

    const downloadText = useCallback(() => {
        if (!result) return;
        setIsDownloading(true);
        try {
            const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = safeDownloadFilename(fileName);
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } finally {
            setIsDownloading(false);
        }
    }, [fileName, result]);

    const progress = percentFor(job);
    const totalPages = job?.progress?.total_pages || result?.pages.length || 0;
    const completedPages = job?.progress?.completed_pages || (result ? result.pages.length : 0);
    const failedPages = job?.progress?.failed_pages || [];
    const routingModes = capabilities?.routing_modes.filter((mode) => mode.id === "AUTO" || mode.id === "FAST" || mode.id === "QUALITY") || [];

    return (
        <>
            <PdfToolHero
                title="OCR Text V2"
                description="Turn scanned or native PDFs into trustworthy, copyable plain text with durable page-by-page progress."
            />

            <div className="mx-auto mt-10 max-w-5xl space-y-6">
                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-lg sm:p-8">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                                    <FileText size={22} />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[color:var(--foreground)]">{fileName}</p>
                                    {file && <p className="mt-1 text-xs text-[color:var(--muted)]">{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</p>}
                                    {!file && jobId && <p className="mt-1 text-xs text-[color:var(--muted)]">Resuming a durable OCR job</p>}
                                </div>
                            </div>
                        </div>
                        {(file || jobId) && state !== "SUCCEEDED" && (
                            <button type="button" onClick={reset} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)] transition hover:border-indigo-500">
                                <RotateCcw size={14} /> New document
                            </button>
                        )}
                    </div>

                    {!file && !jobId && (
                        <div className="mt-7 rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-7 text-center">
                            <UploadCloud className="mx-auto text-indigo-500" size={28} />
                            <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">Choose a PDF to start OCR Text V2</p>
                            <Link href={`/${toolId}`} className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">Choose PDF</Link>
                        </div>
                    )}

                    {jobId && !file && active && (
                        <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5" role="status" aria-live="polite">
                            <div className="flex items-center gap-3 text-sm font-semibold text-[color:var(--foreground)]"><Loader2 className="animate-spin text-indigo-500" size={18} /> Restoring your OCR job…</div>
                            <p className="mt-2 text-xs text-[color:var(--muted)]">The server status is authoritative. Your PDF bytes were not saved in the browser.</p>
                        </div>
                    )}

                    {file && !active && !result && (
                        <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1fr]">
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5">
                                <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]"><Languages size={17} className="text-indigo-500" /> Language</div>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">Choose the language pack used for this document. Automatic detection is not available in this product.</p>
                                {isAuthLoading || isLoadingCapabilities ? (
                                    <div className="mt-5 flex items-center gap-2 text-sm text-[color:var(--muted)]"><Loader2 className="animate-spin" size={16} /> Loading available languages…</div>
                                ) : !isAuthenticated ? (
                                    <button type="button" onClick={() => requireAuth(() => { void loadCapabilities(); })} className="mt-5 w-full rounded-xl border border-indigo-500/40 px-4 py-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-500/10">Sign in to load languages</button>
                                ) : capabilityError ? (
                                    <div className="mt-5 space-y-3"><p className="text-xs text-rose-600">{capabilityError}</p><button type="button" onClick={() => void loadCapabilities()} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> Try again</button></div>
                                ) : (
                                    <select aria-label="OCR language" value={language} onChange={(event) => setLanguage(event.target.value)} disabled={!capabilities || active} className="mt-5 w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-3 text-sm text-[color:var(--foreground)] outline-none focus:border-indigo-500">
                                        <option value="">Select a language</option>
                                        {capabilities?.languages.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5">
                                <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]"><ShieldCheck size={17} className="text-emerald-500" /> Processing preference</div>
                                <p className="mt-1 text-xs text-[color:var(--muted)]">Choose a user-facing goal. The server selects the actual available engine.</p>
                                <div className="mt-5 grid gap-2">
                                    {routingModes.map((mode) => (
                                        <button key={mode.id} type="button" disabled={!mode.available || active} onClick={() => setRoutingPolicy(mode.id)} className={`rounded-xl border px-3 py-3 text-left transition ${routingPolicy === mode.id ? "border-indigo-500 bg-indigo-500/10" : "border-[color:var(--border)] hover:border-indigo-400"} disabled:cursor-not-allowed disabled:opacity-50`}>
                                            <span className="flex items-center justify-between text-sm font-semibold text-[color:var(--foreground)]"><span>{mode.label}</span>{routingPolicy === mode.id && <Check size={15} className="text-indigo-500" />}</span>
                                            <span className="mt-1 block text-xs text-[color:var(--muted)]">{mode.description}{mode.id === "QUALITY" && !mode.available ? " Not currently available." : ""}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {file && !active && !result && state === "FILE_READY" && (
                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-[color:var(--muted)]">The backend will validate the PDF, page limit, language, and processing eligibility before queueing it.</p>
                            <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} /> Start OCR</button>
                        </div>
                    )}

                    {active && (
                        <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5" role="status" aria-live="polite">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div><p className="text-sm font-bold text-[color:var(--foreground)]">{statusLabel(state)}</p><p className="mt-1 text-xs text-[color:var(--muted)]">{state === "QUEUED" ? "Your document is safely queued. Processing has not started yet." : state === "CANCELLING" ? "The worker will finish its current safe boundary before marking the job cancelled." : `Using ${selectedLanguageName || "the selected language"}.`}</p></div>
                                {(state === "QUEUED" || state === "RUNNING") && <button type="button" onClick={() => void cancel()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10"><XCircle size={15} /> Cancel</button>}
                                {state === "CANCELLING" && <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-600"><Loader2 className="animate-spin" size={15} /> Cancelling…</span>}
                            </div>
                            <div className="mt-5" role="progressbar" aria-label="OCR page progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                                <div className="flex items-center justify-between text-xs font-semibold text-[color:var(--muted)]"><span>{totalPages ? `${completedPages} of ${totalPages} pages complete` : "Preparing page progress…"}</span><span>{totalPages ? `${progress}%` : ""}</span></div>
                                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[color:var(--border)]">{totalPages ? <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-600" />}</div>
                                {job?.progress?.current_page !== undefined && state === "RUNNING" && <p className="mt-3 text-xs text-[color:var(--muted)]">Working on page {job.progress.current_page + 1}{totalPages ? ` of ${totalPages}` : ""}.</p>}
                                {failedPages.length > 0 && <p className="mt-2 text-xs text-rose-600">{failedPages.length} page{failedPages.length === 1 ? "" : "s"} reported a failure.</p>}
                            </div>
                        </div>
                    )}

                    {(state === "FAILED" || state === "CANCELLED") && !result && (
                        <div className="mt-7 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5" role="alert">
                            <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0 text-rose-600" size={18} /><div><p className="text-sm font-bold text-[color:var(--foreground)]">{statusLabel(state)}</p><p className="mt-1 text-sm text-[color:var(--muted)]">{error || (state === "CANCELLED" ? safeMessageForCode("CANCELLED") : safeMessageForCode("ENGINE_FAILURE"))}</p>{errorCodeValue === "UNSUPPORTED_LANGUAGE" && <p className="mt-2 text-xs text-[color:var(--muted)]">Choose another available language and start a new run.</p>}</div></div>
                            <button type="button" onClick={() => file ? setState("FILE_READY") : reset()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--foreground)]"><RefreshCw size={14} /> {file ? "Try again" : "Choose another PDF"}</button>
                        </div>
                    )}
                </section>

                {result && state === "SUCCEEDED" && (
                    <section className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-lg">
                        <div className="flex flex-col gap-4 border-b border-[color:var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                            <div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-500" size={22} /><div><h2 className="text-lg font-bold text-[color:var(--foreground)]">Your extracted text</h2><p className="mt-1 text-xs text-[color:var(--muted)]">{result.pages.length} page{result.pages.length === 1 ? "" : "s"} · {selectedLanguageName || "Selected language"}</p></div></div>
                            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyText(result.text, "all")} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold transition hover:border-indigo-500"><Clipboard size={14} /> {copyState === "all" ? "Copied" : "Copy all"}</button><button type="button" onClick={downloadText} disabled={isDownloading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"><Download size={14} /> Download .txt</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold transition hover:border-indigo-500"><RotateCcw size={14} /> New document</button></div>
                        </div>
                        {((result.warnings?.length ?? 0) > 0 || (job?.warnings?.length ?? 0) > 0) && <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-4 sm:px-6"><p className="text-xs font-bold text-amber-800 dark:text-amber-200">Processing notes</p><ul className="mt-2 space-y-1 text-xs text-amber-800/90 dark:text-amber-200/80">{Array.from(new Set([...(result.warnings || []), ...(job?.warnings || [])])).map((warning) => <li key={warning}>{warningMessage(warning)}</li>)}</ul></div>}
                        <div className="grid min-h-[420px] lg:grid-cols-[220px_1fr]">
                            <nav aria-label="OCR result pages" className="border-b border-[color:var(--border)] p-3 lg:border-b-0 lg:border-r"><p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Pages</p><div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">{result.pages.map((page, index) => <button key={page.page_id || page.page_index} type="button" onClick={() => setSelectedPage(index)} aria-current={selectedPage === index ? "page" : undefined} className={`min-w-[110px] rounded-xl px-3 py-2 text-left text-xs transition lg:w-full ${selectedPage === index ? "bg-indigo-500/10 font-bold text-indigo-700 dark:text-indigo-300" : "text-[color:var(--muted)] hover:bg-[color:var(--background)]"}`}><span className="block">Page {page.page_index + 1}</span><span className="mt-1 block truncate text-[10px] opacity-75">{page.text.trim() ? `${page.text.trim().slice(0, 34)}${page.text.trim().length > 34 ? "…" : ""}` : "No text detected"}</span></button>)}</div></nav>
                            <div className="flex min-w-0 flex-col p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-[color:var(--foreground)]">Page {(selectedPageResult?.page_index ?? selectedPage) + 1}</p><p className="mt-1 text-xs text-[color:var(--muted)]">{selectedPageResult?.text.trim() ? "Extracted text" : "This page contains no extracted text."}</p></div>{selectedPageResult && <button type="button" onClick={() => void copyText(selectedPageResult.text, "page")} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold transition hover:border-indigo-500"><Clipboard size={14} /> {copyState === "page" ? "Copied" : "Copy page"}</button>}</div><pre className="mt-5 min-h-[320px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-5 text-sm leading-7 text-[color:var(--foreground)]">{selectedPageResult?.text || ""}</pre></div>
                        </div>
                    </section>
                )}
            </div>
        </>
    );
}
