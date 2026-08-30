"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clipboard, Download, FileText, RotateCcw, ShieldCheck, UploadCloud, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import {
    cancelStructuredOcrV2Job, createStructuredOcrV2Job, getStructuredOcrV2Job, getStructuredOcrV2Result,
    normalizeStructuredState, safeStructuredMessage, structuredDownloadName,
    type StructuredOcrV2Job, type StructuredOcrV2Profile, type StructuredOcrV2Result, type StructuredOcrV2RoutingPolicy, type StructuredOcrV2State,
    StructuredOcrV2ApiError,
} from "@/lib/structuredOcrV2";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keyFor(profile: StructuredOcrV2Profile): string { return `pdfnest:ocr-v2:${profile.toLowerCase()}:active-job`; }
function safeError(error: unknown): string { return error instanceof StructuredOcrV2ApiError ? error.message : safeStructuredMessage("STRUCTURED_OUTPUT_INVALID"); }
function errorCode(error: unknown): string { return error instanceof StructuredOcrV2ApiError ? error.code : "STRUCTURED_OUTPUT_INVALID"; }
function isJobId(value: unknown): value is string { return typeof value === "string" && JOB_ID_PATTERN.test(value); }
interface Props { profile: StructuredOcrV2Profile; }

export default function StructuredDocumentV2Workspace({ profile }: Props) {
    const { requireAuth, isAuthenticated, isLoading: authLoading } = useAuth();
    const { file, setFile } = useSharedTool();
    const isMarkdown = profile === "PDF_MARKDOWN_V2";
    const title = isMarkdown ? "PDF to Markdown V2" : "Document Extraction V2";
    const description = isMarkdown ? "Convert native, scanned, and mixed PDFs into structured GitHub-Flavored Markdown with durable processing." : "Extract a trustworthy structured document result from native, scanned, and mixed PDFs with durable page progress.";
    const [language, setLanguage] = useState("eng");
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
    const canSubmit = Boolean(file && language && effectiveState === "FILE_READY");
    const progress = Math.max(0, Math.min(100, job?.progress?.percent || 0));
    const resultText = useMemo(() => result ? (isMarkdown ? result.markdown || "" : JSON.stringify(result, null, 2)) : "", [isMarkdown, result]);

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
                    setErrorCodeValue(next.error?.code || (nextState === "CANCELLED" ? "CANCELLED" : "STRUCTURED_OUTPUT_INVALID"));
                    setError(next.error?.message || safeStructuredMessage(nextState === "CANCELLED" ? "CANCELLED" : "STRUCTURED_OUTPUT_INVALID"));
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
                {!file && !jobId && <button type="button" onClick={() => inputRef.current?.click()} className="mt-7 w-full rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-8 text-center"><UploadCloud className="mx-auto text-indigo-500" size={28} /><span className="mt-3 block text-sm font-semibold">Choose a PDF to start</span><span className="mt-1 block text-xs text-[color:var(--muted)]">Native pages stay native; scanned pages use the available OCR path.</span></button>}
                {file && !active && !result && <div className="mt-7 grid gap-5 sm:grid-cols-2"><label className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><span className="text-sm font-bold">Language</span><span className="mt-1 block text-xs text-[color:var(--muted)]">Select one or more installed OCR packs, or use bounded automatic detection.</span><select aria-label="Structured OCR language" multiple value={language === "auto" ? ["auto"] : language.split("+").filter(Boolean)} onChange={event => { const values = Array.from(event.target.selectedOptions, option => option.value); setLanguage(values.includes("auto") ? "auto" : values.sort().join("+")); }} className="mt-5 min-h-28 w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-3 text-sm"><option value="auto">Detect automatically</option><option value="eng">English (eng)</option><option value="sin">Sinhala (sin)</option><option value="tam">Tamil (tam)</option></select></label><div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-emerald-500" /> Processing policy</div><p className="mt-1 block text-xs text-[color:var(--muted)]">The server keeps native-first routing and chooses the available local engine.</p><select aria-label="Structured routing policy" value={routingPolicy} onChange={event => setRoutingPolicy(event.target.value as StructuredOcrV2RoutingPolicy)} className="mt-5 w-full rounded-xl border border-[color:var(--border)] bg-[var(--card)] px-3 py-3 text-sm"><option value="AUTO">Automatic</option><option value="FAST">Fast local path</option><option value="QUALITY">Quality path</option></select></div></div>}
                {file && !active && !result && <button type="button" onClick={() => requireAuth(() => { if (!authLoading && isAuthenticated) void submit(); })} disabled={!canSubmit || authLoading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} /> Start processing</button>}
                {active && <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5" role="status" aria-live="polite"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{state === "QUEUED" ? "Waiting to start" : state === "CANCELLING" ? "Cancelling processing" : "Processing your document"}</p><p className="mt-1 text-xs text-[color:var(--muted)]">The durable server job is authoritative.</p></div>{(state === "QUEUED" || state === "RUNNING") && <button type="button" onClick={() => void cancel()} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-600"><XCircle size={15} /> Cancel</button>}</div><div className="mt-5"><div className="flex justify-between text-xs font-semibold"><span>{job?.progress ? `${job.progress.completed_pages} of ${job.progress.total_pages} pages complete` : "Preparing page progress"}</span><span>{job ? `${progress}%` : ""}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[color:var(--border)]"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div></div></div>}
                {(state === "FAILED" || state === "CANCELLED") && <div className="mt-7 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5" role="alert"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 text-rose-600" size={18} /><div><p className="text-sm font-bold">Processing could not finish</p><p className="mt-1 text-sm text-[color:var(--muted)]">{error || safeStructuredMessage(errorCodeValue || "STRUCTURED_OUTPUT_INVALID")}</p></div></div><button type="button" onClick={() => file ? setState("FILE_READY") : reset()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> Try again</button></div>}
            </section>
            {result && state === "SUCCEEDED" && <section className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-lg"><div className="flex flex-col gap-3 border-b border-[color:var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-500" size={22} /><div><h2 className="text-lg font-bold">{isMarkdown ? "Your Markdown result" : "Your structured document result"}</h2><p className="mt-1 text-xs text-[color:var(--muted)]">{result.pages.length} page{result.pages.length === 1 ? "" : "s"} · {result.schema_version}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><Clipboard size={14} /> {copyState ? "Copied" : "Copy"}</button><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Download size={14} /> Download {isMarkdown ? ".md" : ".json"}</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RotateCcw size={14} /> New document</button></div></div>{result.warnings.length > 0 && <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-4 text-xs text-amber-800 dark:text-amber-200">{result.warnings.join(" · ")}</div>}<pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words bg-[var(--background)] p-5 text-sm leading-7">{resultText}</pre></section>}
            {!isAuthenticated && !authLoading && <p className="text-center text-xs text-[color:var(--muted)]">Sign in is required before the durable job can be submitted.</p>}
        </div>
    </>;
}
