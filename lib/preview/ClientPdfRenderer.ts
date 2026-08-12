// pdfnest/lib/preview/ClientPdfRenderer.ts

import { PreviewRenderer, PreviewRequest, PreviewResource } from "./types";

export interface ClientPdfRendererOptions {
    /** Optional custom loader for PDF.js library (useful for testing or custom environments) */
    pdfjsLoader?: () => Promise<any>;
}

/**
 * Thin client-side renderer adapter wrapping PDF.js.
 * Renders a PDF page directly onto an HTML5 canvas element.
 */
export class ClientPdfRenderer implements PreviewRenderer {
    readonly id = "client-pdfjs";
    readonly capabilities = {
        client: true,
        server: false,
    };

    private readonly pdfjsLoader?: () => Promise<any>;

    constructor(options?: ClientPdfRendererOptions) {
        this.pdfjsLoader = options?.pdfjsLoader;
    }

    canRender(request: PreviewRequest): boolean {
        return Boolean(request.document?.file);
    }

    async render(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResource> {
        if (!request.document?.file) {
            throw new Error("ClientPdfRenderer requires request.document.file");
        }

        if (signal.aborted) {
            throw this._createAbortError();
        }

        const arrayBuffer = await request.document.file.arrayBuffer();

        if (signal.aborted) {
            throw this._createAbortError();
        }

        const pdfjsLib = await this._loadPdfJs();

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });

        const onAbort = () => {
            try {
                loadingTask.destroy();
            } catch {
                // ignore destruction errors on abort
            }
        };
        signal.addEventListener("abort", onAbort);

        let pdfDoc: any;
        try {
            pdfDoc = await loadingTask.promise;
        } catch (e: unknown) {
            if (signal.aborted) {
                throw this._createAbortError();
            }
            throw e;
        } finally {
            signal.removeEventListener("abort", onAbort);
        }

        if (signal.aborted) {
            try {
                pdfDoc.destroy();
            } catch {
                // ignore
            }
            throw this._createAbortError();
        }

        try {
            const page = await pdfDoc.getPage(request.page);

            let scale = request.scale;
            if (scale === undefined) {
                const unscaled = page.getViewport({ scale: 1.0 });
                if (request.width !== undefined && unscaled.width > 0) {
                    scale = request.width / unscaled.width;
                } else if (request.height !== undefined && unscaled.height > 0) {
                    scale = request.height / unscaled.height;
                } else {
                    scale = 1.0;
                }
            }

            const viewport = page.getViewport({ scale });
            const width = Math.floor(viewport.width);
            const height = Math.floor(viewport.height);

            const canvas = typeof document !== "undefined"
                ? document.createElement("canvas")
                : ({} as HTMLCanvasElement);

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext ? canvas.getContext("2d") : null;

            if (typeof page.render === "function") {
                const renderTask = page.render({ canvasContext: ctx, viewport });

                const onAbortRender = () => {
                    try {
                        renderTask.cancel();
                    } catch {
                        // ignore render cancellation errors
                    }
                };
                signal.addEventListener("abort", onAbortRender);

                try {
                    await renderTask.promise;
                } catch (e: unknown) {
                    if (signal.aborted || (typeof e === "object" && e !== null && "name" in e && (e as any).name === "RenderingCancelledException")) {
                        throw this._createAbortError();
                    }
                    throw e;
                } finally {
                    signal.removeEventListener("abort", onAbortRender);
                }
            }

            if (signal.aborted) {
                throw this._createAbortError();
            }

            return {
                type: "canvas",
                canvas,
                width,
                height,
                renderedBy: this.id,
                revoke: () => {
                    canvas.width = 0;
                    canvas.height = 0;
                    if (ctx && typeof ctx.clearRect === "function") {
                        ctx.clearRect(0, 0, width, height);
                    }
                },
            };
        } finally {
            try {
                pdfDoc.destroy();
            } catch {
                // ignore document destruction errors
            }
        }
    }

    private async _loadPdfJs(): Promise<any> {
        if (this.pdfjsLoader) {
            return this.pdfjsLoader();
        }
        const pdfjsLib = await import("pdfjs-dist");
        if (typeof window !== "undefined") {
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
        }
        return pdfjsLib;
    }

    private _createAbortError(): Error {
        const err = new Error("AbortError");
        (err as any).name = "AbortError";
        return err;
    }
}
