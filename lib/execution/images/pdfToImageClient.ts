"use client";

import { zipSync } from "fflate";
import { ExecutionError } from "../types";
import { awaitRasterStage, validateRasterGeometry } from "./rasterLifecycle";

export type ImageType = "jpg" | "jpeg" | "png" | "pnggray" | "pngmono";

interface ResolvedFormat {
    fileExt: string;
    mimeType: string;
    quality?: number;
    filter?: "grayscale" | "monochrome";
}

interface BrowserPdfPage {
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel: () => void };
    cleanup: () => void;
}

function resolveFormat(input?: string): ResolvedFormat {
    const normalized = (input || "jpg").toLowerCase().trim();
    switch (normalized) {
        case "png":
            return {
                fileExt: "png",
                mimeType: "image/png",
            };
        case "pnggray":
        case "gray":
        case "grayscale":
            return {
                fileExt: "png",
                mimeType: "image/png",
                filter: "grayscale",
            };
        case "pngmono":
        case "mono":
        case "bw":
        case "blackwhite":
        case "black-white":
            return {
                fileExt: "png",
                mimeType: "image/png",
                filter: "monochrome",
            };
        case "jpg":
        case "jpeg":
        default:
            return {
                fileExt: "jpg",
                mimeType: "image/jpeg",
                quality: 0.95, // Matches Ghostscript -dJPEGQ=95
            };
    }
}

/**
 * Executes high-fidelity, sequential in-browser PDF page rasterization to images
 * packaged in a flat, alphabetically sorted ZIP archive matching backend Ghostscript.
 */
export async function executePdfToImages(
    file: File,
    params: Record<string, any> = {},
    originalPassword?: string,
    signal?: AbortSignal,
    onProgress?: (percentage: number) => void,
): Promise<Blob> {
    if (!file) {
        throw new ExecutionError("INVALID_INPUT", "No PDF document provided for rasterization.");
    }

    if (originalPassword) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Password-protected files require server-side Ghostscript rendering pipeline."
        );
    }

    // 1. Magic byte header check
    const arrayBuffer = await awaitRasterStage(file.arrayBuffer(), "reading the PDF", { signal });
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError(
            "INVALID_INPUT",
            `File '${file.name}' is not a valid PDF document (missing %PDF- header).`
        );
    }

    // 2. Resolve image configuration parameters
    const format = resolveFormat(params.imageType || params.image_type);

    // 3. Device rasterization requires a real browser canvas. Never synthesize
    // placeholder image bytes in SSR or test environments and report them as output.
    if (typeof document === "undefined") {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "PDF-to-Images Device processing requires a browser canvas. Open the tool in a supported browser or choose Cloud processing."
        );
    }

    // 4. Browser Environment: Dynamic import of pdfjs-dist and Canvas rendering
    let pdfjsLib: any;
    try {
        pdfjsLib = await awaitRasterStage(import("pdfjs-dist"), "starting the PDF renderer", { signal });
        if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs";
        }
    } catch (err: unknown) {
        if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
            throw new ExecutionError("USER_CANCELLATION", "Image extraction was cancelled.", err);
        }
        if (err instanceof Error && err.name === "RasterStageTimeoutError") {
            throw new ExecutionError("CLIENT_FAILURE", `${err.message} Try again or choose Cloud processing.`, err);
        }
        throw new ExecutionError(
            "CLIENT_FAILURE",
            "Failed to initialize in-browser PDF rasterization engine.",
            err
        );
    }

    const typedArray = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: typedArray });

    let pdfDoc: any;
    try {
        pdfDoc = await awaitRasterStage(loadingTask.promise, "loading the PDF", {
            signal,
            onCancel: () => { void loadingTask.destroy?.(); },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("password") || message.toLowerCase().includes("encrypt")) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                "Password-protected file encountered during client rasterization.",
                err
            );
        }
        if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
            throw new ExecutionError("USER_CANCELLATION", "Image extraction was cancelled.", err);
        }
        if (err instanceof Error && err.name === "RasterStageTimeoutError") {
            throw new ExecutionError("CLIENT_FAILURE", `${err.message} Try again or choose Cloud processing.`, err);
        }
        throw new ExecutionError("INVALID_INPUT", "Failed to parse PDF document layers for rasterization.", err);
    }

    const totalPages = pdfDoc.numPages;
    if (totalPages === 0) {
        throw new ExecutionError("INVALID_INPUT", "Document contains 0 renderable pages.");
    }

    // Scale factor: 200 DPI geometry matching backend Ghostscript (-r200)
    // 72 points/inch * (200 / 72) = 200 DPI
    const scale = 200 / 72;
    let remainingPixels = 16_000_000;
    onProgress?.(5);

    const zipFiles: Record<string, Uint8Array> = {};

    // Single reusable HTML canvas to avoid multi-canvas memory exhaustion
    let canvas: HTMLCanvasElement | null = null;
    if (typeof document !== "undefined") {
        canvas = document.createElement("canvas");
    }

    try {
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (signal?.aborted) {
                throw new ExecutionError("USER_CANCELLATION", "Image extraction was cancelled.");
            }
            const page = await awaitRasterStage(
                pdfDoc.getPage(pageNum) as Promise<BrowserPdfPage>,
                `loading page ${pageNum}`,
                {
                signal,
                onCancel: () => { void pdfDoc.destroy?.(); },
                },
            );
            try {
                const viewport = page.getViewport({ scale });
                let pagePixels: number;
                try {
                    pagePixels = validateRasterGeometry(viewport.width, viewport.height, remainingPixels);
                } catch (error) {
                    throw new ExecutionError("SAFETY_REJECTION", `Page ${pageNum} is too large to rasterize safely on this device.`, error);
                }
                remainingPixels -= pagePixels;
                const width = Math.max(1, Math.ceil(viewport.width));
                const height = Math.max(1, Math.ceil(viewport.height));

                let pageBytes: Uint8Array;

                if (canvas) {
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext("2d", {
                        willReadFrequently: format.filter !== undefined,
                    });
                    if (!ctx) {
                        throw new ExecutionError(
                            "CLIENT_FAILURE",
                            "Failed to allocate 2D graphics rendering context."
                        );
                    }

                    // Solid white background for JPEG
                    if (format.fileExt === "jpg") {
                        ctx.fillStyle = "#FFFFFF";
                        ctx.fillRect(0, 0, width, height);
                    } else {
                        ctx.clearRect(0, 0, width, height);
                    }

                    // Render vector and font layers
                    const renderTask = page.render({ canvasContext: ctx, viewport });
                    await awaitRasterStage(renderTask.promise, `rendering page ${pageNum}`, {
                        signal,
                        onCancel: () => renderTask.cancel(),
                    });

                    // Apply Grayscale / Monochrome pixel filtering if requested
                    if (format.filter === "grayscale") {
                        const imgData = ctx.getImageData(0, 0, width, height);
                        const data = imgData.data;
                        for (let i = 0; i < data.length; i += 4) {
                            const gray = Math.round(
                                0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
                            );
                            data[i] = gray;
                            data[i + 1] = gray;
                            data[i + 2] = gray;
                        }
                        ctx.putImageData(imgData, 0, 0);
                    } else if (format.filter === "monochrome") {
                        const imgData = ctx.getImageData(0, 0, width, height);
                        const data = imgData.data;
                        for (let i = 0; i < data.length; i += 4) {
                            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                            const mono = gray >= 128 ? 255 : 0;
                            data[i] = mono;
                            data[i + 1] = mono;
                            data[i + 2] = mono;
                        }
                        ctx.putImageData(imgData, 0, 0);
                    }

                    // Encode canvas to binary blob
                    const blob = await awaitRasterStage(new Promise<Blob>((resolve, reject) => {
                        canvas!.toBlob(
                            (b) => {
                                if (b) resolve(b);
                                else reject(new Error("Canvas toBlob encoding failed"));
                            },
                            format.mimeType,
                            format.quality
                        );
                    }), `encoding page ${pageNum}`, {
                        signal,
                        onCancel: () => {
                            if (canvas) {
                                canvas.width = 0;
                                canvas.height = 0;
                            }
                        },
                    });

                    const pageArrayBuf = await awaitRasterStage(blob.arrayBuffer(), `reading encoded page ${pageNum}`, { signal });
                    pageBytes = new Uint8Array(pageArrayBuf);

                    // Clear canvas before next iteration
                    ctx.clearRect(0, 0, width, height);
                } else {
                    // Node environment fallback mock
                    pageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
                }

                // 3-digit zero-padded filename matching backend Ghostscript
                const filename = `page-${String(pageNum).padStart(3, "0")}.${format.fileExt}`;
                zipFiles[filename] = pageBytes;
                onProgress?.(Math.min(90, Math.round(5 + (pageNum / totalPages) * 85)));
            } finally {
                page.cleanup();
            }
        }

        // 5. Package files into flat ZIP archive
        if (signal?.aborted) {
            throw new ExecutionError("USER_CANCELLATION", "Image extraction was cancelled.");
        }
        const zippedUint8 = zipSync(zipFiles, { level: 6 });
        onProgress?.(100);
        return new Blob([zippedUint8.buffer as ArrayBuffer], { type: "application/zip" });
    } catch (err: unknown) {
        if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
            throw new ExecutionError("USER_CANCELLATION", "Image extraction was cancelled.", err);
        }
        if (err instanceof Error && err.name === "RasterStageTimeoutError") {
            throw new ExecutionError("CLIENT_FAILURE", `${err.message} Try again or choose Cloud processing.`, err);
        }
        throw err;
    } finally {
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
            try {
                await awaitRasterStage(Promise.resolve(pdfDoc.destroy()), "cleaning up the PDF", { timeoutMs: 5_000 });
            } catch {
                // Cleanup is best effort after success or failure; never leave the UI pending on teardown.
            }
        }
    }
}
