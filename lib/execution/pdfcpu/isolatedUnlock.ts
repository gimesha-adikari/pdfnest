import { ExecutionError } from "../types";
import type { PdfcpuWorkerResponse } from "./types";

export interface LocalUnlockOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

// Upload preparation owns this worker: cancellation must not interrupt other tools.
export function isolatedUnlock(
    file: File,
    password: string,
    createWorker: () => Worker,
    { signal, timeoutMs = 60_000 }: LocalUnlockOptions,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        let worker: Worker | undefined;
        let settled = false;
        const finish = (error?: ExecutionError, blob?: Blob) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
            if (worker) {
                worker.onmessage = null;
                worker.onerror = null;
                worker.onmessageerror = null;
                try { worker.terminate(); } catch { /* Cleanup must not strand the request. */ }
            }
            if (error) reject(error);
            else resolve(blob!);
        };
        const cancel = () => finish(new ExecutionError("USER_CANCELLATION", "Local decryption cancelled."));
        const timer = setTimeout(() => finish(new ExecutionError("CLIENT_FAILURE", "Local decryption timed out. Please retry or cancel.")), timeoutMs);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) { cancel(); return; }
        void (async () => {
            try {
                const bytes = await file.arrayBuffer();
                if (settled) return;
                if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
                    finish(new ExecutionError("INVALID_INPUT", "The document is not a valid PDF."));
                    return;
                }
                worker = createWorker();
                const id = `upload-unlock-${crypto.randomUUID()}`;
                worker.onmessage = (event: MessageEvent<PdfcpuWorkerResponse>) => {
                    const data = event.data;
                    if (data.id !== id) return;
                    if (data.type === "success") {
                        if (!(data.pdfBytes instanceof ArrayBuffer) || data.pdfBytes.byteLength < 5) {
                            finish(new ExecutionError("INVALID_INPUT", "Local decryption returned an invalid PDF."));
                        } else {
                            finish(undefined, new Blob([data.pdfBytes], { type: "application/pdf" }));
                        }
                    } else {
                        // Worker/library messages can contain document information. Never surface them.
                        const code = data.code;
                        finish(code === "DECRYPTION_AUTH_FAILED"
                            ? new ExecutionError(code, "Incorrect password. Please try again.")
                            : code === "INVALID_INPUT"
                                ? new ExecutionError(code, "The PDF is corrupt or invalid.")
                                : code === "UNSUPPORTED_CLIENT_OP"
                                    ? new ExecutionError(code, "This encryption is not supported by local decryption.")
                                    : new ExecutionError("CLIENT_FAILURE", "Local decryption is unavailable. Please retry or cancel."));
                    }
                };
                worker.onerror = (event) => {
                    event.preventDefault?.();
                    finish(new ExecutionError("CLIENT_FAILURE", "The local decryption engine failed. Please retry or cancel."));
                };
                worker.onmessageerror = () => finish(new ExecutionError("CLIENT_FAILURE", "The local decryption engine returned an unreadable response."));
                worker.postMessage({ id, type: "decrypt", pdfBytes: bytes, password }, [bytes]);
            } catch {
                finish(new ExecutionError("CLIENT_FAILURE", "Local decryption is unavailable. Please retry or cancel."));
            }
        })();
    });
}
