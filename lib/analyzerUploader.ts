import { requestR2PresignedUploads, uploadFileToPresignedUrl } from "./r2";

export interface AnalyzerUploadResult {
    storageKey: string;
    fileName: string;
    sha256?: string;
    size: number;
    repositoryName: string;
}

function getBackendBaseUrl(): string {
    if (typeof window !== "undefined") {
        return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    }
    return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

/**
 * uploadArchiveToStorage uploads a ZIP file or bundled directory to authoritative storage.
 * It first tries R2 presigned uploads if configured; if unavailable, it seamlessly uploads
 * directly via multipart POST to /api/v1/analyzer/upload on the backend.
 *
 * If persistence fails, it throws a classified error and NEVER returns a fake key.
 */
export async function uploadArchiveToStorage(
    file: File | Blob,
    fileName: string,
    repositoryName?: string
): Promise<AnalyzerUploadResult> {
    const safeName = fileName.endsWith(".zip") ? fileName : `${fileName}.zip`;
    const cleanRepoName = repositoryName || safeName.replace(/\.zip$/i, "") || "repository";

    // 1. Try R2 Presigned Upload if available
    try {
        const uploadableFile = file instanceof File ? file : new File([file], safeName, { type: "application/zip" });
        const fileLike = {
            name: safeName,
            size: uploadableFile.size,
            type: "application/zip",
        };

        const presigned = await requestR2PresignedUploads([fileLike], {
            purpose: "repository_analyzer",
            prefix: "repositories/raw",
        });

        if (presigned && presigned[0]?.uploadUrl && presigned[0]?.key) {
            await uploadFileToPresignedUrl(uploadableFile, presigned[0]);
            return {
                storageKey: presigned[0].key,
                fileName: safeName,
                size: uploadableFile.size,
                repositoryName: cleanRepoName,
            };
        }
    } catch {
        // R2 not configured or presign failed -> fall through to direct multipart backend upload
    }

    // 2. Direct Multipart Upload to Backend
    const formData = new FormData();
    formData.append("file", file, safeName);
    if (cleanRepoName) {
        formData.append("repositoryName", cleanRepoName);
    }

    const endpoint = `${getBackendBaseUrl()}/api/v1/analyzer/upload`;
    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            body: formData,
        });
    } catch (networkErr: unknown) {
        const msg = networkErr instanceof Error ? networkErr.message : "Network error";
        throw new Error(`UPLOAD_FAILED: Could not connect to backend upload service (${msg})`);
    }

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const code = errJson.code || "UPLOAD_FAILED";
        const message = errJson.message || `Upload failed with HTTP ${response.status}`;
        throw new Error(`${code}: ${message}`);
    }

    const result = (await response.json()) as AnalyzerUploadResult;
    if (!result.storageKey) {
        throw new Error("UPLOAD_FAILED: Server did not return a valid storage key.");
    }

    return result;
}
