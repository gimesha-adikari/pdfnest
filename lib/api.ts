import axios from "axios";

export interface BackendError {
    code: string;
    message: string;
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
            // Return an unresolved promise to halt execution in the current call stack
            return new Promise(() => {}) as Promise<never>;
        }
    }

    if (response.status === 429) {
        throw new Error("Daily processing limit reached! Please upgrade to Pro tier to continue.");
    }

    const data = response.data;

    if (data instanceof Blob) {
        let text = "";

        try {
            text = await data.text();
        } catch {
            throw new Error("Failed to read error response from the server.");
        }

        let parsed: any = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            // Ignore parse error
        }

        if (parsed && typeof parsed === "object") {
            throw new Error(parsed.message || parsed.error || "Server error occurred.");
        } else {
            throw new Error(text || `Server rejected request with status ${response.status}`);
        }
    }

    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        throw new Error(parsed.message || parsed.error || JSON.stringify(parsed));
    } catch {
        throw new Error(typeof data === "string" ? data : `Server rejected request with status ${response.status}`);
    }
}

export function getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "https://pdfnest-backend-mm9q.onrender.com/api";
}

export async function uploadAndDownloadFile(
    endpoint: string,
    formData: FormData,
    onProgress?: (percentage: number) => void
): Promise<Blob> {
    const baseUrl = getBaseUrl();
    const targetUrl = endpoint.startsWith("http")
        ? endpoint
        : `${baseUrl}${endpoint}`;

    const fileEntry = formData.get("file");

    if (fileEntry instanceof File && fileEntry.size > 50 * 1024 * 1024) {
        throw new Error("File payload exceeds maximum platform allowance of 15MB.");
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
                { type: "application/pdf" }
            );

            lockForm.append("file", processedFile);
            lockForm.append("password", passwordToRestore);

            const lockResponse = await axios.post(
                `${baseUrl}/api/security/lock`,
                lockForm,
                {
                    responseType: "blob",
                    withCredentials: true, // Maintain session during re-lock
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
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
    const url = `${BASE_URL}${endpoint}`;

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
                return new Promise(() => {}) as Promise<T>;
            }
        }

        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || errPayload.message || `Network error: ${response.status}`);
    }

    if (response.status === 204) return {} as T;

    return response.json();
}