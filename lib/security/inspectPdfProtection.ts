type DestroyablePdf = { destroy?: () => unknown };
type PdfLoadingTask = { promise: Promise<DestroyablePdf>; destroy?: () => unknown };

const inspectionByBlob = new WeakMap<Blob, Promise<boolean>>();

/**
 * Inspect a PDF with PDF.js. A true result means password protection was
 * required to open it; any other parsing/inspection failure is fail-closed.
 */
export function inspectPdfEncryption(file: Blob): Promise<boolean> {
    const existing = inspectionByBlob.get(file);
    if (existing) return existing;

    const inspection = inspect(file);
    inspectionByBlob.set(file, inspection);
    void inspection.catch(() => inspectionByBlob.delete(file));
    return inspection;
}

async function inspect(file: Blob): Promise<boolean> {
    let loadingTask: PdfLoadingTask | null = null;
    let pdfDoc: DestroyablePdf | null = null;

    try {
        const pdfjs = await import("pdfjs-dist");
        if (typeof window !== "undefined") {
            pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
        }

        loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() }) as unknown as PdfLoadingTask;
        pdfDoc = await loadingTask.promise;
        return false;
    } catch (error: unknown) {
        if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "PasswordException"
        ) {
            return true;
        }
        throw new Error("PDF protection could not be verified.");
    } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
            try { await pdfDoc.destroy(); } catch {}
        }
        if (loadingTask && typeof loadingTask.destroy === "function") {
            try { await loadingTask.destroy(); } catch {}
        }
    }
}
