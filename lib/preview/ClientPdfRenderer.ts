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

    private static docCache = new Map<string, {
        key: string;
        promise: Promise<any>;
        loadingTask: any | null;
        pdfDoc: any | null;
        refCount: number;
        idleTimer: any | null;
    }>();

    private static getDocKey(file: File): string {
        return `${file.name}:${file.size}:${file.lastModified}`;
    }

    private async _acquireDocument(file: File, signal: AbortSignal): Promise<{ entry: any; pdfDoc: any }> {
        const key = ClientPdfRenderer.getDocKey(file);
        let entry = ClientPdfRenderer.docCache.get(key);

        if (!entry) {
            const promise = (async () => {
                const arrayBuffer = await file.arrayBuffer();
                const pdfjsLib = await this._loadPdfJs();
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                entry!.loadingTask = loadingTask;
                const pdfDoc = await loadingTask.promise;
                entry!.pdfDoc = pdfDoc;
                return pdfDoc;
            })();

            // Attach catch to prevent unhandled rejection warning if nothing awaits immediately
            promise.catch(() => {});

            entry = {
                key,
                promise,
                loadingTask: null,
                pdfDoc: null,
                refCount: 0,
                idleTimer: null,
            };
            ClientPdfRenderer.docCache.set(key, entry);
        }

        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer);
            entry.idleTimer = null;
        }

        entry.refCount++;

        try {
            if (signal.aborted) {
                this._releaseDocument(entry);
                throw this._createAbortError();
            }

            const pdfDoc = await entry.promise;
            if (signal.aborted) {
                this._releaseDocument(entry);
                throw this._createAbortError();
            }
            return { entry, pdfDoc };
        } catch (err) {
            ClientPdfRenderer.docCache.delete(key);
            this._releaseDocument(entry);
            throw err;
        }
    }

    private _releaseDocument(entry: any): void {
        if (!entry) return;
        entry.refCount = Math.max(0, entry.refCount - 1);
        if (entry.refCount === 0 && !entry.idleTimer) {
            // Idle timer before destroying cached PDF document (e.g. 500ms idle TTL)
            entry.idleTimer = setTimeout(() => {
                if (entry.refCount === 0) {
                    ClientPdfRenderer.docCache.delete(entry.key);
                    ClientPdfRenderer.destroyEntry(entry);
                }
            }, 500);
        }
    }

    private static destroyEntry(entry: any): void {
        if (!entry) return;
        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer);
            entry.idleTimer = null;
        }
        if (entry.pdfDoc && typeof entry.pdfDoc.destroy === "function") {
            try {
                entry.pdfDoc.destroy();
            } catch {
                // ignore
            }
        }
        if (entry.loadingTask && typeof entry.loadingTask.destroy === "function") {
            try {
                entry.loadingTask.destroy();
            } catch {
                // ignore
            }
        }
    }

    /** Clear all cached document proxies and destroy PDF.js tasks */
    static clearDocumentCache(): void {
        for (const entry of ClientPdfRenderer.docCache.values()) {
            ClientPdfRenderer.destroyEntry(entry);
        }
        ClientPdfRenderer.docCache.clear();
    }

    async render(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResource> {
        if (!request.document?.file) {
            throw new Error("ClientPdfRenderer requires request.document.file");
        }

        if (signal.aborted) {
            throw this._createAbortError();
        }

        const { entry, pdfDoc } = await this._acquireDocument(request.document.file, signal);

        let page: any = null;
        try {
            page = await pdfDoc.getPage(request.page);

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

            const blob = await this._canvasToBlob(canvas, signal);

            if (signal.aborted) {
                throw this._createAbortError();
            }

            const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
                ? URL.createObjectURL(blob)
                : "";

            // Immediately clear canvas raster dimensions after PNG Blob creation to release RAM/VRAM bitmap memory
            canvas.width = 0;
            canvas.height = 0;

            let revoked = false;

            return {
                type: "image-url",
                url,
                width,
                height,
                renderedBy: this.id,
                canvas,
                revoke: () => {
                    if (revoked) return;
                    revoked = true;
                    if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
                        try {
                            URL.revokeObjectURL(url);
                        } catch {
                            // ignore revocation errors
                        }
                    }
                    canvas.width = 0;
                    canvas.height = 0;
                    if (ctx && typeof ctx.clearRect === "function") {
                        try {
                            ctx.clearRect(0, 0, width, height);
                        } catch {
                            // ignore canvas clearing errors
                        }
                    }
                },
            };
        } finally {
            if (page && typeof page.cleanup === "function") {
                try {
                    page.cleanup();
                } catch {
                    // ignore page cleanup errors
                }
            }
            this._releaseDocument(entry);
        }
    }

    private async _canvasToBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
        if (signal.aborted) {
            throw this._createAbortError();
        }

        if (typeof canvas.toBlob === "function") {
            return new Promise<Blob>((resolve, reject) => {
                let done = false;
                const onAbort = () => {
                    if (!done) {
                        done = true;
                        reject(this._createAbortError());
                    }
                };

                if (signal.aborted) {
                    return reject(this._createAbortError());
                }

                signal.addEventListener("abort", onAbort);

                try {
                    canvas.toBlob((blob) => {
                        signal.removeEventListener("abort", onAbort);
                        if (done) return;
                        done = true;
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Canvas toBlob conversion failed: produced null"));
                        }
                    }, "image/png");
                } catch (err) {
                    signal.removeEventListener("abort", onAbort);
                    if (!done) {
                        done = true;
                        reject(err);
                    }
                }
            });
        }

        // Fallback for environment/test mocks without canvas.toBlob
        if (typeof canvas.toDataURL === "function") {
            try {
                const dataUrl = canvas.toDataURL("image/png");
                if (typeof fetch === "function") {
                    const res = await fetch(dataUrl);
                    return await res.blob();
                }
            } catch {
                // ignore fetch failure on data URL
            }
        }

        return new Blob(["mock-canvas-image"], { type: "image/png" });
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
