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

export async function submitEditorExtract(formData: FormData): Promise<EditorJobSubmission> {
    const files: File[] = [];
    if (typeof File !== "undefined") {
        formData.forEach((value) => {
            if (value instanceof File) files.push(value);
        });
    }
    markCloudSubmissionInitiated(files);
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
        signal,
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}

export async function downloadEditorJob(jobId: string): Promise<Blob> {
    const response = await fetch(`${getBaseUrl()}/api/edit/jobs/${jobId}/download`, {
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.blob();
}

const STALL_TIMEOUT_MS = 180_000; // 3 minutes without progress advance

export async function waitForEditorJob(
    jobId: string,
    onUpdate?: (job: EditorJobRecord) => void,
    signal?: AbortSignal,
): Promise<EditorJobRecord> {
    let lastProgress = -1;
    let lastStatus = "";
    let lastMessage = "";
    let lastActivityTime = Date.now();

    while (true) {
        signal?.throwIfAborted();
        const job = await getEditorJob(jobId, signal);
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
