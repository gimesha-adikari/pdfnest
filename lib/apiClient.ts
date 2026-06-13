import axios from "axios";

// file: /home/gimesha/My_Projects/next/pdfnest/lib/apiClient.ts
export interface BackendError {
    code: string;
    message: string;
}

/**
 * Enhanced multipart upload and download wrapper that seamlessly integrates real-time progress callbacks.
 * Preserves downstream JSON unmarshaling logic, content-type isolation, and structural password auto-restoration hooks.
 */
export async function uploadAndDownloadFile(
    endpoint: string,
    formData: FormData,
    onProgress?: (percentage: number) => void
): Promise<Blob> {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const targetUrl = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

    const fileEntry = formData.get("file");
    const passwordToRestore = fileEntry && (fileEntry as any).originalPassword;

    let responseBlob: Blob;
    let responseContentType = "";

    try {
        // 1. Execute the main request stream via Axios to leverage native socket progress tracking
        const response = await axios.post(targetUrl, formData, {
            responseType: "blob", // Forces the network socket to yield raw binary content safely
            headers: {
                "Content-Type": "multipart/form-data",
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    // Cap upload tracking representation at 90% to account for backend computation time
                    onProgress(Math.min(percentCompleted, 90));
                }
            },
        });

        responseBlob = response.data;
        responseContentType = response.headers["content-type"] || "";

    } catch (axiosError: any) {
        // 2. Exact preservation of your original HTTP error text/JSON extraction matrices
        if (axiosError.response) {
            const errorResponse = axiosError.response;
            const contentType = errorResponse.headers["content-type"] || "";

            // Axios response types forced to 'blob' return error payloads inside a Blob structure
            const errorBlob: Blob = errorResponse.data;

            if (contentType.includes("application/json") && errorBlob) {
                try {
                    // Extract text string from blob container to parse JSON elements
                    const errorJsonText = await errorBlob.text();
                    const errorData: BackendError = JSON.parse(errorJsonText);
                    throw new Error(JSON.stringify(errorData));
                } catch (e) {
                    if (e instanceof Error && e.message.startsWith("{")) throw e;
                    throw new Error("Downstream pipeline unmarshaling failure.");
                }
            } else if (errorBlob) {
                const errorText = await errorBlob.text();
                throw new Error(errorText || `Server transaction rejected with status ${errorResponse.status}`);
            } else {
                throw new Error(`Server transaction rejected with status ${errorResponse.status}`);
            }
        }

        // Fallback catch boundary for local network request dropped errors
        throw new Error(axiosError.message || "Network layout pipeline transport layer collapse.");
    }

    // Update progress complete safely right before processing internal encryption wrappers
    if (onProgress) onProgress(100);

    let resultBlob = responseBlob;
    const isPdfResponse = responseContentType.includes("application/pdf") || resultBlob.type === "application/pdf";

    // 3. Exact preservation of your dynamic PDF auto-locking parameters logic
    if (
        passwordToRestore &&
        isPdfResponse &&
        endpoint !== "/api/security/unlock" &&
        endpoint !== "/api/security/lock" &&
        fileEntry instanceof File
    ) {
        try {
            const lockFormData = new FormData();
            const processedFile = new File([resultBlob], fileEntry.name, { type: "application/pdf" });

            lockFormData.append("file", processedFile);
            lockFormData.append("password", passwordToRestore);

            const lockTargetUrl = `${baseUrl}/api/security/lock`;

            // Perform the re-lock operation using Axios
            const lockResponse = await axios.post(lockTargetUrl, lockFormData, {
                responseType: "blob",
                headers: { "Content-Type": "multipart/form-data" }
            });

            resultBlob = lockResponse.data;
        } catch (lockError: any) {
            const status = lockError.response ? lockError.response.status : "unknown";
            console.warn("Security re-lock endpoint rejected transaction status:", status);
            console.error("Universal security re-lock wrapper pipeline fallback caught exception:", lockError);
        }
    }

    return resultBlob;
}