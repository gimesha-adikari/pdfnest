import { getBaseUrl } from "@/lib/api";

export interface FileLike {
    name: string;
    size: number;
    type: string;
}

export interface R2UploadItem extends FileLike {
    key: string;
    uploadUrl: string;
    method: string;
    headers?: Record<string, string>;
    publicUrl?: string;
}

export interface R2PresignResponse {
    files?: R2UploadItem[];
    uploads?: R2UploadItem[];
    items?: R2UploadItem[];
    data?: R2UploadItem[];
}

export interface R2UploadOptions {
    purpose: string;
    prefix: string;
    endpoint?: string;
    credentials?: RequestCredentials;
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
}

function randomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function safeFileName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "file";

    const lastDot = trimmed.lastIndexOf(".");
    const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;

    const base = hasExt ? trimmed.slice(0, lastDot) : trimmed;
    const ext = hasExt ? trimmed.slice(lastDot) : "";

    const cleanBase = base
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");

    const cleanExt = ext.replace(/[^a-zA-Z0-9.]+/g, "");

    return `${cleanBase || "file"}${cleanExt}`;
}

export function createUploadSessionId(): string {
    return randomId();
}

export function createStoragePrefix(params: {
    toolId: string;
    purpose: string;
    sessionId?: string;
}): string {
    const tool = normalizeSegment(params.toolId) || "tool";
    const purpose = normalizeSegment(params.purpose) || "uploads";
    const sessionId = params.sessionId || createUploadSessionId();

    return [tool, purpose, sessionId].join("/");
}

export function buildR2ObjectKey(prefix: string, file: FileLike, index: number): string {
    const safeName = safeFileName(file.name);
    const ordinal = String(index + 1).padStart(3, "0");
    return `${prefix}/${ordinal}-${safeName}`;
}

export async function requestR2PresignedUploads(
    files: FileLike[],
    options: R2UploadOptions
): Promise<R2UploadItem[]> {
    if (options.signal?.aborted) {
        throw new DOMException("Upload cancelled", "AbortError");
    }

    const endpoint =
        options.endpoint || `${getBaseUrl()}/api/storage/r2/presign`;

    const response = await fetch(endpoint, {
        method: "POST",
        credentials: options.credentials ?? "include",
        signal: options.signal,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            purpose: options.purpose,
            prefix: options.prefix,
            files: files.map((file, index) => ({
                name: file.name,
                size: file.size,
                type: file.type,
                key: buildR2ObjectKey(options.prefix, file, index),
            })),
        }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to request R2 upload URLs (${response.status}).`);
    }

    const payload = (await response.json()) as R2PresignResponse | R2UploadItem[];

    const items = Array.isArray(payload)
        ? payload
        : payload.files || payload.uploads || payload.items || payload.data || [];

    const normalized = items.map((item) => {
        const uploadUrl =
            item.uploadUrl ||
            (item as any).upload_url ||
            (item as any).url ||
            (item as any).presignedUrl ||
            (item as any).presigned_url ||
            "";

        const key =
            item.key ||
            (item as any).objectKey ||
            (item as any).object_key ||
            "";

        if (!uploadUrl) {
            throw new Error("R2 presign response is missing an upload URL.");
        }

        if (!key) {
            throw new Error("R2 presign response is missing an object key.");
        }

        return {
            key,
            uploadUrl,
            method: (item.method || "PUT").toUpperCase(),
            headers: item.headers || {},
            publicUrl:
                item.publicUrl ||
                (item as any).public_url ||
                (item as any).downloadUrl ||
                (item as any).download_url,
            name: item.name,
            size: item.size,
            type: item.type,
        } satisfies R2UploadItem;
    });

    if (normalized.length !== files.length) {
        throw new Error(
            `R2 presign response count mismatch: expected ${files.length}, got ${normalized.length}.`
        );
    }

    return normalized;
}

export function uploadFileToPresignedUrl(
    file: File,
    target: R2UploadItem,
    signal?: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Upload cancelled", "AbortError"));
            return;
        }

        const xhr = new XMLHttpRequest();

        const onAbort = () => {
            xhr.abort();
            reject(new DOMException("Upload cancelled", "AbortError"));
        };

        if (signal) {
            signal.addEventListener("abort", onAbort, { once: true });
        }

        xhr.open(target.method || "PUT", target.uploadUrl, true);

        Object.entries(target.headers || {}).forEach(([name, value]) => {
            xhr.setRequestHeader(name, value);
        });

        xhr.onload = () => {
            if (signal) signal.removeEventListener("abort", onAbort);
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }

            reject(
                new Error(
                    `Failed uploading ${file.name} to R2 (${xhr.status}). ${xhr.responseText || ""}`.trim()
                )
            );
        };

        xhr.onerror = () => {
            if (signal) signal.removeEventListener("abort", onAbort);
            if (signal?.aborted) {
                reject(new DOMException("Upload cancelled", "AbortError"));
            } else {
                reject(new Error(`Network error while uploading ${file.name} to R2.`));
            }
        };

        xhr.onabort = () => {
            if (signal) signal.removeEventListener("abort", onAbort);
            reject(new DOMException("Upload cancelled", "AbortError"));
        };

        xhr.send(file);
    });
}

export async function uploadFilesToR2(
    files: File[],
    options: R2UploadOptions
): Promise<R2UploadItem[]> {
    if (options.signal?.aborted) {
        throw new DOMException("Upload cancelled", "AbortError");
    }

    const presigned = await requestR2PresignedUploads(files, options);

    if (options.signal?.aborted) {
        throw new DOMException("Upload cancelled", "AbortError");
    }

    let completedCount = 0;
    options.onProgress?.(0, files.length);

    await Promise.all(
        files.map(async (file, index) => {
            if (options.signal?.aborted) {
                throw new DOMException("Upload cancelled", "AbortError");
            }
            await uploadFileToPresignedUrl(file, presigned[index], options.signal);
            completedCount += 1;
            options.onProgress?.(completedCount, files.length);
        })
    );

    return presigned;
}