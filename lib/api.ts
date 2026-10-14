import axios from "axios";
import { backendHealth } from "@/lib/health/backendHealth";
import { markCloudSubmissionInitiated } from "@/lib/security/pdfInputPreparation";
import { verifyProtectedPdfBlob } from "@/lib/security/verifyProtectedPdf";

export interface BackendError {
    code: string;
    message: string;
    title?: string;
    description?: string;
    window?: string;
    resetAt?: string;
    upgradeRecommended?: boolean;
    remainingCredits?: number;
    requestedUnits?: number;
    tool?: string;
}

export interface ClientError extends Error {
    status?: number;
    billing?: BackendError;
    raw?: unknown;
}

export type UploadOutputKind = "pdf" | "non-pdf";

function getHeader(headers: unknown, key: string): string {
    if (!headers || typeof headers !== "object") return "";

    const h = headers as Record<string, unknown>;

    const direct = h[key];
    if (typeof direct === "string") return direct;

    const lower = h[key.toLowerCase()];
    if (typeof lower === "string") return lower;

    const maybeGet = (headers as { get?: (k: string) => unknown }).get;
    if (typeof maybeGet === "function") {
        const val = maybeGet.call(headers, key);
        if (typeof val === "string") return val;
    }

    return "";

}

function requestPath(targetUrl: string, baseUrl: string): string {
    try {
        return new URL(targetUrl, baseUrl).pathname.replace(/\/+$/, "");
    } catch {
        return targetUrl.split("?", 1)[0].replace(/\/+$/, "");
    }
}

async function isPdfResponse(responseBlob: Blob, contentType: string): Promise<boolean> {
    const declaredType = contentType.split(";", 1)[0].trim().toLowerCase();
    const blobType = responseBlob.type.split(";", 1)[0].trim().toLowerCase();
    if (declaredType === "application/pdf" || blobType === "application/pdf") return true;

    // Some endpoints return PDF bytes with a missing, generic, or otherwise
    // incorrect media type. Treat a header only as a candidate signal;
    // verifyProtectedPdfBlob still has to parse the artifact and prove that the
    // expected password is required and correct. Callers with a known non-PDF
    // contract pass outputKind="non-pdf" to avoid probing exports or task payloads.
    const prefix = await responseBlob.slice(0, 1024).text();
    return /%PDF-\d\.\d/.test(prefix);
}

function createRequestCancellationError(): ClientError {
    const error = new Error("Request cancelled by user.") as ClientError & { code: string };
    error.name = "AbortError";
    error.code = "USER_CANCELLATION";
    return error;
}

function isRequestCancelled(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted || axios.isCancel(error)) return true;
    if (typeof error !== "object" || error === null) return false;
    const candidate = error as { name?: unknown; code?: unknown };
    return candidate.name === "AbortError" ||
        candidate.name === "CanceledError" ||
        candidate.code === "ERR_CANCELED" ||
        candidate.code === "USER_CANCELLATION";
}

function createProtectionRestorationError(status?: number): ClientError & { code: string } {
    const error = new Error(
        "PDF password protection could not be restored and verified. No result is available."
    ) as ClientError & { code: string };
    error.code = "PDF_PROTECTION_RESTORE_FAILED";
    if (typeof status === "number" && (status < 200 || status >= 300)) error.status = status;
    return error;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseBackendErrorPayload(payload: unknown): BackendError | null {
    if (!isObjectLike(payload)) return null;

    const code = typeof payload.code === "string" ? payload.code : "";
    const message =
        typeof payload.message === "string"
            ? payload.message
            : typeof payload.error === "string"
                ? payload.error
                : "";

    if (!code && !message) return null;

    return {
        code: code || "BILLING_ERROR",
        message: message || "Request failed.",
        title: typeof payload.title === "string" ? payload.title : undefined,
        description: typeof payload.description === "string" ? payload.description : undefined,
        window: typeof payload.window === "string" ? payload.window : undefined,
        resetAt: typeof payload.resetAt === "string" ? payload.resetAt : undefined,
        upgradeRecommended:
            typeof payload.upgradeRecommended === "boolean"
                ? payload.upgradeRecommended
                : false,
        remainingCredits:
            typeof payload.remainingCredits === "number"
                ? payload.remainingCredits
                : undefined,
        requestedUnits:
            typeof payload.requestedUnits === "number"
                ? payload.requestedUnits
                : undefined,
        tool: typeof payload.tool === "string" ? payload.tool : undefined,
    };

}

async function readResponseErrorPayload(response: {
    data: unknown;
    headers?: unknown;
}): Promise<{ billing?: BackendError; message: string }> {
    const data = response.data;

    if (data instanceof Blob) {
        let text = "";
        try {
            text = await data.text();
        } catch {
            return {
                message: "Failed to read error response from the server.",
            };
        }

        try {
            const parsed = JSON.parse(text);
            const billing = parseBackendErrorPayload(parsed);
            if (billing) {
                return {billing, message: billing.message};
            }

            if (isObjectLike(parsed)) {
                const msg =
                    typeof parsed.message === "string"
                        ? parsed.message
                        : typeof parsed.error === "string"
                            ? parsed.error
                            : text;

                return {message: msg || "Server error occurred."};
            }

            return {message: text || "Server error occurred."};
        } catch {
            return {
                message: text || "Server error occurred.",
            };
        }
    }

    if (typeof data === "string") {
        try {
            const parsed = JSON.parse(data);
            const billing = parseBackendErrorPayload(parsed);
            if (billing) {
                return {billing, message: billing.message};
            }

            if (isObjectLike(parsed)) {
                const msg =
                    typeof parsed.message === "string"
                        ? parsed.message
                        : typeof parsed.error === "string"
                            ? parsed.error
                            : data;

                return {message: msg || "Server error occurred."};
            }

            return {message: data || "Server error occurred."};
        } catch {
            return {message: data || "Server error occurred."};
        }
    }

    if (isObjectLike(data)) {
        const billing = parseBackendErrorPayload(data);
        if (billing) {
            return {billing, message: billing.message};
        }

        const message =
            typeof data.message === "string"
                ? data.message
                : typeof data.error === "string"
                    ? data.error
                    : "Server error occurred.";

        return {message};
    }

    return {
        message: `Server rejected request with status ${response.headers ? "" : ""}`.trim(),
    };

}

async function handleAxiosError(error: unknown): Promise<never> {
    if (axios.isCancel(error) || (error as any)?.name === "CanceledError" || (error as any)?.name === "AbortError") {
        const cancelErr = new Error("Request cancelled by user.") as ClientError;
        (cancelErr as any).code = "USER_CANCELLATION";
        throw cancelErr;
    }

    if (!axios.isAxiosError(error)) {
        throw new Error("Unexpected non-Axios error occurred.");
    }

    const response = error.response;
    const configUrl = error.config?.url || "";

    if (!response) {
        backendHealth.markOffline(error.message || "Network transport failure");
        const clientErr = new Error("PDFNest processing service is currently unavailable.") as ClientError;
        clientErr.status = 0;
        clientErr.raw = error;
        throw clientErr;
    }

    if (response.status >= 502 && response.status <= 504) {
        backendHealth.markOffline(`Service unavailable (HTTP ${response.status})`);
    } else if (response.status < 500) {
        backendHealth.markOnline();
    }

    const isAuthEndpoint = configUrl.includes("/status") || configUrl.includes("/auth") || configUrl.includes("/security/unlock");
    if (response.status === 401 && !isAuthEndpoint) {
        if (typeof window !== "undefined") {
            const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?callbackUrl=${currentPath}`;
            return new Promise(() => {
            }) as Promise<never>;
        }
    }

    const parsed = await readResponseErrorPayload({
        data: response.data,
        headers: response.headers,
    });

    const err = new Error(parsed.message) as ClientError;
    err.status = response.status;
    err.billing = parsed.billing;
    err.raw = response.data;

    throw err;

}

export function getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "https://api.platenpdf.com";
}

/**
 * Resolve a task artifact against the configured API origin exactly once.
 *
 * Task APIs may return an absolute API URL, an API-relative path, or a
 * root-relative path. Storage references (for example r2:// keys) and
 * cross-origin/unsupported URLs are not browser download contracts and are
 * rejected instead of being concatenated into an unusable or unsafe URL.
 */
export function resolveDownloadUrl(downloadUrl: string): string {
    const value = String(downloadUrl ?? "").trim();
    if (!value) throw new Error("Download URL is empty.");

    const apiBase = getBaseUrl().replace(/\/+$/, "");
    let apiOrigin: string;
    try {
        apiOrigin = new URL(apiBase).origin;
    } catch {
        throw new Error("Configured API URL is malformed.");
    }

    if (/^https?:\/\//i.test(value)) {
        let absolute: URL;
        try {
            absolute = new URL(value);
        } catch {
            throw new Error("Download URL is malformed.");
        }
        if (absolute.origin !== apiOrigin) {
            throw new Error("Download URL origin is not allowed.");
        }
        return absolute.toString();
    }

    if (value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value)) {
        throw new Error("Download URL must use the configured API origin.");
    }

    const resolved = new URL(`${apiBase}/${value.replace(/^\/+/, "")}`);
    if (resolved.origin !== apiOrigin) {
        throw new Error("Download URL origin is not allowed.");
    }
    return resolved.toString();
}

export async function uploadAndDownloadFile(
    endpoint: string,
    formData: FormData,
    onProgress?: (percentage: number) => void,
    signal?: AbortSignal,
    outputKind?: UploadOutputKind,
): Promise<Blob> {
    const apiUrl = getBaseUrl();
    const targetUrl = endpoint.startsWith("http")
        ? endpoint
        : `${apiUrl}${endpoint}`;
    const endpointPath = requestPath(targetUrl, apiUrl);

    const fileEntry = formData.get("file");

    if (fileEntry instanceof File && fileEntry.size > 50 * 1024 * 1024) {
        throw new Error("File payload exceeds maximum platform allowance of 50MB.");
    }

    const passwordToRestore =
        fileEntry instanceof File
            ? (fileEntry as File & { originalPassword?: string })
                .originalPassword
            : undefined;

    let responseBlob: Blob;
    let contentType = "";

    const submittedFiles: File[] = [];
    if (typeof File !== "undefined") {
        formData.forEach((value) => {
            if (value instanceof File) submittedFiles.push(value);
        });
    }

    try {
        // The request is now locally validated and is about to leave this browser.
        // Keep this marker if the request later fails or is cancelled.
        markCloudSubmissionInitiated(submittedFiles);
        const response = await axios.post(targetUrl, formData, {
            responseType: "blob",
            withCredentials: true,
            signal,
            headers: {
                "Content-Type": "multipart/form-data",
            },
            onUploadProgress: (e) => {
                if (onProgress && e.total) {
                    const percent = (e.loaded * 100) / e.total;
                    onProgress(Math.min(Math.round(percent), 90));
                }
            },
        });

        responseBlob = response.data;
        contentType = getHeader(response.headers, "content-type");
        backendHealth.markOnline();
    } catch (error: unknown) {
        throw await handleAxiosError(error);
    }

    const isPdf = outputKind === "pdf"
        ? true
        : outputKind === "non-pdf"
            ? false
            : await isPdfResponse(responseBlob, contentType);

    let resultBlob = responseBlob;

    if (
        passwordToRestore &&
        isPdf &&
        endpointPath !== "/api/security/unlock" &&
        endpointPath !== "/api/security/lock" &&
        fileEntry instanceof File
    ) {
        if (signal?.aborted) throw createRequestCancellationError();

        try {
            const lockForm = new FormData();

            const processedFile = new File(
                [responseBlob],
                fileEntry.name,
                {type: "application/pdf"}
            );

            lockForm.append("file", processedFile);
            lockForm.append("password", passwordToRestore);

            const lockResponse = await axios.post(
                `${getBaseUrl()}/api/security/lock`,
                lockForm,
                {
                    responseType: "blob",
                    withCredentials: true,
                    signal,
                }
            );

            const status = lockResponse.status;
            if (typeof status !== "number" || status < 200 || status >= 300) {
                throw createProtectionRestorationError(status);
            }
            if (!(lockResponse.data instanceof Blob)) {
                throw createProtectionRestorationError(status);
            }

            // The media type is metadata, not evidence of encryption. Let PDF.js
            // determine whether the response is a valid protected PDF and whether
            // the expected password contract is satisfied.
            await verifyProtectedPdfBlob(lockResponse.data, passwordToRestore, signal);
            resultBlob = lockResponse.data;
        } catch (error) {
            if (isRequestCancelled(error, signal)) throw createRequestCancellationError();
            const status = typeof error === "object" && error !== null &&
                typeof (error as { status?: unknown }).status === "number"
                ? (error as { status: number }).status
                : undefined;
            throw createProtectionRestorationError(status);
        }
    }

    if (signal?.aborted) throw createRequestCancellationError();
    onProgress?.(100);
    return resultBlob;

}

export async function fetchJson<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const API_URL = getBaseUrl() + "/api";
    const url = `${API_URL}${endpoint}`;

    const config: RequestInit = {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    };

    let response: Response;
    try {
        response = await fetch(url, config);
    } catch (networkError: unknown) {
        const message = networkError instanceof Error ? networkError.message : "Failed to connect to backend";
        backendHealth.markOffline(message);
        const clientErr = new Error("PDFNest processing service is currently unavailable.") as ClientError;
        clientErr.status = 0;
        clientErr.raw = networkError;
        throw clientErr;
    }

    if (response.status >= 502 && response.status <= 504) {
        backendHealth.markOffline(`Service unavailable (HTTP ${response.status})`);
    } else if (response.ok || response.status < 500) {
        backendHealth.markOnline();
    }

    if (!response.ok) {
        const isAuthEndpoint =
            endpoint.includes("/status") ||
            endpoint.includes("/auth") ||
            endpoint === "/user/settings/password";

        if (response.status === 401 && !isAuthEndpoint) {
            if (typeof window !== "undefined") {
                const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
                window.location.href = `/login?callbackUrl=${currentPath}`;
                return new Promise(() => {
                }) as Promise<T>;
            }
        }

        const text = await response.text().catch(() => "");
        let parsed: unknown = null;

        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
        }

        const billing = parseBackendErrorPayload(parsed);
        if (billing) {
            const err = new Error(billing.message) as ClientError;
            err.status = response.status;
            err.billing = billing;
            err.raw = parsed;
            throw err;
        }

        if (isObjectLike(parsed)) {
            throw new Error(
                (typeof parsed.message === "string" && parsed.message) ||
                (typeof parsed.error === "string" && parsed.error) ||
                `Network error: ${response.status}`
            );
        }

        throw new Error(text || `Network error: ${response.status}`);
    }

    if (response.status === 204) return {} as T;

    return response.json();

}

/**
 * Fetch a binary API response through the same configured backend boundary as
 * fetchJson.  Download-only endpoints must not use a relative /api URL: that
 * URL resolves against the Next.js frontend origin rather than the backend.
 */
export async function fetchBlob(endpoint: string, options: RequestInit = {}): Promise<Blob> {
    const API_URL = getBaseUrl() + "/api";
    const url = endpoint.startsWith("http")
        ? endpoint
        : `${API_URL}${endpoint}`;

    const config: RequestInit = {
        ...options,
        credentials: "include",
        headers: {
            ...(options.headers || {}),
        },
    };

    let response: Response;
    try {
        response = await fetch(url, config);
    } catch (networkError: unknown) {
        const message = networkError instanceof Error ? networkError.message : "Failed to connect to backend";
        backendHealth.markOffline(message);
        const clientErr = new Error("PDFNest processing service is currently unavailable.") as ClientError;
        clientErr.status = 0;
        clientErr.raw = networkError;
        throw clientErr;
    }

    if (response.status >= 502 && response.status <= 504) {
        backendHealth.markOffline(`Service unavailable (HTTP ${response.status})`);
    } else if (response.ok || response.status < 500) {
        backendHealth.markOnline();
    }

    if (!response.ok) {
        const isAuthEndpoint = endpoint.includes("/status") || endpoint.includes("/auth");

        if (response.status === 401 && !isAuthEndpoint) {
            if (typeof window !== "undefined") {
                const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
                window.location.href = `/login?callbackUrl=${currentPath}`;
                return new Promise(() => {
                }) as Promise<Blob>;
            }
        }

        const text = await response.text().catch(() => "");
        let parsed: unknown = null;
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
        }

        const billing = parseBackendErrorPayload(parsed);
        if (billing) {
            const err = new Error(billing.message) as ClientError;
            err.status = response.status;
            err.billing = billing;
            err.raw = parsed;
            throw err;
        }

        if (isObjectLike(parsed)) {
            throw new Error(
                (typeof parsed.message === "string" && parsed.message) ||
                (typeof parsed.error === "string" && parsed.error) ||
                `Network error: ${response.status}`
            );
        }

        throw new Error(text || `Network error: ${response.status}`);
    }

    return response.blob();
}

export async function submitContactTicket(formData: FormData): Promise<{ success: boolean; ticketNumber: string; message: string }> {
    const url = `${getBaseUrl()}/api/contact`;

    try {
        const response = await axios.post(url, formData, {
            withCredentials: true,
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    } catch (error: unknown) {
        throw await handleAxiosError(error);
    }
}

export function getMailDomain(): string {
    return process.env.MAIL_DOMAIN || "platenpdf.com";
}
