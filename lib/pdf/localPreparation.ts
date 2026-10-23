import { ExecutionError } from "@/lib/execution/types";
import type { FileWithPassword } from "@/lib/types";

export type PdfInputPolicy = "strict" | "repair";

function hasPdfHeader(bytes: Uint8Array): boolean {
    return /%PDF-\d\.\d/.test(new TextDecoder("latin1").decode(bytes.subarray(0, 1024)));
}

/** Hints select inspection; only the parser/input policy can accept a PDF. */
export async function isPdfCandidate(file: File, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) throw new ExecutionError("USER_CANCELLATION", "Upload cancelled.");
    const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (signal.aborted) throw new ExecutionError("USER_CANCELLATION", "Upload cancelled.");
    return /^[\s\uFEFF]*%PDF-\d\.\d/.test(new TextDecoder("latin1").decode(header)) || /\.pdf$/i.test(file.name) || /^application\/(?:x-)?pdf(?:$|;)/i.test(file.type);
}

// This is a conservative admission check for damaged classic PDFs, not a parser
// or a claim that repair will succeed. Ambiguous compressed structures fail closed.
function repairInputEvidence(data: ArrayBuffer): "protected" | "plausible" | "unknown" {
    const text = new TextDecoder("latin1").decode(data)
        .replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replaceAll("\0", " ");
    if (/\/(?:Encrypt|Standard|StmF|StrF|CF)(?=[\s/<>\[\](){}%]|$)/.test(text)) return "protected";
    if (/\/(?:ObjStm|XRef)(?=[\s/<>\[\](){}%]|$)/.test(text)) return "unknown";
    return /\b\d{1,10}\s+\d{1,5}\s+obj\b/.test(text) && /\bendobj\b/.test(text) &&
        /\/Type\s*\/Catalog\b/.test(text) && /\/Type\s*\/Pages\b/.test(text) && /\/Kids\s*\[/.test(text) &&
        /\bxref\s+\d+\s+\d+/.test(text) && /\btrailer\s*<</.test(text) && /\/Root\b/.test(text) &&
        /\bstartxref\s+\d+/.test(text) && /%%EOF/.test(text) ? "plausible" : "unknown";
}

/** Strict local parsing by default; only explicit Repair input can use structural admission. */
export function inspectPdf(file: File, signal: AbortSignal, inputPolicy: PdfInputPolicy = "strict"): Promise<boolean> {
    return new Promise((resolve, reject) => {
        let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
        let settled = false;
        let repairEvidence: ReturnType<typeof repairInputEvidence> = "unknown";
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
                if (!hasPdfHeader(new Uint8Array(data))) {
                    finish(new ExecutionError("INVALID_INPUT", "The document is not a valid PDF."));
                    return;
                }
                // PDF.js transfers/detaches data; retain only the admission result.
                if (inputPolicy === "repair") repairEvidence = repairInputEvidence(data);
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
                else if (inputPolicy === "repair" && name === "InvalidPDFException" && repairEvidence !== "unknown") {
                    finish(undefined, repairEvidence === "protected");
                } else if (error instanceof Error && /unsupported.*(encryption|encrypt|cipher)|unknown.*encryption/i.test(error.message)) {
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
