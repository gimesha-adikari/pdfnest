"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Download,
    GripVertical,
    ImagePlus,
    Languages,
    Loader2,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    UploadCloud,
    X,
    XCircle,
} from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import OcrLanguagePicker from "@/components/tools/OcrLanguagePicker";
import {
    cancelSearchablePdfV2Job,
    createSearchablePdfV2Job,
    downloadSearchablePdfV2Result,
    getSearchablePdfV2Capabilities,
    getSearchablePdfV2Job,
    newSearchablePdfV2RequestIdentity,
    normalizeSearchablePdfV2State,
    safeMessageForSearchablePdfCode,
    searchablePdfV2RetryDelayMs,
    type SearchablePdfV2Capabilities,
    type SearchablePdfV2JobStatus,
    type SearchablePdfV2RoutingPolicy,
    type SearchablePdfV2State,
    type SearchablePdfV2Download,
    SearchablePdfV2ApiError,
} from "@/lib/searchablePdfV2";

/* Local object URLs are intentionally used for user-selected image previews. */
/* eslint-disable @next/next/no-img-element */

const RESUME_STORAGE_KEY = "pdfnest:searchable-pdf-v2:active-job";
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SearchablePage {
    id: string;
    file: File;
    previewUrl: string;
}

interface StoredSearchableJob {
    jobId: string;
    fileNames: string[];
    language: string;
    routingPolicy: SearchablePdfV2RoutingPolicy;
}

function isJobId(value: string | null): value is string {
    return Boolean(value && JOB_ID_PATTERN.test(value));
}

function readStoredJob(): StoredSearchableJob | null {
    if (typeof window === "undefined") return null;
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(RESUME_STORAGE_KEY) || "null");
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<StoredSearchableJob>;
        if (
            typeof candidate.jobId !== "string" ||
            !isJobId(candidate.jobId) ||
            !Array.isArray(candidate.fileNames) ||
            !candidate.fileNames.every((item) => typeof item === "string") ||
            typeof candidate.language !== "string"
        ) return null;
        const routingPolicy = candidate.routingPolicy;
        if (routingPolicy !== "AUTO" && routingPolicy !== "FAST" && routingPolicy !== "QUALITY") return null;
        return { jobId: candidate.jobId, fileNames: candidate.fileNames, language: candidate.language, routingPolicy };
    } catch {
        return null;
    }
}

function saveStoredJob(job: StoredSearchableJob): void {
    try {
        window.localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(job));
    } catch {
        // Resume is optional and must not interrupt a durable server job.
    }
}

function displayError(error: unknown): string {
    if (error instanceof SearchablePdfV2ApiError) return safeMessageForSearchablePdfCode(error.code);
    return "The searchable PDF could not be completed. Please try again.";
}

function errorCode(error: unknown): string {
    return error instanceof SearchablePdfV2ApiError ? error.code : "ENGINE_FAILURE";
}

function isTransientPollError(error: unknown): boolean {
    if (!(error instanceof SearchablePdfV2ApiError)) return false;
    return error.status === 0 || error.status === 429 || error.status >= 500;
}

function makePage(file: File): SearchablePage {
    return {
        id: newSearchablePdfV2RequestIdentity(),
        file,
        previewUrl: URL.createObjectURL(file),
    };
}

function isSupportedImage(file: File, formats: string[]): boolean {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    if (formats.length === 0) return [".jpg", ".jpeg", ".png", ".webp"].some((extension) => name.endsWith(extension));
    return formats.some((format) => {
        const normalized = format.toLowerCase();
        return normalized === type || (normalized === "image/*" && type.startsWith("image/")) || name.endsWith(normalized.replace("image/", "."));
    });
}

function progressPercent(job: SearchablePdfV2JobStatus | null): number {
    const percent = job?.progress?.percent;
    return typeof percent === "number" ? Math.max(0, Math.min(100, percent)) : 0;
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function statusLabel(state: SearchablePdfV2State): string {
    switch (state) {
        case "IDLE": return "Ready when you are";
        case "FILES_READY": return "Images ready to process";
        case "SUBMITTING": return "Starting searchable PDF";
        case "QUEUED": return "Waiting to start";
        case "RUNNING": return "Creating your searchable PDF";
        case "SUCCEEDED": return "Searchable PDF ready";
        case "FAILED": return "Searchable PDF could not be completed";
        case "CANCELLING": return "Cancelling processing";
        case "CANCELLED": return "Processing cancelled";
    }
}

function SortablePageCard({
    page,
    index,
    disabled,
    onRemove,
    onMove,
}: {
    page: SearchablePage;
    index: number;
    disabled: boolean;
    onRemove: () => void;
    onMove: (direction: "up" | "down") => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <li ref={setNodeRef} style={style} className={`rounded-2xl border border-[color:var(--border)] bg-[var(--background)] p-3 ${isDragging ? "z-10 shadow-xl ring-2 ring-indigo-500/40" : ""}`}>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    disabled={disabled}
                    aria-label={`Drag page ${index + 1} to reorder`}
                    title="Drag to reorder"
                    className="touch-none rounded-lg p-1.5 text-[color:var(--muted)] hover:bg-[var(--card)] hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <GripVertical size={18} />
                </button>
                <img src={page.previewUrl} alt={`Preview of page ${index + 1}, ${page.file.name}`} className="h-16 w-16 rounded-xl border border-[color:var(--border)] object-cover" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[color:var(--foreground)]">Page {index + 1}</p>
                    <p className="truncate text-xs text-[color:var(--muted)]">{page.file.name}</p>
                    <p className="mt-1 text-[11px] text-[color:var(--muted)]">{(page.file.size / 1024).toFixed(0)} KB</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button type="button" onClick={() => onMove("up")} disabled={disabled || index === 0} aria-label={`Move page ${index + 1} up`} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] font-semibold hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">Up</button>
                    <button type="button" onClick={() => onMove("down")} disabled={disabled} aria-label={`Move page ${index + 1} down`} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] font-semibold hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">Down</button>
                    <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove page ${index + 1}`} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"><X size={16} /></button>
                </div>
            </div>
        </li>
    );
}

export default function SearchablePdfV2Workspace() {
    const { file, setFile, setDownloadData } = useSharedTool();
    const [pages, setPages] = useState<SearchablePage[]>([]);
    const [capabilities, setCapabilities] = useState<SearchablePdfV2Capabilities | null>(null);
    const [capabilityError, setCapabilityError] = useState<string | null>(null);
    const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
    const [language, setLanguage] = useState("auto");
    const [routingPolicy, setRoutingPolicy] = useState<SearchablePdfV2RoutingPolicy>("AUTO");
    const [state, setState] = useState<SearchablePdfV2State>("IDLE");
    const [jobId, setJobId] = useState<string | null>(null);
    const [job, setJob] = useState<SearchablePdfV2JobStatus | null>(null);
    const [artifact, setArtifact] = useState<SearchablePdfV2Download | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCodeValue, setErrorCodeValue] = useState<string | null>(null);
    const [resumedFileNames, setResumedFileNames] = useState<string[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const seededFileRef = useRef<File | null>(null);
    const initialBatchRef = useRef<File[] | null>(null);
    const pollingJobRef = useRef<string | null>(null);
    const cancelRequestedRef = useRef(false);
    const resultLoadedRef = useRef<string | null>(null);
    const pagesRef = useRef<SearchablePage[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const active = state === "SUBMITTING" || state === "QUEUED" || state === "RUNNING" || state === "CANCELLING";
    const selectedFormats = useMemo(() => capabilities?.searchable_pdf?.input_formats || [], [capabilities]);
    const routingModes = capabilities?.routing_modes.filter((mode) => (mode.id === "AUTO" || mode.id === "FAST" || mode.id === "QUALITY") && mode.available) || [];
    const fileNames = pages.map((page) => page.file.name);
    const displayedFileNames = fileNames.length > 0 ? fileNames : resumedFileNames;
    const canSubmit = pages.length > 0 && Boolean(language) && Boolean(capabilities?.searchable_pdf?.available) && state === "FILES_READY";
    const totalPages = job?.progress?.total_pages || pages.length || resumedFileNames.length;
    const completedPages = job?.progress?.completed_pages || 0;

    const releasePages = useCallback((items: SearchablePage[]) => {
        for (const page of items) URL.revokeObjectURL(page.previewUrl);
    }, []);

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

    useEffect(() => () => releasePages(pagesRef.current), [releasePages]);

    useEffect(() => {
        if (!artifact) {
            // The preview URL is derived from the authenticated artifact and is revoked on cleanup.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreviewUrl(null);
            return;
        }
        const nextUrl = URL.createObjectURL(artifact.blob);
        setPreviewUrl(nextUrl);
        return () => URL.revokeObjectURL(nextUrl);
    }, [artifact]);

    useEffect(() => {
        if (!file || seededFileRef.current === file) return;
        seededFileRef.current = file;
        const initialBatch = initialBatchRef.current || [file];
        initialBatchRef.current = null;
        const supported = initialBatch.filter((item) => isSupportedImage(item, selectedFormats));
        const nextPages = supported.map(makePage);
        setPages(nextPages);
        setState(nextPages.length > 0 ? "FILES_READY" : "IDLE");
        if (supported.length !== initialBatch.length) {
            setError("One or more files were skipped because their format is not available.");
        }
    }, [file, selectedFormats]);

    const loadCapabilities = useCallback(async () => {
        setIsLoadingCapabilities(true);
        setCapabilityError(null);
        try {
            const next = await getSearchablePdfV2Capabilities();
            const usableLanguages = next.languages.filter((item) => item.code && item.name);
            if (!next.searchable_pdf?.available) throw new SearchablePdfV2ApiError("ENGINE_UNAVAILABLE", "Searchable PDF processing is not currently available.", 503);
            if (usableLanguages.length === 0) throw new SearchablePdfV2ApiError("UNSUPPORTED_LANGUAGE", "No OCR languages are currently available.", 200);
            setCapabilities({ ...next, languages: usableLanguages });
            setLanguage((current) => {
                if (current === "auto") return current;
                const filtered = current.split("+").filter((code) => usableLanguages.some((item) => item.code === code)).sort().join("+");
                return filtered || "auto";
            });
            setRoutingPolicy((current) => next.routing_modes.some((mode) => mode.id === current && mode.available) ? current : ((next.routing_modes.find((mode) => mode.available)?.id as SearchablePdfV2RoutingPolicy) || "AUTO"));
        } catch (loadError) {
            setCapabilities(null);
            setCapabilityError(displayError(loadError));
        } finally {
            setIsLoadingCapabilities(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadCapabilities(); }, 0);
        return () => window.clearTimeout(timer);
    }, [loadCapabilities]);

    useEffect(() => {
        if (jobId || file) return;
        const stored = readStoredJob();
        if (!stored) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setJobId(stored.jobId);
        setLanguage(stored.language);
        setRoutingPolicy(stored.routingPolicy);
        setResumedFileNames(stored.fileNames);
        setState("QUEUED");
    }, [file, jobId]);

    useEffect(() => {
        if (!jobId || pollingJobRef.current === jobId) return;
        pollingJobRef.current = jobId;
        let mounted = true;
        let timer: number | undefined;
        let interval = 1200;
        let transientRetryAttempt = 0;

        const scheduleTransientPoll = (pollError?: unknown) => {
            const delay = searchablePdfV2RetryDelayMs(pollError, transientRetryAttempt);
            transientRetryAttempt = Math.min(transientRetryAttempt + 1, 3);
            timer = window.setTimeout(() => { void poll(); }, delay);
        };

        const loadResult = async (): Promise<boolean> => {
            if (!mounted || resultLoadedRef.current === jobId) return true;
            try {
                const nextArtifact = await downloadSearchablePdfV2Result(jobId);
                if (!mounted) return true;
                resultLoadedRef.current = jobId;
                setArtifact(nextArtifact);
                setState("SUCCEEDED");
                setError(null);
                return true;
            } catch (resultError) {
                if (!mounted) return true;
                if (isTransientPollError(resultError)) {
                    scheduleTransientPoll(resultError);
                    return true;
                }
                setErrorCodeValue(errorCode(resultError));
                setError(displayError(resultError));
                setState("FAILED");
                return true;
            }
        };

        const poll = async () => {
            try {
                const nextJob = await getSearchablePdfV2Job(jobId);
                if (!mounted) return;
                setJob(nextJob);
                transientRetryAttempt = 0;
                const nextState = normalizeSearchablePdfV2State(nextJob.status);
                if (nextState === "SUCCEEDED") {
                    await loadResult();
                    return;
                }
                if (nextState === "FAILED" || nextState === "CANCELLED") {
                    setState(nextState);
                    setErrorCodeValue(nextJob.error?.code || (nextState === "CANCELLED" ? "CANCELLED" : "ENGINE_FAILURE"));
                    setError(nextJob.error?.message || safeMessageForSearchablePdfCode(nextState === "CANCELLED" ? "CANCELLED" : "ENGINE_FAILURE"));
                    return;
                }
                setState(cancelRequestedRef.current ? "CANCELLING" : nextState);
                interval = nextState === "QUEUED" ? 1800 : 1300;
                timer = window.setTimeout(() => { void poll(); }, interval);
            } catch (pollError) {
                if (!mounted) return;
                if (isTransientPollError(pollError)) {
                    scheduleTransientPoll(pollError);
                    return;
                }
                setErrorCodeValue(errorCode(pollError));
                setError(displayError(pollError));
                setState("FAILED");
            }
        };

        void poll();
        return () => {
            mounted = false;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [jobId]);

    const persistResume = useCallback((nextJobId: string) => {
        saveStoredJob({ jobId: nextJobId, fileNames, language, routingPolicy });
    }, [fileNames, language, routingPolicy]);

    const addFiles = useCallback((incoming: File[]) => {
        if (active || incoming.length === 0) return;
        const supported = incoming.filter((item) => isSupportedImage(item, selectedFormats));
        if (supported.length === 0) {
            setError("Choose a supported image file to continue.");
            return;
        }
        const nextPages = supported.map(makePage);
        setPages((current) => [...current, ...nextPages]);
        setState("FILES_READY");
        setError(supported.length !== incoming.length ? "Some files were skipped because their format is not available." : null);
        if (!file && supported.length > 1) initialBatchRef.current = supported;
        setFile(file || supported[0]);
    }, [active, file, selectedFormats, setFile]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
    }, [addFiles]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active: activeItem, over } = event;
        if (!over || activeItem.id === over.id || active) return;
        setPages((current) => {
            const oldIndex = current.findIndex((page) => page.id === activeItem.id);
            const newIndex = current.findIndex((page) => page.id === over.id);
            return oldIndex === -1 || newIndex === -1 ? current : arrayMove(current, oldIndex, newIndex);
        });
        setError(null);
    }, [active]);

    const removePage = useCallback((id: string) => {
        if (active) return;
        const page = pages.find((item) => item.id === id);
        if (page) URL.revokeObjectURL(page.previewUrl);
        setPages((current) => current.filter((item) => item.id !== id));
        setState(pages.length > 1 ? "FILES_READY" : "IDLE");
        if (pages.length === 1) setFile(null);
    }, [active, pages, setFile]);

    const movePage = useCallback((index: number, direction: "up" | "down") => {
        if (active) return;
        setPages((current) => {
            const target = direction === "up" ? index - 1 : index + 1;
            return target < 0 || target >= current.length ? current : arrayMove(current, index, target);
        });
        setError(null);
    }, [active]);

    const prepareRetry = useCallback(() => {
        try { window.localStorage.removeItem(RESUME_STORAGE_KEY); } catch { /* optional storage */ }
        setJobId(null);
        setJob(null);
        setArtifact(null);
        setError(null);
        setErrorCodeValue(null);
        setState(pages.length > 0 ? "FILES_READY" : "IDLE");
        pollingJobRef.current = null;
        resultLoadedRef.current = null;
        cancelRequestedRef.current = false;
    }, [pages.length]);

    const submit = useCallback(async () => {
        if (!canSubmit || !language || !capabilities) return;
        setState("SUBMITTING");
        setError(null);
        setErrorCodeValue(null);
        setArtifact(null);
        setJob(null);
        setJobId(null);
        pollingJobRef.current = null;
        resultLoadedRef.current = null;
        cancelRequestedRef.current = false;
        const requestId = newSearchablePdfV2RequestIdentity();
        const idempotencyKey = newSearchablePdfV2RequestIdentity();
        try {
            let response: SearchablePdfV2JobStatus | null = null;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    response = await createSearchablePdfV2Job(pages.map((page) => page.file), language, routingPolicy, idempotencyKey, requestId);
                    break;
                } catch (submitError) {
                    const retryable = submitError instanceof SearchablePdfV2ApiError && (submitError.status === 0 || submitError.status >= 500);
                    if (!retryable || attempt === 1) throw submitError;
                    await wait(500);
                }
            }
            if (!response) throw new SearchablePdfV2ApiError("INVALID_ENGINE_OUTPUT", "The service returned no job reference.", 502);
            if (!isJobId(response.job_id)) throw new SearchablePdfV2ApiError("INVALID_ENGINE_OUTPUT", "The service returned an invalid job reference.", 502);
            setJob(response);
            setJobId(response.job_id);
            setState(normalizeSearchablePdfV2State(response.status));
            persistResume(response.job_id);
        } catch (submitError) {
            setState("FAILED");
            setErrorCodeValue(errorCode(submitError));
            setError(displayError(submitError));
        }
    }, [canSubmit, capabilities, language, pages, persistResume, routingPolicy]);

    const cancel = useCallback(async () => {
        if (!jobId || (state !== "QUEUED" && state !== "RUNNING")) return;
        cancelRequestedRef.current = true;
        setState("CANCELLING");
        try {
            const nextJob = await cancelSearchablePdfV2Job(jobId);
            setJob(nextJob);
            const nextState = normalizeSearchablePdfV2State(nextJob.status);
            setState(nextState === "QUEUED" || nextState === "RUNNING" ? "CANCELLING" : nextState);
            if (nextState === "CANCELLED") setError(safeMessageForSearchablePdfCode("CANCELLED"));
        } catch (cancelError) {
            cancelRequestedRef.current = false;
            setState(job?.status ? normalizeSearchablePdfV2State(job.status) : "RUNNING");
            setErrorCodeValue(errorCode(cancelError));
            setError(displayError(cancelError));
        }
    }, [job, jobId, state]);

    const reset = useCallback(() => {
        try { window.localStorage.removeItem(RESUME_STORAGE_KEY); } catch { /* optional storage */ }
        releasePages(pages);
        setPages([]);
        setJobId(null);
        setJob(null);
        setArtifact(null);
        setError(null);
        setErrorCodeValue(null);
        setResumedFileNames([]);
        setState("IDLE");
        pollingJobRef.current = null;
        resultLoadedRef.current = null;
        cancelRequestedRef.current = false;
        seededFileRef.current = null;
        setFile(null);
    }, [pages, releasePages, setFile]);

    const download = useCallback(() => {
        if (!artifact) return;
        setIsDownloading(true);
        try {
            setDownloadData(artifact);
            const url = URL.createObjectURL(artifact.blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = artifact.fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        } finally {
            setIsDownloading(false);
        }
    }, [artifact, setDownloadData]);

    const handleSubmit = () => { void submit(); };
    const selectedLanguageName = useMemo(() => language === "auto"
        ? "Detect automatically"
        : language.split("+").filter(Boolean).map((code) => capabilities?.languages.find((item) => item.code === code)?.name || code).join(" + ") || language, [capabilities, language]);

    return (
        <>
            <PdfToolHero title="Build a searchable PDF" description="Turn scanned images into one searchable PDF while preserving the page order and original appearance." />
            <div className="mx-auto mt-10 max-w-5xl space-y-6 px-4 pb-10">
                <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-lg sm:p-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600"><ImagePlus size={22} /></div><div><h1 className="text-lg font-bold text-[color:var(--foreground)]">Build a searchable PDF</h1><p className="mt-1 text-xs text-[color:var(--muted)]">Add images, arrange them in reading order, then start the durable server job.</p></div></div>
                        </div>
                        {(pages.length > 0 || jobId) && state !== "SUCCEEDED" && <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold hover:border-indigo-500"><RotateCcw size={14} /> Start over</button>}
                    </div>

                    {displayedFileNames.length > 0 && jobId && pages.length === 0 && <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm" role="status" aria-live="polite"><p className="font-semibold text-[color:var(--foreground)]">Resuming your searchable PDF job</p><p className="mt-1 text-xs text-[color:var(--muted)]">The server is authoritative. Image bytes are not stored in the browser.</p><p className="mt-3 text-xs text-[color:var(--muted)]">{displayedFileNames.join(" · ")}</p></div>}

                    {!active && !jobId && <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} className="mt-7 rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-7 text-center sm:p-10"><UploadCloud className="mx-auto text-indigo-500" size={30} /><p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">Drop images here</p><p className="mt-1 text-xs text-[color:var(--muted)]">Add multiple pages at once. You choose the order.</p><input ref={inputRef} type="file" accept={selectedFormats.length > 0 ? selectedFormats.join(",") : "image/jpeg,image/png,image/webp"} multiple className="sr-only" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /><button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"><ImagePlus size={16} /> Choose images</button></div>}

                    {pages.length > 0 && !active && !jobId && <div className="mt-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-[color:var(--foreground)]">Pages in order</h2><p className="mt-1 text-xs text-[color:var(--muted)]">Drag a page, or use Up and Down for keyboard-friendly reordering.</p></div><><input ref={inputRef} type="file" accept={selectedFormats.length > 0 ? selectedFormats.join(",") : "image/jpeg,image/png,image/webp"} multiple className="sr-only" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /><button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold hover:border-indigo-500"><ImagePlus size={15} /> Add more</button></></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}><ol aria-label="Selected image pages" className="mt-4 grid gap-3">{pages.map((page, index) => <SortablePageCard key={page.id} page={page} index={index} disabled={active} onRemove={() => removePage(page.id)} onMove={(direction) => movePage(index, direction)} />)}</ol></SortableContext></DndContext></div>}

                    {!active && !jobId && <p className="mt-5 text-center text-xs text-[color:var(--muted)]">You can process this document as a guest. Sign in if you want account-based access to your history.</p>}

                    {pages.length > 0 && !active && !jobId && <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1fr]"><div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><div className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]"><Languages size={17} className="text-indigo-500" /> Language</div><p className="mt-1 text-xs text-[color:var(--muted)]">Detect the languages automatically, or choose one or more languages manually.</p>{isLoadingCapabilities ? <div className="mt-5 flex items-center gap-2 text-sm text-[color:var(--muted)]"><Loader2 className="animate-spin" size={16} /> Loading available languages…</div> : capabilityError ? <div className="mt-5 space-y-3"><p className="text-xs text-rose-600">{capabilityError}</p><button type="button" onClick={() => void loadCapabilities()} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> Try again</button></div> : <OcrLanguagePicker languages={capabilities?.languages || []} value={language} onChange={setLanguage} disabled={!capabilities || active} />}</div><div className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/40 p-5"><div className="flex items-center gap-2 text-sm font-bold text-[color:var(--foreground)]"><ShieldCheck size={17} className="text-emerald-500" /> Processing mode</div><p className="mt-1 text-xs text-[color:var(--muted)]">Choose how quickly to create the PDF. The service selects the actual processing method.</p><div className="mt-5 grid gap-2">{routingModes.map((mode) => <button key={mode.id} type="button" onClick={() => setRoutingPolicy(mode.id as SearchablePdfV2RoutingPolicy)} className={`rounded-xl border px-3 py-3 text-left transition ${routingPolicy === mode.id ? "border-indigo-500 bg-indigo-500/10" : "border-[color:var(--border)] hover:border-indigo-400"}`}><span className="flex items-center justify-between text-sm font-semibold text-[color:var(--foreground)]"><span>{mode.label}</span>{routingPolicy === mode.id && <Check size={15} className="text-indigo-500" />}</span><span className="mt-1 block text-xs text-[color:var(--muted)]">{mode.description}</span></button>)}{routingModes.length === 0 && <p className="text-xs text-[color:var(--muted)]">No processing modes are currently available.</p>}</div></div></div>}

                    {pages.length > 0 && !active && !jobId && <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[color:var(--muted)]">{pages.length} page{pages.length === 1 ? "" : "s"} will be submitted in exactly this order.</p><button type="button" onClick={handleSubmit} disabled={!canSubmit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck size={16} /> Create searchable PDF</button></div>}

                    {active && <div className="mt-7 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5" role="status" aria-live="polite"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-[color:var(--foreground)]">{statusLabel(state)}</p><p className="mt-1 text-xs text-[color:var(--muted)]">{state === "QUEUED" ? "Your images are safely queued." : state === "CANCELLING" ? "Waiting for the server to confirm cancellation." : `Using ${selectedLanguageName || "the selected language"}.`}</p></div>{(state === "QUEUED" || state === "RUNNING") && <button type="button" onClick={() => void cancel()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10"><XCircle size={15} /> Cancel</button>}{state === "CANCELLING" && <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-600"><Loader2 className="animate-spin" size={15} /> Cancelling…</span>}</div><div className="mt-5" role="progressbar" aria-label="Searchable PDF page progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent(job)}><div className="flex items-center justify-between text-xs font-semibold text-[color:var(--muted)]"><span>{totalPages ? `${completedPages} of ${totalPages} pages complete` : "Preparing page progress…"}</span><span>{totalPages ? `${progressPercent(job)}%` : ""}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[color:var(--border)]">{totalPages ? <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent(job)}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-600" />}</div>{job?.progress.current_page !== undefined && state === "RUNNING" && <p className="mt-3 text-xs text-[color:var(--muted)]">Working on page {job.progress.current_page + 1} of {totalPages}.</p>}</div></div>}

                    {(state === "FAILED" || state === "CANCELLED") && !artifact && <div className="mt-7 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-5" role="alert"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0 text-rose-600" size={18} /><div><p className="text-sm font-bold text-[color:var(--foreground)]">{statusLabel(state)}</p><p className="mt-1 text-sm text-[color:var(--muted)]">{error || safeMessageForSearchablePdfCode(errorCodeValue || "ENGINE_FAILURE")}</p><p className="mt-2 text-xs text-[color:var(--muted)]">No new request was started automatically.</p></div></div><button type="button" onClick={() => errorCodeValue === "INPUT_DOWNLOAD" ? reset() : pages.length > 0 ? prepareRetry() : reset()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold"><RefreshCw size={14} /> {errorCodeValue === "INPUT_DOWNLOAD" ? "Upload images again" : pages.length > 0 ? "Try again" : "Choose images"}</button></div>}
                </section>

                {artifact && state === "SUCCEEDED" && <section className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-lg"><div className="flex flex-col gap-4 border-b border-[color:var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-500" size={22} /><div><h2 className="text-lg font-bold text-[color:var(--foreground)]">Your searchable PDF is ready</h2><p className="mt-1 text-xs text-[color:var(--muted)]">{displayedFileNames.length} page{displayedFileNames.length === 1 ? "" : "s"} · {selectedLanguageName || "Selected language"}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={download} disabled={isDownloading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><Download size={14} /> Download PDF</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-semibold hover:border-indigo-500"><RotateCcw size={14} /> New PDF</button></div></div>{previewUrl && <div className="bg-[var(--background)] p-3 sm:p-5"><iframe title="Searchable PDF preview" src={previewUrl} className="h-[560px] w-full rounded-2xl border border-[color:var(--border)] bg-white" /></div>}<div className="border-t border-[color:var(--border)] px-5 py-4 text-xs text-[color:var(--muted)] sm:px-6">The visual pages are preserved, with searchable text added by the server.</div></section>}
            </div>
        </>
    );
}
