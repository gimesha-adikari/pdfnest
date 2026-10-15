import type { PDFDocumentLoadingTask } from "pdfjs-dist";

type PdfJsRuntime = {
    getDocument: (parameters: {
        data: Uint8Array;
        isEvalSupported?: boolean;
        useWorkerFetch?: boolean;
    }) => PDFDocumentLoadingTask;
};

function cancellationError(): Error {
    const error = new Error("PDF validation was cancelled.");
    error.name = "AbortError";
    return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw cancellationError();
}

async function loadPdfJs(): Promise<PdfJsRuntime> {
    if (typeof window !== "undefined") {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
        }
        return pdfjs as unknown as PdfJsRuntime;
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjs as unknown as PdfJsRuntime;
}

/**
 * Confirms that an ordinary PDF artifact is nonempty, parseable and has at
 * least one readable page. This does not prove document equivalence or output
 * encryption; protected-output workflows must use verifyProtectedPdfBlob.
 */
export async function validateReadablePdfBlob(
    blob: Blob,
    signal?: AbortSignal,
    runtimeOverride?: PdfJsRuntime,
): Promise<{ pageCount: number }> {
    throwIfCancelled(signal);

    if (blob.size === 0) {
        throw new Error("Generated PDF could not be validated.");
    }

    const runtime = runtimeOverride ?? await loadPdfJs();
    throwIfCancelled(signal);

    try {
        const data = new Uint8Array(await blob.arrayBuffer());
        throwIfCancelled(signal);

        const loadingTask = runtime.getDocument({
            data,
            isEvalSupported: false,
            useWorkerFetch: false,
        });
        let destroyPromise: Promise<void> | undefined;
        const destroyLoadingTask = () => {
            destroyPromise ??= loadingTask.destroy().catch(() => undefined);
            return destroyPromise;
        };
        const abortLoading = () => {
            void destroyLoadingTask();
        };
        signal?.addEventListener("abort", abortLoading, { once: true });

        try {
            if (signal?.aborted) abortLoading();
            const document = await loadingTask.promise;
            throwIfCancelled(signal);
            if (!Number.isInteger(document.numPages) || document.numPages < 1) {
                throw new Error("Generated PDF could not be validated.");
            }
            await document.getPage(1);
            throwIfCancelled(signal);
            return { pageCount: document.numPages };
        } finally {
            signal?.removeEventListener("abort", abortLoading);
            await destroyLoadingTask();
        }
    } catch {
        if (signal?.aborted) throw cancellationError();
        throw new Error("Generated PDF could not be validated.");
    }
}

export type { PdfJsRuntime as ReadablePdfJsRuntime };
