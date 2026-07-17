"use client";

import { getBaseUrl } from "@/lib/api";

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
}

export interface EditorJobRecord {
    id: string;
    job_type: string;
    status: EditorJobStatus;
    progress: number;
    message: string;
    result: Record<string, any> | null;
    error: string | null;
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

export async function getEditorJob(jobId: string): Promise<EditorJobRecord> {
    const response = await fetch(`${getBaseUrl()}/api/edit/jobs/${jobId}`, {
        credentials: "include",
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

export async function waitForEditorJob(
    jobId: string,
    onUpdate?: (job: EditorJobRecord) => void
): Promise<EditorJobRecord> {
    while (true) {
        const job = await getEditorJob(jobId);
        onUpdate?.(job);

        if (TERMINAL.has(job.status)) {
            return job;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
}