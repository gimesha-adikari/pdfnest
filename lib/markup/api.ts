import { getBaseUrl } from "@/lib/api";
import type {
    JobRecord,
    JobSubmissionResponse,
    MarkupBox,
    MarkupKind,
    MarkupMode,
    PDFAnalysis,
    PageAnalysis,
} from "./types";

const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled"];

export function buildApiUrl(path: string) {
    const base = getBaseUrl().replace(/\/+$/, "");
    return `${base}${path}`;
}

function extractErrorMessage(rawText: string, fallback: string) {
    if (!rawText) return fallback;
    try {
        const parsed = JSON.parse(rawText);
        return parsed.message || parsed.error || rawText;
    } catch {
        return rawText;
    }
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(extractErrorMessage(text, `${fallbackMessage} with status ${response.status}`));
    }
    return JSON.parse(text) as T;
}

export async function submitMarkupJob(
    kind: MarkupKind,
    file: File,
    boxes: MarkupBox[],
    mode: MarkupMode,
    filePassword?: string
): Promise<JobSubmissionResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("boxes", JSON.stringify(boxes));
    formData.append("mode", mode);

    if (filePassword?.trim()) {
        formData.append("file_password", filePassword.trim());
    }

    const response = await fetch(buildApiUrl(`/api/markup/${kind}`), {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
            "Idempotency-Key": crypto.randomUUID(),
        },
    });

    return readJson<JobSubmissionResponse>(response, "Request failed");
}

export async function fetchMarkupJob(jobId: string): Promise<JobRecord> {
    const response = await fetch(buildApiUrl(`/api/markup/jobs/${jobId}`), {
        method: "GET",
        credentials: "include",
    });

    return readJson<JobRecord>(response, "Request failed");
}

export async function waitForMarkupJob(
    jobId: string,
    onUpdate: (job: JobRecord) => void,
    signal?: AbortSignal
): Promise<JobRecord> {
    while (true) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        const job = await fetchMarkupJob(jobId);
        onUpdate(job);

        if (TERMINAL_JOB_STATUSES.includes(job.status)) {
            return job;
        }

        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => resolve(), 1000);

            if (signal) {
                signal.addEventListener(
                    "abort",
                    () => {
                        window.clearTimeout(timer);
                        reject(new DOMException("Aborted", "AbortError"));
                    },
                    { once: true }
                );
            }
        });
    }
}

export async function downloadMarkupJobPdf(jobId: string): Promise<Blob> {
    const response = await fetch(buildApiUrl(`/api/markup/jobs/${jobId}/download`), {
        method: "GET",
        credentials: "include",
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(extractErrorMessage(text, `Download failed with status ${response.status}`));
    }

    return await response.blob();
}

export async function analyzePdfStructure(
    file: File,
    filePassword?: string,
    signal?: AbortSignal
): Promise<Record<number, PageAnalysis>> {
    const formData = new FormData();
    formData.append("file", file);
    if (filePassword) formData.append("file_password", filePassword);

    const response = await fetch(buildApiUrl("/api/structure/analyze"), {
        method: "POST",
        body: formData,
        signal,
        credentials: "include",
    });

    const parsed = await readJson<PDFAnalysis>(response, "Server rejected request");
    const map: Record<number, PageAnalysis> = {};
    for (const page of parsed.pages ?? []) {
        map[page.page] = page;
    }
    return map;
}
