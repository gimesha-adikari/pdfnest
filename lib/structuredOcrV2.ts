import { getBaseUrl } from "@/lib/api";

export type StructuredOcrV2Profile = "DOCUMENT_EXTRACTION_V2" | "PDF_MARKDOWN_V2";
export type StructuredOcrV2State = "IDLE" | "FILE_READY" | "SUBMITTING" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLING" | "CANCELLED";
export type StructuredOcrV2RoutingPolicy = "AUTO" | "FAST" | "QUALITY";

export interface StructuredOcrV2Progress {
    completed_pages: number;
    total_pages: number;
    failed_pages?: number[];
    current_page?: number;
    page_statuses: Record<string, string>;
    percent: number;
}

export interface StructuredOcrV2Job {
    job_id: string;
    status: string;
    created_at: string;
    updated_at: string;
    started_at?: string;
    finished_at?: string;
    profile: string;
    language: string;
    routing_policy: string;
    progress: StructuredOcrV2Progress;
    warnings: string[];
    result_available: boolean;
    error?: { code: string; message: string };
}

export interface StructuredOcrV2Result {
    schema_version: string;
    result_id: string;
    source: Record<string, unknown>;
    elements: Array<Record<string, unknown>>;
    pages: Array<Record<string, unknown>>;
    capabilities: string[];
    available_capabilities: string[];
    warnings: string[];
    validation: Record<string, unknown>;
    markdown?: string;
}

export class StructuredOcrV2ApiError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
        super(message);
        this.name = "StructuredOcrV2ApiError";
        this.code = code;
        this.status = status;
    }
}

function endpoint(path: string): string {
    return `${getBaseUrl()}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function pathFor(profile: StructuredOcrV2Profile): string {
    return profile === "PDF_MARKDOWN_V2" ? "pdf-to-markdown-v2" : "document-extraction-v2";
}

function fallbackCode(status: number): string {
    if (status === 401) return "AUTHENTICATION_REQUIRED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "RESULT_NOT_READY";
    if (status >= 500) return "TASK_STORAGE_UNAVAILABLE";
    return "INVALID_INPUT";
}

export function safeStructuredMessage(code: string): string {
    switch (code) {
        case "AUTHENTICATION_REQUIRED": return "Sign in to use this document tool.";
        case "FORBIDDEN": return "This document job is not available for your account.";
        case "INVALID_INPUT": return "Choose a valid PDF and try again.";
        case "UNSUPPORTED_LANGUAGE": return "Choose one of the available languages to continue.";
        case "STRUCTURED_ENGINE_UNAVAILABLE": return "Structured document processing is temporarily unavailable.";
        case "STRUCTURED_OUTPUT_INVALID": return "The document result could not be validated safely.";
        case "STRUCTURED_PROFILE_NOT_ELIGIBLE": return "This document is not eligible for the selected structured output.";
        case "TABLE_STRUCTURE_UNAVAILABLE": return "Text was extracted, but table structure was not available for this document.";
        case "FORMULA_STRUCTURE_UNAVAILABLE": return "Text was extracted, but formula structure was not available for this document.";
        case "RESULT_NOT_READY": return "The document result is not ready yet.";
        case "RESULT_EXPIRED": return "This result is no longer available. Start a new document.";
        case "TASK_STORAGE_UNAVAILABLE": return "The document service is temporarily unavailable. Please try again.";
        default: return "The document could not be processed. Please try again.";
    }
}

async function parseError(response: Response): Promise<StructuredOcrV2ApiError> {
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* safe fallback below */ }
    const root = isRecord(payload) ? payload : {};
    const detail = isRecord(root.detail) ? root.detail : root;
    const code = typeof detail.code === "string" ? detail.code : fallbackCode(response.status);
    const message = typeof detail.message === "string" ? detail.message : safeStructuredMessage(code);
    return new StructuredOcrV2ApiError(code, message, response.status);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(endpoint(path), { ...init, credentials: "include" });
    } catch {
        throw new StructuredOcrV2ApiError("TASK_STORAGE_UNAVAILABLE", safeStructuredMessage("TASK_STORAGE_UNAVAILABLE"), 0);
    }
    if (!response.ok) throw await parseError(response);
    try { return await response.json() as T; } catch {
        throw new StructuredOcrV2ApiError("STRUCTURED_OUTPUT_INVALID", safeStructuredMessage("STRUCTURED_OUTPUT_INVALID"), response.status);
    }
}

export async function getStructuredCapabilities(): Promise<Record<string, unknown>> {
    return requestJson<Record<string, unknown>>("/api/v2/ocr/structured/capabilities");
}

export async function createStructuredOcrV2Job(file: File, profile: StructuredOcrV2Profile, language: string, routingPolicy: StructuredOcrV2RoutingPolicy, idempotencyKey: string, requestId: string): Promise<StructuredOcrV2Job> {
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);
    form.append("routing_policy", routingPolicy);
    form.append("profile", profile);
    return requestJson<StructuredOcrV2Job>(`/api/v2/ocr/${pathFor(profile)}/jobs`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey, "X-Request-ID": requestId },
        body: form,
    });
}

export function getStructuredOcrV2Job(profile: StructuredOcrV2Profile, jobId: string): Promise<StructuredOcrV2Job> {
    return requestJson<StructuredOcrV2Job>(`/api/v2/ocr/${pathFor(profile)}/jobs/${encodeURIComponent(jobId)}`);
}

export function getStructuredOcrV2Result(profile: StructuredOcrV2Profile, jobId: string): Promise<StructuredOcrV2Result> {
    return requestJson<StructuredOcrV2Result>(`/api/v2/ocr/${pathFor(profile)}/jobs/${encodeURIComponent(jobId)}/result`);
}

export function cancelStructuredOcrV2Job(profile: StructuredOcrV2Profile, jobId: string): Promise<StructuredOcrV2Job> {
    return requestJson<StructuredOcrV2Job>(`/api/v2/ocr/${pathFor(profile)}/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
}

export function normalizeStructuredState(status: string): StructuredOcrV2State {
    switch (status.toUpperCase()) {
        case "QUEUED": return "QUEUED";
        case "RUNNING":
        case "PROCESSING": return "RUNNING";
        case "SUCCEEDED":
        case "COMPLETED": return "SUCCEEDED";
        case "CANCELLED":
        case "CANCELED": return "CANCELLED";
        case "CANCEL_REQUESTED": return "CANCELLING";
        case "FAILED": return "FAILED";
        default: return "FAILED";
    }
}

export function structuredDownloadName(fileName: string, profile: StructuredOcrV2Profile): string {
    const base = fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
    return `${base}-${profile === "PDF_MARKDOWN_V2" ? "markdown" : "structured"}.${profile === "PDF_MARKDOWN_V2" ? "md" : "json"}`;
}
