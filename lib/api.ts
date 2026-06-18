import axios from "axios";

export interface BackendError {
    code: string;
    message: string;
}

/**
 * Safe header reader (works with AxiosHeaders + plain objects)
 */
function getHeader(headers: unknown, key: string): string {
    if (!headers || typeof headers !== "object") return "";

    const h = headers as Record<string, unknown>;

    const direct = h[key];
    if (typeof direct === "string") return direct;

    const lower = h[key.toLowerCase()];
    if (typeof lower === "string") return lower;

    // AxiosHeaders fallback
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

    if (!response) {
        throw new Error(error.message || "Network transport failure.");
    }

    const data = response.data;

    if (data instanceof Blob) {
        let text = "";

        try {
            text = await data.text();
        } catch {
            throw new Error("Failed to read error response from the server.");
        }

        // 1. Try to parse it as JSON first, without throwing inside the try block
        let parsed: any = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            // It's not JSON, which is fine!
        }

        // 2. Now evaluate what we got and throw the clean message
        if (parsed && typeof parsed === "object") {
            throw new Error(parsed.message || parsed.error || "Server error occurred.");
        } else {
            throw new Error(text || `Server rejected request with status ${response.status}`);
        }
    }

    // Standard fallback if the response wasn't a Blob
    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        throw new Error(parsed.message || parsed.error || JSON.stringify(parsed));
    } catch {
        throw new Error(typeof data === "string" ? data : `Server rejected request with status ${response.status}`);
    }
}

/**
 * Base URL resolver
 */
function getBaseUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

/**
 * Main API function: upload → process → optional re-lock → download
 */
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
                }
            );

            resultBlob = lockResponse.data;
        } catch (error) {
            console.warn("Security re-lock failed:", error);
        }
    }

    return resultBlob;
}