import { getBaseUrl } from "@/lib/api";

export type SearchablePdfV2State =
    | "IDLE"
    | "FILES_READY"
    | "SUBMITTING"
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLING"
    | "CANCELLED";

export type SearchablePdfV2RoutingPolicy = "AUTO" | "FAST" | "QUALITY";

export interface SearchablePdfV2Language {
    code: string;
    name: string;
}

export interface SearchablePdfV2RoutingMode {
    id: SearchablePdfV2RoutingPolicy | string;
    label: string;
    description: string;
    available: boolean;
}

export interface SearchablePdfV2Capability {
    available: boolean;
    engine_id?: string;
    required_capabilities?: string[];
    input_formats?: string[];
}

export interface SearchablePdfV2Capabilities {
    schema_version?: string;
    profile?: string;
    service_ready?: boolean;
    languages: SearchablePdfV2Language[];
    routing_modes: SearchablePdfV2RoutingMode[];
    searchable_pdf: SearchablePdfV2Capability;
}

export interface SearchablePdfV2Progress {
    completed_pages: number;
    total_pages: number;
    failed_pages: number[];
    current_page?: number;
    page_statuses: Record<string, string>;
    percent: number;
}

export interface SearchablePdfV2ErrorPayload {
    code: string;
    message: string;
}

export interface SearchablePdfV2JobStatus {
    job_id: string;
    status: SearchablePdfV2State | string;
    created_at?: string;
    updated_at?: string;
    started_at?: string;
    finished_at?: string;
    profile?: string;
    language?: string;
    routing_policy?: SearchablePdfV2RoutingPolicy | string;
    progress: SearchablePdfV2Progress;
    warnings: string[];
    result_available: boolean;
    error?: SearchablePdfV2ErrorPayload;
}

export class SearchablePdfV2ApiError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
        super(message);
        this.name = "SearchablePdfV2ApiError";
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

function codeForStatus(status: number): string {
    if (status === 401) return "AUTHENTICATION_REQUIRED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "RESULT_NOT_READY";
    if (status === 410) return "RESULT_EXPIRED";
    if (status >= 500) return "TASK_STORAGE_UNAVAILABLE";
    return "INVALID_INPUT";
}

export function safeMessageForSearchablePdfCode(code: string): string {
    switch (code) {
        case "AUTHENTICATION_REQUIRED":
            return "Sign in to create a searchable PDF.";
        case "FORBIDDEN":
            return "This searchable PDF job is not available for your account.";
        case "UNSUPPORTED_LANGUAGE":
            return "Choose one of the available languages to continue.";
        case "ENGINE_UNAVAILABLE":
            return "Searchable PDF processing is temporarily unavailable. Please try again shortly.";
        case "RESULT_NOT_READY":
            return "The searchable PDF is still being prepared.";
        case "RESULT_EXPIRED":
            return "This result is no longer available. Start a new run to create the PDF again.";
        case "CANCELLED":
            return "Searchable PDF processing was cancelled.";
        case "INVALID_INPUT":
            return "Choose at least one supported image and try again.";
        case "TASK_STORAGE_UNAVAILABLE":
            return "The searchable PDF service is temporarily unavailable. Please try again.";
        case "INVALID_ENGINE_OUTPUT":
        case "ENGINE_FAILURE":
            return "The searchable PDF could not be completed. Please try again.";
        case "PDF_RENDER_FAILURE":
            return "The searchable PDF could not be rendered while preserving the source image.";
        default:
            return "The searchable PDF request could not be completed. Please try again.";
    }
}

async function parseError(response: Response): Promise<SearchablePdfV2ApiError> {
    let payload: unknown = null;
    try {
        payload = await response.json();
    } catch {
        // The server may return an empty or non-JSON error body.
    }
    const root = isRecord(payload) ? payload : {};
    const detail = isRecord(root.detail) ? root.detail : root;
    const code = typeof detail.code === "string" ? detail.code : codeForStatus(response.status);
    const message = typeof detail.message === "string" ? detail.message : safeMessageForSearchablePdfCode(code);
    return new SearchablePdfV2ApiError(code, message, response.status);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(endpoint(path), {
            ...init,
            credentials: "include",
        });
    } catch {
        throw new SearchablePdfV2ApiError(
            "TASK_STORAGE_UNAVAILABLE",
            safeMessageForSearchablePdfCode("TASK_STORAGE_UNAVAILABLE"),
            0,
        );
    }
    if (!response.ok) throw await parseError(response);
    try {
        return (await response.json()) as T;
    } catch {
        throw new SearchablePdfV2ApiError("INVALID_ENGINE_OUTPUT", "The service returned an invalid response.", response.status);
    }
}

export async function getSearchablePdfV2Capabilities(): Promise<SearchablePdfV2Capabilities> {
    return requestJson<SearchablePdfV2Capabilities>("/api/v2/ocr/searchable-pdf/capabilities");
}

export async function createSearchablePdfV2Job(
    files: File[],
    language: string,
    routingPolicy: SearchablePdfV2RoutingPolicy,
    idempotencyKey: string,
    requestId: string,
): Promise<SearchablePdfV2JobStatus> {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    form.append("language", language);
    form.append("routing_policy", routingPolicy);

    return requestJson<SearchablePdfV2JobStatus>("/api/v2/ocr/searchable-pdf/jobs", {
        method: "POST",
        headers: {
            "Idempotency-Key": idempotencyKey,
            "X-Request-ID": requestId,
        },
        body: form,
    });
}

export async function getSearchablePdfV2Job(jobId: string): Promise<SearchablePdfV2JobStatus> {
    return requestJson<SearchablePdfV2JobStatus>(`/api/v2/ocr/searchable-pdf/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelSearchablePdfV2Job(jobId: string): Promise<SearchablePdfV2JobStatus> {
    return requestJson<SearchablePdfV2JobStatus>(`/api/v2/ocr/searchable-pdf/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
    });
}

export interface SearchablePdfV2Download {
    blob: Blob;
    fileName: string;
}

function filenameFromDisposition(value: string | null): string {
    if (!value) return "document-searchable.pdf";
    const match = value.match(/filename\*?=(?:UTF-8''|\")?([^;\"]+)/i);
    const decoded = match?.[1] ? decodeURIComponent(match[1].trim()) : "";
    const safe = decoded.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "document-searchable"}.pdf`;
}

export async function downloadSearchablePdfV2Result(jobId: string): Promise<SearchablePdfV2Download> {
    let response: Response;
    try {
        response = await fetch(endpoint(`/api/v2/ocr/searchable-pdf/jobs/${encodeURIComponent(jobId)}/result`), {
            credentials: "include",
        });
    } catch {
        throw new SearchablePdfV2ApiError(
            "TASK_STORAGE_UNAVAILABLE",
            safeMessageForSearchablePdfCode("TASK_STORAGE_UNAVAILABLE"),
            0,
        );
    }
    if (!response.ok) throw await parseError(response);

    const contentType = response.headers.get("content-type") || "";
    const blob = await response.blob();
    if (!contentType.toLowerCase().includes("application/pdf") || blob.size < 5) {
        throw new SearchablePdfV2ApiError("INVALID_ENGINE_OUTPUT", "The service returned an invalid PDF result.", response.status);
    }
    const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...header) !== "%PDF-") {
        throw new SearchablePdfV2ApiError("INVALID_ENGINE_OUTPUT", "The service returned an invalid PDF result.", response.status);
    }
    return { blob, fileName: filenameFromDisposition(response.headers.get("content-disposition")) };
}

export function normalizeSearchablePdfV2State(status: string): SearchablePdfV2State {
    switch (status.toUpperCase()) {
        case "QUEUED": return "QUEUED";
        case "RUNNING":
        case "PROCESSING": return "RUNNING";
        case "SUCCEEDED":
        case "COMPLETED": return "SUCCEEDED";
        case "CANCEL_REQUESTED": return "CANCELLING";
        case "CANCELLED":
        case "CANCELED": return "CANCELLED";
        case "FAILED": return "FAILED";
        default: return "FAILED";
    }
}

export function newSearchablePdfV2RequestIdentity(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `pdfnest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function safeSearchablePdfDownloadFilename(value: string): string {
    const base = value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `${base || "document"}-searchable.pdf`;
}
