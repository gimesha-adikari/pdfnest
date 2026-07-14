import axios from "axios";

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
    if (!axios.isAxiosError(error)) {
        throw new Error("Unexpected non-Axios error occurred.");
    }

    const response = error.response;
    const configUrl = error.config?.url || "";

    if (!response) {
        throw new Error(error.message || "Network transport failure.");
    }

    const isAuthEndpoint = configUrl.includes("/status") || configUrl.includes("/auth");
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
    return process.env.NEXT_PUBLIC_API_URL || "https://pdfnest-backend-mm9q.onrender.com";
}

export async function uploadAndDownloadFile(
    endpoint: string,
    formData: FormData,
    onProgress?: (percentage: number) => void
): Promise<Blob> {
    const apiUrl = getBaseUrl();
    const targetUrl = endpoint.startsWith("http")
        ? endpoint
        : `${apiUrl}${endpoint}`;

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

    try {
        const response = await axios.post(targetUrl, formData, {
            responseType: "blob",
            withCredentials: true,
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
    } catch (error: unknown) {
        throw await handleAxiosError(error);
    }

    onProgress?.(100);

    const isPdf =
        contentType.includes("application/pdf") ||
        responseBlob.type === "application/pdf";

    let resultBlob = responseBlob;

    if (
        passwordToRestore &&
        isPdf &&
        endpoint !== "/api/security/unlock" &&
        endpoint !== "/api/security/lock" &&
        fileEntry instanceof File
    ) {
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
                }
            );

            resultBlob = lockResponse.data;
        } catch (error) {
            console.warn("Security re-lock failed:", error);
        }
    }

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

    const response = await fetch(url, config);

    if (!response.ok) {
        const isAuthEndpoint = endpoint.includes("/status") || endpoint.includes("/auth");

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
