"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Highlighter, Loader2, RotateCcw, Strikethrough, Underline } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
    cancelOcrAwareMarkup,
    downloadOcrAwareMarkup,
    submitOcrAwareMarkup,
    waitForOcrAwareMarkupJob,
    type OcrAwareMarkupAction,
    type OcrAwareMarkupJob,
    type OcrAwareMarkupMode,
} from "@/lib/ocrAwareMarkupV2";

const LABELS: Record<OcrAwareMarkupAction, { title: string; verb: string; color: string }> = {
    highlight: { title: "Highlight PDF V2", verb: "Highlight", color: "#FFFF00" },
    underline: { title: "Underline PDF V2", verb: "Underline", color: "#2563EB" },
    strikeout: { title: "Strikeout PDF V2", verb: "Strike out", color: "#DC2626" },
};

const ICONS = { highlight: Highlighter, underline: Underline, strikeout: Strikethrough };

export default function OcrAwareMarkupV2Workspace({ action }: { action: OcrAwareMarkupAction }) {
    const { requireAuth } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState<OcrAwareMarkupMode>("smart");
    const [job, setJob] = useState<OcrAwareMarkupJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        abortRef.current?.abort();
        if (resultUrl) URL.revokeObjectURL(resultUrl);
    }, [resultUrl]);

    const submit = () => requireAuth(() => {
        void (async () => {
            if (!file || !query.trim()) {
                setError("Choose a PDF and enter the text to mark.");
                return;
            }
            setError(null);
            setJob(null);
            setIsSubmitting(true);
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            setResultUrl(null);
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const created = await submitOcrAwareMarkup(action, file, query.trim(), mode, "eng", LABELS[action].color);
                setJob(created);
                const completed = await waitForOcrAwareMarkupJob(created.job_id, setJob, controller.signal);
                if (completed.status !== "SUCCEEDED") {
                    throw new Error(completed.error?.message || "OCR-aware markup could not be completed.");
                }
                const blob = await downloadOcrAwareMarkup(created.job_id);
                setResultUrl(URL.createObjectURL(blob));
            } catch (cause) {
                if ((cause as Error)?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "OCR-aware markup could not be completed.");
            } finally {
                setIsSubmitting(false);
            }
        })();
    });

    const reset = async () => {
        abortRef.current?.abort();
        if (job && ["QUEUED", "RUNNING"].includes(job.status)) await cancelOcrAwareMarkup(job.job_id).catch(() => undefined);
        setFile(null);
        setQuery("");
        setJob(null);
        setError(null);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
    };

    const meta = LABELS[action];
    const Icon = ICONS[action];
    return (
        <div className="mx-auto w-full max-w-3xl space-y-6" data-testid={`markup-v2-${action}`}>
            <div className="text-center">
                <div className="mb-4 flex justify-center"><div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)]"><FileText className="text-[var(--primary)]" /></div></div>
                <h1 className="text-3xl font-bold text-[var(--foreground)]">{meta.title}</h1>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">Mark exact text in native or scanned PDFs using the shared OCR V2 word-geometry foundation.</p>
            </div>
            <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
                <label className="block text-sm font-medium text-[var(--foreground)]">PDF document
                    <input aria-label="PDF document" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                </label>
                {file && <p className="text-sm text-[var(--muted)]">Selected: {file.name}</p>}
                <label className="block text-sm font-medium text-[var(--foreground)]">Text to {meta.verb.toLowerCase()}
                    <input aria-label="Text query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter an exact phrase" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-[var(--foreground)]">Selection source
                    <select aria-label="Selection source" value={mode} onChange={(event) => setMode(event.target.value as OcrAwareMarkupMode)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                        <option value="smart">Smart: native first, OCR V2 otherwise</option>
                        <option value="ocr">OCR V2 word geometry</option>
                        <option value="native">Native PDF text</option>
                    </select>
                </label>
                <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={submit} disabled={isSubmitting || !file || !query.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}{isSubmitting ? "Processing" : `${meta.verb} text`}</button>
                    <button type="button" onClick={() => void reset()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm"><RotateCcw size={16} /> Start over</button>
                </div>
                {job && <div className="rounded-lg border border-[var(--border)] p-3 text-sm" data-testid="markup-v2-job-status"><div className="flex items-center gap-2 font-medium"><span>{job.status}</span>{job.status === "SUCCEEDED" && <CheckCircle2 className="text-green-600" size={17} />}</div><p className="mt-1 text-[var(--muted)]">{job.progress?.completed_pages || 0}/{job.progress?.total_pages || 0} pages · {job.progress?.percent || 0}%</p></div>}
                {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
                {resultUrl && <a data-testid="markup-v2-download" href={resultUrl} download={`${action}-document.pdf`} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"><Download size={16} /> Download marked PDF</a>}
            </section>
        </div>
    );
}
