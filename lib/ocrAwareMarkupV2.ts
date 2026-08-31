import { getBaseUrl } from "@/lib/api";
import type { OcrTextV2Language } from "@/lib/ocrV2";

export type OcrAwareMarkupAction = "highlight" | "underline" | "strikeout";
export type OcrAwareMarkupMode = "smart" | "ocr" | "native";

export interface OcrAwareMarkupJob {
    job_id: string;
    status: string;
    profile: string;
    progress: {
        completed_pages: number;
        total_pages: number;
        failed_pages: number[];
        current_page?: number;
        page_statuses: Record<string, string>;
        percent: number;
    };
    result_available: boolean;
    error?: { code: string; message: string };
}

export interface OcrAwareMarkupCapabilities {
    schema_version?: string;
    service_ready?: boolean;
    profile?: string;
    actions: OcrAwareMarkupAction[];
    modes: OcrAwareMarkupMode[];
    languages: OcrTextV2Language[];
    required_capabilities?: string[];
}

export class OcrAwareMarkupError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
        super(message);
        this.name = "OcrAwareMarkupError";
    }
}

function endpoint(path: string): string {
    return `${getBaseUrl().replace(/\/+$/, "")}${path}`;
}

function messageFor(code: string): string {
    switch (code) {
        case "AUTHENTICATION_REQUIRED": return "Sign in to apply a mark to this PDF.";
        case "TEXT_NOT_FOUND": return "The requested text was not found in the document.";
        case "WORD_GEOMETRY_NOT_AVAILABLE": return "Automatic text selection is unavailable for this document.";
        case "ENGINE_UNAVAILABLE": return "OCR is temporarily unavailable. Manual markup remains available in the legacy workspace.";
        case "ANNOTATION_WRITE_FAILURE": return "The requested markup could not be written to the PDF.";
        case "FORBIDDEN": return "This markup job is not available for your account.";
        case "CANCELLED": return "Markup processing was cancelled.";
        case "INVALID_INPUT": return "Choose a PDF and enter the text you want to mark.";
        default: return "OCR-aware markup could not be completed.";
    }
}

async function parseError(response: Response): Promise<OcrAwareMarkupError> {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const detail = (payload.detail && typeof payload.detail === "object" ? payload.detail : payload) as Record<string, unknown>;
    const code = typeof detail.code === "string" ? detail.code : "ENGINE_FAILURE";
    const message = typeof detail.message === "string" ? detail.message : messageFor(code);
    return new OcrAwareMarkupError(code, message, response.status);
}

export async function submitOcrAwareMarkup(
    action: OcrAwareMarkupAction,
    file: File,
    query: string,
    mode: OcrAwareMarkupMode,
    language = "eng",
    color = action === "highlight" ? "#FFFF00" : action === "underline" ? "#2563EB" : "#DC2626",
): Promise<OcrAwareMarkupJob> {
    const form = new FormData();
    form.append("file", file);
    form.append("query", query);
    form.append("mode", mode);
    form.append("language", language);
    form.append("language_mode", language === "auto" ? "AUTO" : "EXPLICIT");
    if (language !== "auto") form.append("languages", language);
    form.append("routing_policy", "FAST");
    form.append("color", color);
    const response = await fetch(endpoint(`/api/v2/ocr/markup/${action}/jobs`), {
        method: "POST",
        body: form,
        credentials: "include",
        headers: {
            "Idempotency-Key": `markup-v2-${crypto.randomUUID()}`,
            "X-Request-ID": crypto.randomUUID(),
        },
    });
    if (!response.ok) throw await parseError(response);
    return await response.json() as OcrAwareMarkupJob;
}

export async function getOcrAwareMarkupCapabilities(): Promise<OcrAwareMarkupCapabilities> {
    const response = await fetch(endpoint("/api/v2/ocr/markup/capabilities"), { credentials: "include" });
    if (!response.ok) throw await parseError(response);
    return await response.json() as OcrAwareMarkupCapabilities;
}

export async function fetchOcrAwareMarkupJob(jobId: string): Promise<OcrAwareMarkupJob> {
    const response = await fetch(endpoint(`/api/v2/ocr/markup/jobs/${encodeURIComponent(jobId)}`), { credentials: "include" });
    if (!response.ok) throw await parseError(response);
    return await response.json() as OcrAwareMarkupJob;
}

export async function waitForOcrAwareMarkupJob(
    jobId: string,
    onUpdate: (job: OcrAwareMarkupJob) => void,
    signal?: AbortSignal,
): Promise<OcrAwareMarkupJob> {
    while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const job = await fetchOcrAwareMarkupJob(jobId);
        onUpdate(job);
        if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) return job;
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(resolve, 700);
            signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
    }
}

export async function downloadOcrAwareMarkup(jobId: string): Promise<Blob> {
    const response = await fetch(endpoint(`/api/v2/ocr/markup/jobs/${encodeURIComponent(jobId)}/result`), { credentials: "include" });
    if (!response.ok) throw await parseError(response);
    const type = response.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("application/pdf")) throw new OcrAwareMarkupError("INVALID_ENGINE_OUTPUT", "The markup result was not a PDF.", response.status);
    return await response.blob();
}

export async function cancelOcrAwareMarkup(jobId: string): Promise<OcrAwareMarkupJob> {
    const response = await fetch(endpoint(`/api/v2/ocr/markup/jobs/${encodeURIComponent(jobId)}`), { method: "DELETE", credentials: "include" });
    if (!response.ok) throw await parseError(response);
    return await response.json() as OcrAwareMarkupJob;
}

export { messageFor as safeOcrAwareMarkupMessage };
