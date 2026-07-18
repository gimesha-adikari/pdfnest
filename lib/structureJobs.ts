"use client";

import axios from "axios";
import { getBaseUrl } from "@/lib/api";

export type MarkupMode = "manual" | "smart" | "ocr";
export type MarkupAction = "highlight" | "underline" | "strikeout";

export interface MarkupBox {
    id?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color?: string;
}

export interface JobSubmissionResponse {
    success?: boolean;
    job_id: string;
    status: string;
    queue_name: string;
}

export interface JobRecord {
    id: string;
    job_type: string;
    status: string;
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: string | null;
    cancel_requested: boolean;
}

const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);

function buildUrl(endpoint: string): string {
    const base = getBaseUrl().replace(/\/+$/, "");
    return endpoint.startsWith("http") ? endpoint : `${base}${endpoint}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }

        const timer = window.setTimeout(() => resolve(), ms);

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
        );
    });
}

export async function submitStructureJob(
    endpoint: string,
    formData: FormData,
    onUploadProgress?: (percentage: number) => void
): Promise<JobSubmissionResponse> {
    const response = await axios.post<JobSubmissionResponse>(buildUrl(endpoint), formData, {
        withCredentials: true,
        headers: {
            "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (e) => {
            if (onUploadProgress && e.total) {
                const percent = Math.min(Math.round((e.loaded * 100) / e.total), 90);
                onUploadProgress(percent);
            }
        },
    });

    onUploadProgress?.(100);
    return response.data;
}

export async function fetchStructureJob(jobId: string): Promise<JobRecord> {
    const response = await axios.get<JobRecord>(buildUrl(`/api/markup/jobs/${jobId}`), {
        withCredentials: true,
    });

    return response.data;
}

export async function waitForStructureJob(
    jobId: string,
    onUpdate?: (job: JobRecord) => void,
    signal?: AbortSignal,
    pollMs = 1000
): Promise<JobRecord> {
    while (true) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const job = await fetchStructureJob(jobId);
        onUpdate?.(job);

        if (TERMINAL_STATES.has(job.status)) {
            return job;
        }

        await sleep(pollMs, signal);
    }
}

export async function downloadStructureJob(jobId: string): Promise<Blob> {
    const response = await axios.get(buildUrl(`/api/msrkup/jobs/${jobId}/download`), {
        withCredentials: true,
        responseType: "blob",
    });

    return response.data;
}

export function getStructureJobProgress(job: JobRecord | null, uploadProgress: number): number {
    if (job) return Math.max(0, Math.min(100, job.progress ?? 0));
    return Math.max(0, Math.min(100, uploadProgress));
}