"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clipboard, Download, FileText, Loader2, RotateCcw, ShieldCheck, UploadCloud, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import OcrLanguagePicker from "@/components/tools/OcrLanguagePicker";
import {
    cancelStructuredOcrV2Job, createStructuredOcrV2Job, getStructuredOcrV2Job, getStructuredOcrV2Result,
    getStructuredCapabilities, normalizeStructuredState, safeStructuredMessage, structuredDownloadName,
    type StructuredOcrV2Capabilities, type StructuredOcrV2Job, type StructuredOcrV2Profile, type StructuredOcrV2Result, type StructuredOcrV2RoutingPolicy, type StructuredOcrV2State,
    StructuredOcrV2ApiError,
} from "@/lib/structuredOcrV2";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keyFor(profile: StructuredOcrV2Profile): string { return `pdfnest:ocr-v2:${profile.toLowerCase()}:active-job`; }
function safeError(error: unknown): string { return error instanceof StructuredOcrV2ApiError ? safeStructuredMessage(error.code) : safeStructuredMessage("STRUCTURED_OUTPUT_INVALID"); }
function errorCode(error: unknown): string { return error instanceof StructuredOcrV2ApiError ? error.code : "STRUCTURED_OUTPUT_INVALID"; }
function isJobId(value: unknown): value is string { return typeof value === "string" && JOB_ID_PATTERN.test(value); }
interface Props { profile: StructuredOcrV2Profile; }

export default function StructuredDocumentV2Workspace({ profile }: Props) {
    const { openAuthModal, requireAuth, isAuthenticated, isLoading: authLoading } = useAuth();
    const { file, setFile } = useSharedTool();
    const isMarkdown = profile === "PDF_MARKDOWN_V2";
    const title = isMarkdown ? "PDF to Markdown V2" : "Extract Data from PDF";
    const description = isMarkdown ? "Convert native, scanned, and mixed PDFs into structured GitHub-Flavored Markdown with durable processing." : "Extract structured text, sections, lists, tables, and document content from scanned or digital PDFs.";
    const [capabilities, setCapabilities] = useState<StructuredOcrV2Capabilities | null>(null);
    const [capabilityError, setCapabilityError] = useState<StructuredOcrV2ApiError | null>(null);
    const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
    const [language, setLanguage] = useState("");
    const [routingPolicy, setRoutingPolicy] = useState<StructuredOcrV2RoutingPolicy>("AUTO");
    const [state, setState] = useState<StructuredOcrV2State>(file ? "FILE_READY" : "IDLE");
    const [jobId, setJobId] = useState<string | null>(null);
    const [job, setJob] = useState<StructuredOcrV2Job | null>(null);
    const [result, setResult] = useState<StructuredOcrV2Result | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCodeValue, setErrorCodeValue] = useState<string | null>(null);
    const [resumedFileName, setResumedFileName] = useState("");
    const [copyState, setCopyState] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const loadedResultRef = useRef<string | null>(null);
    const fileName = file?.name || resumedFileName || "your PDF";
    const effectiveState: StructuredOcrV2State = state === "IDLE" && file ? "FILE_READY" : state;
    const active = effectiveState === "SUBMITTING" || effectiveState === "QUEUED" || effectiveState === "RUNNING" || effectiveState === "CANCELLING";
    const languageFallback = effectiveState === "FAILED" && errorCodeValue === "LANGUAGE_DETECTION_UNCERTAIN";
    const languageReady = language !== "" && (!languageFallback || language !== "auto");
    const canSubmit = Boolean(file && isAuthenticated && capabilities && languageReady && (effectiveState === "FILE_READY" || languageFallback));
    const progress = Math.max(0, Math.min(100, job?.progress?.percent || 0));
    const resultText = useMemo(() => result ? (isMarkdown ? result.markdown || "" : JSON.stringify(result, null, 2)) : "", [isMarkdown, result]);

    const loadCapabilities = useCallback(async () => {
        setIsLoadingCapabilities(true);
        setCapabilityError(null);
        try {
            const next = await getStructuredCapabilities();
            const usableLanguages = next.languages.filter((item) => item.code && item.name);
            if (usableLanguages.length === 0) throw new StructuredOcrV2ApiError("UNSUPPORTED_LANGUAGE", "No OCR languages are currently available.", 200);
            setCapabilities({ ...next, languages: usableLanguages });
            setLanguage((current) => {
                if (current === "auto" || current === "") return current || "auto";
                return current.split("+").filter((code) => usableLanguages.some((item) => item.code === code)).join("+");
            });
        } catch (loadError) {
            setCapabilities(null);
            setCapabilityError(loadError instanceof StructuredOcrV2ApiError ? loadError : new StructuredOcrV2ApiError("TASK_STORAGE_UNAVAILABLE", safeStructuredMessage("TASK_STORAGE_UNAVAILABLE"), 0));
        } finally {
            setIsLoadingCapabilities(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;
        const timer = window.setTimeout(() => { void loadCapabilities(); }, 0);
        return () => window.clearTimeout(timer);
    }, [authLoading, loadCapabilities]);

    useEffect(() => {
        if (file || jobId || typeof window === "undefined") return;
        try {
            const stored = JSON.parse(window.localStorage.getItem(keyFor(profile)) || "null") as { jobId?: unknown; fileName?: unknown; language?: unknown; routingPolicy?: unknown } | null;
            if (!stored || !isJobId(stored.jobId)) return;
            const timer = window.setTimeout(() => {
                setJobId(stored.jobId as string);
                setResumedFileName(typeof stored.fileName === "string" ? stored.fileName : "");
                setLanguage(typeof stored.language === "string" ? stored.language : "eng");
                if (stored.routingPolicy === "AUTO" || stored.routingPolicy === "FAST" || stored.routingPolicy === "QUALITY") setRoutingPolicy(stored.routingPolicy);
                setState("QUEUED");
            }, 0);
            return () => window.clearTimeout(timer);
        } catch { /* optional resume state */ }
    }, [file, jobId, profile]);

    useEffect(() => {
        if (!jobId || !active || !isAuthenticated) return;
        let mounted = true;
        let timer: number | undefined;
        const poll = async () => {
            try {
                const next = await getStructuredOcrV2Job(profile, jobId);
                if (!mounted) return;
                setJob(next);
                const nextState = normalizeStructuredState(next.status);
                if (nextState === "SUCCEEDED") {
                    if (loadedResultRef.current !== jobId) {
                        const structuredResult = await getStructuredOcrV2Result(profile, jobId);
                        if (!mounted) return;
                        loadedResultRef.current = jobId;
                        setResult(structuredResult);
                    }
                    setState("SUCCEEDED");
                    return;
                }
                if (nextState === "FAILED" || nextState === "CANCELLED") {
                    setState(nextState);
                    const nextErrorCode = next.error?.code || (nextState === "CANCELLED" ? "CANCELLED" : "STRUCTURED_OUTPUT_INVALID");
                    setErrorCodeValue(nextErrorCode);
                    if (nextErrorCode === "LANGUAGE_DETECTION_UNCERTAIN") setLanguage("");
                    setError(safeStructuredMessage(nextErrorCode));
                    return;
                }
                setState(nextState === "CANCELLING" ? "CANCELLING" : nextState);
                timer = window.setTimeout(poll, nextState === "QUEUED" ? 2000 : 1500);
            } catch (pollError) {
                if (!mounted) return;
                setState("FAILED"); setErrorCodeValue(errorCode(pollError)); setError(safeError(pollError));
            }
        };
        void poll();
        return () => { mounted = false; if (timer !== undefined) window.clearTimeout(timer); };
    }, [active, isAuthenticated, jobId, profile]);

    const chooseFile = (next: File | null) => {
        if (!next) return;
        if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) { setError("Choose a PDF file to continue."); return; }
        setFile(next); setState("FILE_READY"); setError(null); setResult(null); setJob(null); setJobId(null); setResumedFileName("");
    };

    const submit = useCallback(async () => {
        if (!file || !canSubmit) return;
        setState("SUBMITTING"); setError(null); setErrorCodeValue(null); setResult(null); setJob(null); loadedResultRef.current = null;
        const requestId = crypto.randomUUID(); const idempotencyKey = crypto.randomUUID();
        try {
            const created = await createStructuredOcrV2Job(file, profile, language, routingPolicy, idempotencyKey, requestId);
            if (!isJobId(created.job_id)) throw new StructuredOcrV2ApiError("STRUCTURED_OUTPUT_INVALID", "The service returned an invalid job reference.", 502);
            setJobId(created.job_id); setJob(created); setState(normalizeStructuredState(created.status));
            window.localStorage.setItem(keyFor(profile), JSON.stringify({ jobId: created.job_id, fileName: file.name, language, routingPolicy }));
        } catch (submitError) { setState("FAILED"); setErrorCodeValue(errorCode(submitError)); setError(safeError(submitError)); }
    }, [canSubmit, file, language, profile, routingPolicy]);

    const reset = useCallback(() => {
        try { window.localStorage.removeItem(keyFor(profile)); } catch { /* optional */ }
        setJobId(null); setJob(null); setResult(null); setError(null); setErrorCodeValue(null); setResumedFileName(""); setState("IDLE"); setFile(null);
    }, [profile, setFile]);

    const cancel = async () => {
        if (!jobId || (state !== "QUEUED" && state !== "RUNNING")) return;
        setState("CANCELLING");
        try { setJob(await cancelStructuredOcrV2Job(profile, jobId)); } catch (cancelError) { setError(safeError(cancelError)); }
    };

    const download = () => {
        if (!result) return;
        const blob = new Blob([resultText], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = structuredDownloadName(fileName, profile); anchor.click(); URL.revokeObjectURL(url);
    };

    const copy = async () => { if (!resultText) return; try { await navigator.clipboard.writeText(resultText); setCopyState(true); window.setTimeout(() => setCopyState(false), 1800); } catch { setError("Copy was blocked by the browser. Select the result and copy it manually."); } };

    return <>
        <PdfToolHero title={title} description={description} />
        <div className="mx-auto mt-10 max-w-5xl space-y-6">
            <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-lg sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500"><FileText size={22} /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-[color:var(--foreground)]">{fileName}</p><p className="mt-1 text-xs text-[color:var(--muted)]">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF` : jobId ? "Resuming a durable structured job" : "PDF input"}</p></div></div>
                    {(file || jobId) && state !== "SUCCEEDED" && <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> New document</button>}
                </div>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={event => chooseFile(event.target.files?.[0] || null)} />
                {!file && !jobId && <button type="button" onClick={() => inputRef.current?.click()} className="mt-7 w-full rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-8 text-center"><UploadCloud className="mx-auto text-indigo-500" size={28} /><span className="mt-3 block text-sm font-semibold">{isMarkdown ? "Choose a PDF to convert" : "Choose a PDF to extract data"}</span><span className="mt-1 block text-xs text-[color:var(--muted)]">Native pages stay native; scanned pages use the available structured OCR path.</span></button>}
                {file && !active && !result && <div className="mt-7 grid gap-5 sm:grid-cols-2"><div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><div className="text-sm font-bold">Language</div><p className="mt-1 text-xs text-[color:var(--muted)]">We’ll detect the document language automatically, or you can choose it yourself.</p>{authLoading || isLoadingCapabilities ? <div className="mt-5 flex items-center gap-2 text-sm text-[color:var(--muted)]"><Loader2 className="animate-spin" size={16} /> Loading available languages…</div> : capabilityError ? <div className="mt-5 space-y-3"><p className="text-xs text-rose-600">{capabilityError.status === 401 || capabilityError.status === 403 ? (isMarkdown ? "Sign in to convert this document." : "Sign in to extract document data.") : capabilityError.status === 0 ? "We couldn't connect to the processing service." : "We couldn't load the available languages."}</p>{capabilityError.status === 401 || capabilityError.status === 403 ? <button type="button" onClick={() => openAuthModal("login")} className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 px-3 py-2 text-xs font-semibold text-indigo-600"><ShieldCheck size={14} /> Sign in</button> : <button type="button" onClick={() => void loadCapabilities()} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> Try again</button>}</div> : !isAuthenticated ? <div className="mt-5 space-y-3"><p className="text-sm font-semibold text-rose-600">{isMarkdown ? "Sign in to convert this document." : "Sign in to extract document data."}</p><button type="button" onClick={() => openAuthModal("login")} className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 px-3 py-2 text-xs font-semibold text-indigo-600"><ShieldCheck size={14} /> Sign in</button></div> : <OcrLanguagePicker languages={capabilities?.languages || []} value={language} onChange={setLanguage} disabled={!capabilities || active} />}</div><div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-emerald-500" /> Processing mode</div><p className="mt-1 block text-xs text-[color:var(--muted)]">Choose how you want the document handled. The service selects the best available method for each page.</p><div className="mt-5 grid gap-2">{(capabilities?.routing_modes || []).filter((mode) => mode.id === "AUTO" || mode.id === "FAST" || mode.id === "QUALITY").map((mode) => { const label = mode.id === "AUTO" ? "Automatic" : mode.id === "FAST" ? "Fast" : "Best quality"; const description = mode.id === "AUTO" ? "Automatically chooses the best available method for each page." : mode.id === "FAST" ? "Prioritizes a quicker standard extraction path." : "Uses the enhanced extraction path when available."; return <button key={mode.id} type="button" disabled={!mode.available || active} onClick={() => setRoutingPolicy(mode.id)} className={`rounded-xl border px-3 py-3 text-left transition ${routingPolicy === mode.id ? "border-indigo-500 bg-indigo-500/10" : "border-[color:var(--border)] hover:border-indigo-400"} disabled:cursor-not-allowed disabled:opacity-50`}><span className="flex items-center justify-between text-sm font-semibold"><span>{label}{mode.id === "AUTO" && <span className="ml-1 text-xs font-normal text-emerald-600">Recommended</span>}</span>{routingPolicy === mode.id && <CheckCircle2 size={15} className="text-indigo-500" />}</span><span className="mt-1 block text-xs text-[color:var(--muted)]">{description}{!mode.available && " Not currently available."}</span></button>; })}</div></div></div>}
                {file && !active && !result && (effectiveState === "FILE_READY" || languageFallback) && <div className="mt-6 flex flex-col gap-3"><button type="button" onClick={() => requireAuth(() => { if (!authLoading && isAuthenticated) void submit(); })} disabled={!canSubmit || authLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} /> {isMarkdown ? "Convert to Markdown" : "Extract data"}</button>{!canSubmit && <p className="text-center text-xs font-semibold text-amber-600" role="status">{!isAuthenticated ? "Sign in required" : !capabilities ? "Languages unavailable" : !languageReady ? "Choose at least one language" : "Choose a PDF first"}</p>}</div>}
                {active && <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5" role="status" aria-live="polite"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{state === "QUEUED" ? "Waiting to start" : state === "CANCELLING" ? "Cancelling processing" : "Processing your document"}</p><p className="mt-1 text-xs text-[color:var(--muted)]">The durable server job is authoritative.</p></div>{(state === "QUEUED" || state === "RUNNING") && <button type="button" onClick={() => void cancel()} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-600"><XCircle size={15} /> Cancel</button>}</div><div className="mt-5"><div className="flex justify-between text-xs font-semibold"><span>{job?.progress ? `${job.progress.completed_pages} of ${job.progress.total_pages} pages complete` : "Preparing page progress"}</span><span>{job ? `${progress}%` : ""}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[color:var(--border)]"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div></div></div>}
                {(state === "FAILED" || state === "CANCELLED") && <div className="mt-7 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5" role="alert"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 text-rose-600" size={18} /><div><p className="text-sm font-bold">Processing could not finish</p><p className="mt-1 text-sm text-[color:var(--muted)]">{error || safeStructuredMessage(errorCodeValue || "STRUCTURED_OUTPUT_INVALID")}</p></div></div><button type="button" onClick={() => file ? setState("FILE_READY") : reset()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> Try again</button></div>}
            </section>
            {result && state === "SUCCEEDED" && <section className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-lg"><div className="flex flex-col gap-3 border-b border-[color:var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-500" size={22} /><div><h2 className="text-lg font-bold">{isMarkdown ? "Your Markdown result" : "Your structured document result"}</h2><p className="mt-1 text-xs text-[color:var(--muted)]">{result.pages.length} page{result.pages.length === 1 ? "" : "s"} · {result.schema_version}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><Clipboard size={14} /> {copyState ? "Copied" : "Copy"}</button><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Download size={14} /> Download {isMarkdown ? ".md" : ".json"}</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> New document</button></div></div>{result.warnings.length > 0 && <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-4 text-xs text-amber-800 dark:text-amber-200">{result.warnings.join(" · ")}</div>}<pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words bg-[var(--background)] p-5 text-sm leading-7">{resultText}</pre></section>}
            {!isAuthenticated && !authLoading && <p className="text-center text-xs text-[color:var(--muted)]">Sign in is required before the durable job can be submitted.</p>}
        </div>
    </>;
}
