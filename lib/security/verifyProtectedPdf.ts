import type { PDFDocumentLoadingTask } from "pdfjs-dist";

type PdfJsRuntime = {
    PasswordResponses: {
        NEED_PASSWORD: number;
        INCORRECT_PASSWORD: number;
    };
    getDocument: (parameters: {
        data: Uint8Array;
        password?: string;
        isEvalSupported?: boolean;
        useWorkerFetch?: boolean;
    }) => PDFDocumentLoadingTask;
};

type OpenResult =
    | { opened: true }
    | { opened: false; error: unknown };

function cancellationError(): Error & { code: string } {
    const error = new Error("Request cancelled by user.") as Error & { code: string };
    error.name = "AbortError";
    error.code = "USER_CANCELLATION";
    return error;
}

function throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) throw cancellationError();
}

function isPasswordError(error: unknown, expectedCode: number): boolean {
    if (typeof error !== "object" || error === null) return false;
    const candidate = error as { name?: unknown; code?: unknown };
    return candidate.name === "PasswordException" && candidate.code === expectedCode;
}

async function loadPdfJs(): Promise<PdfJsRuntime> {
    if (typeof window !== "undefined") {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }
        return pdfjs as unknown as PdfJsRuntime;
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjs as unknown as PdfJsRuntime;
}

async function openPdfAndReadFirstPage(
    runtime: PdfJsRuntime,
    data: Uint8Array,
    password: string | undefined,
    signal?: AbortSignal,
): Promise<OpenResult> {
    throwIfCancelled(signal);

    const loadingTask = runtime.getDocument({
        // PDF.js may transfer its input to a worker. Each password probe gets its own bytes.
        data: data.slice(),
        ...(password === undefined ? {} : { password }),
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
    if (signal?.aborted) abortLoading();

    try {
        const document = await loadingTask.promise;
        throwIfCancelled(signal);
        if (document.numPages < 1) {
            throw new Error("PDF has no readable pages.");
        }
        await document.getPage(1);
        throwIfCancelled(signal);
        return { opened: true };
    } catch (error) {
        if (signal?.aborted) throw cancellationError();
        return { opened: false, error };
    } finally {
        signal?.removeEventListener("abort", abortLoading);
        await destroyLoadingTask();
    }
}

/**
 * Independently verifies a lock response with PDF.js. A valid result must require
 * a password, open with the expected password, and reject a different password.
 * The optional runtime seam keeps cancellation tests deterministic; production
 * callers omit it and use the installed PDF.js parser.
 */
export async function verifyProtectedPdfBlob(
    blob: Blob,
    expectedPassword: string,
    signal?: AbortSignal,
    runtimeOverride?: PdfJsRuntime,
): Promise<void> {
    if (!expectedPassword) {
        throw new Error("PDF password protection could not be verified.");
    }
    throwIfCancelled(signal);

    const runtime = runtimeOverride ?? await loadPdfJs();
    throwIfCancelled(signal);

    let data: Uint8Array;
    try {
        data = new Uint8Array(await blob.arrayBuffer());
    } catch {
        throw new Error("PDF password protection could not be verified.");
    }
    throwIfCancelled(signal);

    const noPassword = await openPdfAndReadFirstPage(runtime, data, undefined, signal);
    if (noPassword.opened || !isPasswordError(noPassword.error, runtime.PasswordResponses.NEED_PASSWORD)) {
        throw new Error("PDF password protection could not be verified.");
    }

    const correctPassword = await openPdfAndReadFirstPage(runtime, data, expectedPassword, signal);
    if (!correctPassword.opened) {
        throw new Error("PDF password protection could not be verified.");
    }

    const incorrectPassword = expectedPassword === "__pdfnest-invalid-password__"
        ? "__pdfnest-invalid-password__-different"
        : "__pdfnest-invalid-password__";
    const wrongPassword = await openPdfAndReadFirstPage(runtime, data, incorrectPassword, signal);
    if (wrongPassword.opened || !isPasswordError(wrongPassword.error, runtime.PasswordResponses.INCORRECT_PASSWORD)) {
        throw new Error("PDF password protection could not be verified.");
    }

    throwIfCancelled(signal);
}

export type { PdfJsRuntime };
