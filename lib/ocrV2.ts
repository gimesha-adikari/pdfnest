import { getBaseUrl } from "@/lib/api";

export type OcrTextV2State =
    | "IDLE"
    | "FILE_READY"
    | "SUBMITTING"
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLING"
    | "CANCELLED";

export type OcrTextV2RoutingPolicy = "AUTO" | "FAST" | "QUALITY";

export interface OcrTextV2Language {
    code: string;
    name: string;
}

export interface OcrTextV2RoutingMode {
    id: OcrTextV2RoutingPolicy;
    label: string;
    description: string;
    available: boolean;
}

export interface OcrTextV2Capabilities {
    schema_version?: string;
    service_ready?: boolean;
    languages: OcrTextV2Language[];
    routing_modes: OcrTextV2RoutingMode[];
    quality_engine_available: boolean;
}

export interface OcrTextV2Progress {
    completed_pages: number;
    total_pages: number;
    failed_pages: number[];
    current_page?: number;
    page_statuses: Record<string, string>;
    percent: number;
}

export interface OcrTextV2Error {
    code: string;
    message: string;
}

export interface OcrTextV2JobStatus {
    job_id: string;
    status: OcrTextV2State | string;
    created_at: string;
    updated_at: string;
    started_at?: string;
    finished_at?: string;
    profile: string;
    language: string;
    routing_policy: OcrTextV2RoutingPolicy | string;
    progress: OcrTextV2Progress;
    warnings: string[];
    result_available: boolean;
    error?: OcrTextV2Error;
}

export interface OcrTextV2Page {
    page_index: number;
    page_id: string;
    status: string;
    text: string;
    classification: string;
    source: string;
    language: Record<string, unknown>;
    warning_codes: string[];
}

export interface OcrTextV2Result {
    schema_version: string;
    request_id: string;
    profile: string;
    status: string;
    text: string;
    pages: OcrTextV2Page[];
    warnings: string[];
    error?: OcrTextV2Error;
}

export class OcrTextV2ApiError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, message: string, status: number) {
        super(message);
        this.name = "OcrTextV2ApiError";
        this.code = code;
        this.status = status;
    }
}

function endpoint(path: string): string {
    return `${getBaseUrl()}${path}`;
}

async function parseError(response: Response): Promise<OcrTextV2ApiError> {
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    const root = isRecord(payload) ? payload : {};
    const detail = isRecord(root.detail) ? root.detail : root;
    const code = typeof detail.code === "string" ? detail.code : codeForStatus(response.status);
    const message = typeof detail.message === "string" ? detail.message : safeMessageForCode(code);
    return new OcrTextV2ApiError(code, message, response.status);
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

export function safeMessageForCode(code: string): string {
    switch (code) {
        case "INVALID_INPUT":
            return "Choose a valid PDF and try again.";
        case "UNSUPPORTED_LANGUAGE":
            return "Choose one of the available languages to continue.";
        case "ENGINE_UNAVAILABLE":
            return "OCR is temporarily unavailable. Please try again shortly.";
        case "TIMEOUT":
            return "OCR took too long to finish. You can try this document again.";
        case "CANCELLED":
            return "OCR processing was cancelled.";
        case "RESULT_NOT_READY":
            return "The text result is not ready yet.";
        case "RESULT_EXPIRED":
            return "This result is no longer available. Start a new run to process the PDF again.";
        case "FORBIDDEN":
            return "This OCR job is not available for your account.";
        case "AUTHENTICATION_REQUIRED":
            return "Sign in to use OCR Text V2.";
        case "TASK_STORAGE_UNAVAILABLE":
            return "The OCR service is temporarily unavailable. Please retry this submission.";
        case "PROFILE_NOT_ELIGIBLE":
        case "CAPABILITY_MISMATCH":
        case "NATIVE_TEXT_UNDECIDED":
        case "INVALID_ENGINE_OUTPUT":
        case "ENGINE_FAILURE":
            return "OCR could not complete this document. You can try it again.";
        default:
            return "OCR could not complete this request. Please try again.";
    }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(endpoint(path), {
            ...init,
            credentials: "include",
        });
    } catch {
        throw new OcrTextV2ApiError("TASK_STORAGE_UNAVAILABLE", safeMessageForCode("TASK_STORAGE_UNAVAILABLE"), 0);
    }
    if (!response.ok) throw await parseError(response);
    try {
        return (await response.json()) as T;
    } catch {
        throw new OcrTextV2ApiError("INVALID_ENGINE_OUTPUT", safeMessageForCode("INVALID_ENGINE_OUTPUT"), response.status);
    }
}

export async function getOcrTextV2Capabilities(): Promise<OcrTextV2Capabilities> {
    return requestJson<OcrTextV2Capabilities>("/api/v2/ocr/text/capabilities");
}

export async function createOcrTextV2Job(
    file: File,
    language: string,
    routingPolicy: OcrTextV2RoutingPolicy,
    idempotencyKey: string,
    requestId: string,
): Promise<OcrTextV2JobStatus> {
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);
    form.append("routing_policy", routingPolicy);

    return requestJson<OcrTextV2JobStatus>("/api/v2/ocr/text/jobs", {
        method: "POST",
        headers: {
            "Idempotency-Key": idempotencyKey,
            "X-Request-ID": requestId,
        },
        body: form,
    });
}

export async function getOcrTextV2Job(jobId: string): Promise<OcrTextV2JobStatus> {
    return requestJson<OcrTextV2JobStatus>(`/api/v2/ocr/text/jobs/${encodeURIComponent(jobId)}`);
}

export async function getOcrTextV2Result(jobId: string): Promise<OcrTextV2Result> {
    return requestJson<OcrTextV2Result>(`/api/v2/ocr/text/jobs/${encodeURIComponent(jobId)}/result`);
}

export async function cancelOcrTextV2Job(jobId: string): Promise<OcrTextV2JobStatus> {
    return requestJson<OcrTextV2JobStatus>(`/api/v2/ocr/text/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
    });
}

export function normalizeOcrTextV2State(status: string): OcrTextV2State {
    switch (status.toUpperCase()) {
        case "QUEUED":
            return "QUEUED";
        case "RUNNING":
        case "PROCESSING":
            return "RUNNING";
        case "SUCCEEDED":
        case "COMPLETED":
            return "SUCCEEDED";
        case "CANCELLED":
        case "CANCELED":
            return "CANCELLED";
        case "CANCEL_REQUESTED":
            return "CANCELLING";
        case "FAILED":
            return "FAILED";
        default:
            return "FAILED";
    }
}

export function warningMessage(code: string): string {
    if (code === "ENGINE_FALLBACK:PP_OCR_UNAVAILABLE_TO_TESSERACT") {
        return "The enhanced OCR path was unavailable, so standard OCR was used.";
    }
    if (code.startsWith("ENGINE_FALLBACK:")) {
        return "A fallback OCR path was used for part of this document.";
    }
    return "Some pages completed with a processing warning.";
}

export function safeDownloadFilename(fileName: string): string {
    const base = fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    return `${base || "document"}-extracted-text.txt`;
}
