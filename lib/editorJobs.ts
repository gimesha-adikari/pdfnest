"use client";

import { getBaseUrl } from "@/lib/api";
import { markCloudSubmissionInitiated } from "@/lib/security/pdfInputPreparation";
import { abortableDelay } from "@/lib/abortableDelay";

export type EditorJobStatus =
    | "queued"
    | "running"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "cancelled";

export interface EditorJobSubmission {
    success: boolean;
    job_id: string;
    status: string;
    queue_name: string;
    source_tracker?: string;
    source_name?: string;
}

export interface EditorJobRecord {
    id: string;
    job_type: string;
    status: EditorJobStatus;
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: string | null;
    error_code?: string | null;
    cancel_requested: boolean;
}

export interface WordEditArtifactMetadata {
    compiler_protocol?: unknown;
    artifact_sha256?: unknown;
    page_count?: unknown;
}

/** Verify the exact worker artifact before it can be previewed or downloaded. */
export async function verifyWordEditArtifact(
    blob: Blob,
    metadata: WordEditArtifactMetadata,
    expectedPageCount: number,
): Promise<{ artifactSha256: string; pageCount: number }> {
    if (metadata.compiler_protocol !== "platen_word_edits.v1") {
        throw new Error("The worker did not confirm the validated word-edit protocol.");
    }
    if (typeof metadata.artifact_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.artifact_sha256)) {
        throw new Error("The worker did not return a valid PDF artifact digest.");
    }
    if (!Number.isSafeInteger(metadata.page_count) || metadata.page_count !== expectedPageCount || expectedPageCount < 1) {
        throw new Error("The compiled PDF page count does not match the source document.");
    }
    if (blob.size < 8) throw new Error("The compiled PDF artifact is empty or truncated.");
    const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    if (header !== "%PDF-") throw new Error("The worker response is not a PDF artifact.");
    if (!globalThis.crypto?.subtle) throw new Error("This browser cannot verify the compiled PDF artifact digest.");
    const bytes = await blob.arrayBuffer();
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    const artifactSha256 = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
    if (artifactSha256 !== metadata.artifact_sha256) {
        throw new Error("The downloaded PDF bytes do not match the validated worker artifact.");
    }
    return { artifactSha256, pageCount: metadata.page_count };
}

const TERMINAL = new Set<EditorJobStatus>([
    "succeeded",
    "failed",
    "cancelled",
]);

export class EditorRequestError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

function responseError(status: number): EditorRequestError {
    const messages: Record<number, string> = {
        400: "The extraction request was rejected. Check the PDF and extraction settings.",
        401: "Your session expired. Sign in again to continue.",
        403: "This session does not have access to the extraction.",
        413: "The PDF is larger than the upload limit.",
        422: "The PDF or extraction settings could not be accepted.",
        429: "The processing limit was reached. Try again when your allowance resets.",
    };
    return new EditorRequestError(status, messages[status] ?? `The extraction service returned HTTP ${status}.`);
}

interface TrackedExtractionOptions {
    requestId: string;
    onUploadComplete: () => void;
}

const UPLOAD_TIMEOUT_MS = 120_000;
const ACK_TIMEOUT_MS = 50_000;
const READ_TIMEOUT_MS = 20_000;

function trackedExtractionUpload(formData: FormData, options: TrackedExtractionOptions): Promise<EditorJobSubmission> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${getBaseUrl()}/api/edit/extract`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Idempotency-Key", options.requestId);
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const startDeadline = (ms: number, message: string) => {
            clearTimeout(deadline);
            deadline = setTimeout(() => {
                reject(new Error(message));
                xhr.abort();
            }, ms);
        };
        startDeadline(UPLOAD_TIMEOUT_MS, "The PDF upload did not complete in time.");
        xhr.upload.onload = () => {
            options.onUploadComplete();
            startDeadline(ACK_TIMEOUT_MS, "The server did not acknowledge the extraction in time.");
        };
        xhr.onloadend = () => clearTimeout(deadline);
        xhr.onerror = () => reject(new Error("The connection was lost before the extraction was acknowledged."));
        xhr.onabort = () => reject(new Error("The extraction request was interrupted."));
        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(responseError(xhr.status));
                return;
            }
            try {
                const submission = JSON.parse(xhr.responseText) as EditorJobSubmission;
                if (submission.success !== true || typeof submission.job_id !== "string" || !submission.job_id.trim() ||
                    typeof submission.source_tracker !== "string" || !submission.source_tracker.trim()) {
                    throw new Error("The extraction acknowledgment was incomplete.");
                }
                resolve(submission);
            } catch (error) {
                reject(error);
            }
        };
        try {
            xhr.send(formData);
        } catch (error) {
            clearTimeout(deadline);
            reject(error);
        }
    });
}

export type EditorExtractionReceipt =
    | { state: "accepted"; job_id: string; source_tracker: string }
    | { state: "pending" | "not_found" | "expired" };

export async function getEditorExtractionReceipt(requestId: string, signal: AbortSignal): Promise<EditorExtractionReceipt> {
    const response = await fetch(`${getBaseUrl()}/api/edit/extract/requests/${encodeURIComponent(requestId)}`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT_MS)]),
    });
    if (!response.ok) throw responseError(response.status);
    const receipt = await response.json() as EditorExtractionReceipt;
    if (receipt?.state === "accepted" && receipt.job_id && receipt.source_tracker) return receipt;
    if (receipt?.state === "not_found" || receipt?.state === "pending" || receipt?.state === "expired") return receipt;
    throw new Error("The extraction receipt was invalid.");
}

export async function submitEditorExtract(formData: FormData, tracking?: TrackedExtractionOptions): Promise<EditorJobSubmission> {
    const files: File[] = [];
    if (typeof File !== "undefined") {
        formData.forEach((value) => {
            if (value instanceof File) files.push(value);
        });
    }
    markCloudSubmissionInitiated(files);
    if (tracking) return trackedExtractionUpload(formData, tracking);
    const response = await fetch(`${getBaseUrl()}/api/edit/extract`, {
        method: "POST",
        body: formData,
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

export async function submitEditorCompile(body: unknown): Promise<EditorJobSubmission> {
    const response = await fetch(`${getBaseUrl()}/api/edit/compile`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

export async function getEditorJob(jobId: string, signal?: AbortSignal): Promise<EditorJobRecord> {
    const response = await fetch(`${getBaseUrl()}/api/edit/jobs/${jobId}`, {
        credentials: "include",
        cache: "no-store",
        signal,
    });

    if (!response.ok) throw responseError(response.status);

    return response.json();
}

export async function downloadEditorJob(jobId: string): Promise<Blob> {
    const response = await fetch(`${getBaseUrl()}/api/edit/jobs/${jobId}/download`, {
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    // Consume the verified response bytes before constructing the Blob. The
    // browser runtime failed Response.blob() while reading large scanned PDFs,
    // even though the same response body was readable as an ArrayBuffer.
    const bytes = await response.arrayBuffer();
    return new Blob([bytes], { type: response.headers.get("Content-Type") || "application/pdf" });
}

const STALL_TIMEOUT_MS = 180_000; // 3 minutes without progress advance

const JOB_TRACKING_LIMIT_MS = 8 * 60_000;
const MAX_READ_FAILURES = 3;

export async function waitForEditorJob(
    jobId: string,
    onUpdate?: (job: EditorJobRecord) => void,
    signal?: AbortSignal,
    boundedTracking = false,
): Promise<EditorJobRecord> {
    const stopAt = Date.now() + JOB_TRACKING_LIMIT_MS;
    let readFailures = 0;
    let lastProgress = -1;
    let lastStatus = "";
    let lastMessage = "";
    let lastActivityTime = Date.now();

    while (true) {
        signal?.throwIfAborted();
        const remaining = stopAt - Date.now();
        if (boundedTracking && remaining <= 0) throw new Error("The job tracking window ended.");
        const readTimeout = boundedTracking ? AbortSignal.timeout(Math.min(remaining, READ_TIMEOUT_MS)) : undefined;
        const readSignal = readTimeout && signal ? AbortSignal.any([signal, readTimeout]) : readTimeout ?? signal;
        let job: EditorJobRecord;
        try {
            job = await getEditorJob(jobId, readSignal);
            readFailures = 0;
        } catch (error) {
            signal?.throwIfAborted();
            if (!boundedTracking || error instanceof EditorRequestError && error.status < 500 ||
                ++readFailures >= MAX_READ_FAILURES) throw error;
            await abortableDelay(1500, signal);
            continue;
        }
        if (boundedTracking && (job.id !== jobId || !["queued", "running", "cancel_requested", ...TERMINAL].includes(job.status))) {
            throw new Error("The job status response did not match the extraction.");
        }
        onUpdate?.(job);

        if (TERMINAL.has(job.status)) {
            return job;
        }

        if (job.progress !== lastProgress || job.status !== lastStatus || job.message !== lastMessage) {
            lastProgress = job.progress;
            lastStatus = job.status;
            lastMessage = job.message;
            lastActivityTime = Date.now();
        } else if (Date.now() - lastActivityTime > STALL_TIMEOUT_MS) {
            throw new Error("Job execution stalled without progress for more than 3 minutes.");
        }

        await abortableDelay(1500, signal);
    }
}
