"use client";

import { getBaseUrl } from "@/lib/api";
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

const TERMINAL = new Set<EditorJobStatus>([
    "succeeded",
    "failed",
    "cancelled",
]);

export async function submitEditorExtract(formData: FormData): Promise<EditorJobSubmission> {
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
