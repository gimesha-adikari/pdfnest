import { ExecutionError } from "@/lib/execution/types";
import type { FileWithPassword } from "@/lib/types";

/** Parse locally, including a real page, instead of trusting a MIME type or PDF header. */
export function inspectPdf(file: File, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve, reject) => {
        let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
        let settled = false;
        const finish = (error?: ExecutionError, encrypted = false) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", cancel);
            // Destroy on every path; ignore late parse results and cleanup failures.
            void task?.destroy().catch(() => undefined);
            if (error) reject(error);
            else resolve(encrypted);
        };
        const cancel = () => finish(new ExecutionError("USER_CANCELLATION", "Upload cancelled."));
        const timer = setTimeout(() => finish(new ExecutionError("CLIENT_FAILURE", "Local PDF inspection timed out. Please retry.")), 60_000);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) { cancel(); return; }
        void (async () => {
            try {
                const pdfjs = await import("pdfjs-dist");
                const data = await file.arrayBuffer();
                if (settled) return;
                if (typeof window !== "undefined") pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
                task = pdfjs.getDocument({ data, stopAtErrors: true });
                const doc = await task.promise;
                if (settled) return;
                if (doc.numPages < 1) throw new Error("No pages");
                await doc.getPage(1);
                finish();
            } catch (error) {
                if (settled) return;
                const name = error instanceof Error ? error.name : "";
                if (name === "PasswordException") finish(undefined, true);
                else if (error instanceof Error && /unsupported.*(encryption|encrypt|cipher)|unknown.*encryption/i.test(error.message)) {
                    finish(new ExecutionError("UNSUPPORTED_CLIENT_OP", "This encryption is not supported by local PDF preparation."));
                } else finish(new ExecutionError(name === "InvalidPDFException" ? "INVALID_INPUT" : "CLIENT_FAILURE",
                    name === "InvalidPDFException" ? "The PDF is corrupt or invalid." : "Local PDF inspection failed. Please retry or cancel."));
            }
        })();
    });
}

export async function prepareEncryptedPdf(file: File, password: string, signal: AbortSignal): Promise<FileWithPassword> {
    const { executePdfcpuWasmUnlock } = await import("@/lib/execution/pdfcpu/pdfcpuClient");
    if (signal.aborted) throw new ExecutionError("USER_CANCELLATION", "Upload cancelled.");
    const blob = await executePdfcpuWasmUnlock(file, password, { signal });
    const result: FileWithPassword = new File([blob], file.name, { type: "application/pdf", lastModified: file.lastModified });
    if (await inspectPdf(result, signal)) throw new ExecutionError("INVALID_INPUT", "Local decryption did not produce an unlocked PDF.");
    result.originalPassword = password;
    return result;
}
