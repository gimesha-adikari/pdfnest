import { BackendError } from "./api";

export function getFriendlyErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        try {
            if (error.message.startsWith("{")) {
                const backendErr: BackendError = JSON.parse(error.message);

                switch (backendErr.code) {
                    case "COMPRESSION_ENGINE_FAILED":
                        return "The optimization processor encountered an issue resizing this PDF. Ensure the file is not corrupted.";
                    case "RASTERIZATION_FAILED":
                    case "OCR_EXTRACTION_FAILED":
                        return "The OCR engine could not read this document's layer context. Try an alternative high-contrast scan.";
                    case "DECRYPTION_AUTH_FAILED":
                    case "DECRYPTION_METADATA_FAILED":
                        return "Access Denied: The password you provided for this encrypted file is incorrect.";
                    case "INVALID_MULTIPART_FORM":
                        return "File transfer failed. Please re-upload your document and try again.";
                    case "INSUFFICIENT_FILES":
                        return "Merging requires at least two distinct PDF documents.";
                    default:
                        return backendErr.message || "An unresolved document pipeline error was encountered.";
                }
            }
        } catch {
        }
        return error.message;
    }
    return "An unmapped connection drop or network anomaly was detected.";
}