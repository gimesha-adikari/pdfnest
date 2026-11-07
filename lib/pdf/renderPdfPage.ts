import { awaitRasterStage, validateRasterGeometry } from "@/lib/execution/images/rasterLifecycle";

interface PdfRenderTask {
    promise: Promise<void>;
    cancel: () => void;
}

interface PdfRenderPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => PdfRenderTask;
    cleanup?: () => void;
}

interface PdfRenderDocument {
    getPage: (pageNumber: number) => Promise<PdfRenderPage>;
    destroy?: () => Promise<void> | void;
}

export interface PdfPageCanvasDimensions {
    pageWidth: number;
    pageHeight: number;
    displayWidth: number;
    displayHeight: number;
}

export async function renderPdfPageToCanvas(
    document: PdfRenderDocument,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    options: {
        scale?: number;
        timeoutMs?: number;
        signal?: AbortSignal;
        onTask?: (task: PdfRenderTask | null) => void;
    } = {},
): Promise<PdfPageCanvasDimensions> {
    const pagePromise = document.getPage(pageNumber);
    let page: PdfRenderPage | null = null;
    let task: PdfRenderTask | null = null;
    try {
        page = await awaitRasterStage(pagePromise, `loading preview page ${pageNumber}`, {
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = options.scale ?? 1.5;
        const viewport = page.getViewport({ scale });
        validateRasterGeometry(viewport.width, viewport.height, 16_000_000);
        if (options.signal?.aborted) throw new DOMException("PDF preview was cancelled.", "AbortError");

        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a canvas context for the PDF preview.");

        task = page.render({ canvasContext: context, viewport });
        options.onTask?.(task);
        await awaitRasterStage(task.promise, `rendering preview page ${pageNumber}`, {
            timeoutMs: options.timeoutMs,
            signal: options.signal,
            onCancel: () => task?.cancel(),
        });
        if (options.signal?.aborted) throw new DOMException("PDF preview was cancelled.", "AbortError");

        return {
            pageWidth: baseViewport.width,
            pageHeight: baseViewport.height,
            displayWidth: canvas.clientWidth,
            displayHeight: canvas.clientHeight,
        };
    } finally {
        if (task) options.onTask?.(null);
        try { page?.cleanup?.(); } catch { /* Page cleanup must not mask the render result. */ }
        if (options.signal?.aborted) {
            canvas.width = 0;
            canvas.height = 0;
        }
    }
}
