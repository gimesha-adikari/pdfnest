import { BackendError, ClientError } from "./api";
import { notify, notifyBackendError } from "./notify";

export function getFriendlyErrorMessage(error: unknown): string {
    if (!error) {
        return "Something went wrong.";
    }

    const err = error as any;

    const billing: BackendError | undefined = err?.billing || err?.originalError?.billing;
    if (billing) {
        return billing.message || "Request limit reached.";
    }

    if (error instanceof Error) {
        const msg = error.message || "";
        const lowerMsg = msg.toLowerCase();

        const status = typeof err?.status === "number" ? err.status : err?.originalError?.status;

        if (
            status === 0 ||
            (typeof status === "number" && status >= 502 && status <= 504) ||
            lowerMsg === "failed to fetch" ||
            lowerMsg === "network error" ||
            lowerMsg === "econnrefused"
        ) {
            return "PDFNest processing service is currently unavailable. Please check your connection or switch to local processing.";
        }

        try {
            if (err.message.startsWith("{")) {
                const backendErr: BackendError = JSON.parse(err.message);

                switch (backendErr.code) {
                    case "COMPRESSION_ENGINE_FAILED":
                        return "The optimization processor encountered an issue resizing this PDF. Ensure the file is not corrupted.";

                    case "RASTERIZATION_FAILED":
                    case "OCR_EXTRACTION_FAILED":
                        return "The OCR engine could not read this document. Try a higher quality scan.";

                    case "DECRYPTION_AUTH_FAILED":
                    case "DECRYPTION_METADATA_FAILED":
                        return "Incorrect PDF password.";

                    case "INVALID_MULTIPART_FORM":
                        return "File upload failed. Please upload the file again.";

                    case "INSUFFICIENT_FILES":
                        return "Please select at least two PDF files to merge.";

                    default:
                        return backendErr.message || "Unexpected server error.";
                }
            }
        } catch {
        }

        return err.message;
    }

    return "Unable to connect to PDFNest.";
}

export function handleClientError(error: unknown): string {
    const err = error as any;
    const billing: BackendError | undefined = err.billing || err.originalError?.billing;
    if (billing) {
        notifyBackendError(billing);
        return billing.message || "Request limit reached.";
    }

    const message = getFriendlyErrorMessage(error);

    notify(message, "error");

    return message;
}