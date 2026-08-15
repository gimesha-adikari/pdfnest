"use client";

import { ExecutionError } from "../types";
import {
    PdfcpuWorkerRequest,
    PdfcpuWorkerResponse,
} from "./types";

let workerInstance: Worker | null = null;
let customWorkerFactory: ((scriptUrl: string) => Worker) | null = null;

export function setWorkerFactory(factory: ((scriptUrl: string) => Worker) | null): void {
    if (workerInstance) {
        try {
            workerInstance.terminate();
        } catch {}
        workerInstance = null;
    }
    customWorkerFactory = factory;
}

const pendingRequests = new Map<
    string,
    {
        resolve: (blob: Blob) => void;
        reject: (error: ExecutionError) => void;
        timeoutId?: ReturnType<typeof setTimeout>;
    }
>();

function getOrCreateWorker(): Worker {
    if (workerInstance) {
        return workerInstance;
    }

    if (customWorkerFactory) {
        workerInstance = customWorkerFactory("/wasm/pdfcpu.worker.js");
    } else if (typeof Worker !== "undefined") {
        workerInstance = new Worker("/wasm/pdfcpu.worker.js");
    } else {
        throw new ExecutionError(
            "CLIENT_FAILURE",
            "Web Worker API is not available in the current runtime environment."
        );
    }

    const worker = workerInstance;

    worker.onmessage = (
        event: MessageEvent<PdfcpuWorkerResponse>
    ) => {
        const data = event.data;
        const pending = pendingRequests.get(data.id);

        if (!pending) {
            return;
        }

        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }

        pendingRequests.delete(data.id);

        if (data.type === "success") {
            try {
                const blob = new Blob([data.pdfBytes], {
                    type: "application/pdf",
                });

                pending.resolve(blob);
            } catch (error) {
                pending.reject(
                    new ExecutionError(
                        "CLIENT_FAILURE",
                        "Failed to construct the watermark output PDF.",
                        error
                    )
                );
            }

            return;
        }

        const code =
            data.code === "INVALID_INPUT"
                ? "INVALID_INPUT"
                : data.code === "CLIENT_FAILURE"
                    ? "CLIENT_FAILURE"
                    : "UNSUPPORTED_CLIENT_OP";

        pending.reject(
            new ExecutionError(
                code,
                data.message || "pdfcpu WASM processing failed."
            )
        );
    };

    worker.onerror = (event) => {
        console.error("[pdfcpu Worker Error]", event);

        const error = new ExecutionError(
            "CLIENT_FAILURE",
            "pdfcpu Web Worker execution failed.",
            event
        );

        pendingRequests.forEach(({ reject, timeoutId }) => {
            if (timeoutId) clearTimeout(timeoutId);
            reject(error);
        });

        pendingRequests.clear();

        try { worker.terminate(); } catch {}
        workerInstance = null;
    };

    worker.onmessageerror = (event) => {
        console.error("[pdfcpu Worker Message Error]", event);

        const error = new ExecutionError(
            "CLIENT_FAILURE",
            "pdfcpu Web Worker returned an unreadable message.",
            event
        );

        pendingRequests.forEach(({ reject, timeoutId }) => {
            if (timeoutId) clearTimeout(timeoutId);
            reject(error);
        });

        pendingRequests.clear();

        try { worker.terminate(); } catch {}
        workerInstance = null;
    };

    return worker;
}

function createRequestId(): string {
    return `pdfcpu_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function validatePdfHeader(pdfBytes: ArrayBuffer): void {
    const header = new Uint8Array(pdfBytes.slice(0, 5));
    const headerString = String.fromCharCode(...header);

    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "File is not a valid PDF document (missing %PDF- header)."
        );
    }
}

function normalizeWatermarkType(
    params: Record<string, any>
): "text" | "image" {
    const type =
        params.watermarkType ||
        (params.watermarkImage || params.imageFile ? "image" : "text");

    if (type !== "text" && type !== "image") {
        throw new ExecutionError(
            "INVALID_INPUT",
            `Invalid watermark type '${String(type)}'.`
        );
    }

    return type;
}

export function buildWatermarkDescription(
    params: Record<string, any>
): string {
    let position = String(params.position || "cc").toLowerCase();

    // Preserve the existing backend mapping used by the workspace.
    if (position === "cc") {
        position = "c";
    } else if (position === "cl") {
        position = "l";
    } else if (position === "cr") {
        position = "r";
    }

    const fontSize = Number(params.fontSize) || 48;
    const rotation = Number(params.rotation) || 45;
    const opacity = Math.min(
        1,
        Math.max(0.01, Number(params.opacity) || 0.3)
    );
    const fontFamily = String(
        params.fontFamily || "Helvetica"
    );

    const watermarkType = normalizeWatermarkType(params);

    const normalizedScale =
        watermarkType === "image"
            ? (fontSize / 500).toFixed(2)
            : (fontSize / 40).toFixed(2);

    return (
        params.description ||
        `font:${fontFamily}, pos:${position}, scale:${normalizedScale}, ` +
        `rot:${-rotation}, op:${opacity}`
    );
}

export function buildPageNumbersDescription(
    params: Record<string, any>
): string {
    const fontFamily = String(params.fontFamily || "Helvetica");
    const fontSize = Number(params.fontSize) || 12;
    const position = String(params.position || "bc").toLowerCase();
    const normalizedScale = (fontSize / 25).toFixed(2);

    let baseDesc =
        params.description ||
        `font:${fontFamily}, scale:${normalizedScale} abs, pos:${position}, rot:0`;

    // Append exact backend offsets if not already present
    if (!baseDesc.includes("offset:")) {
        if (baseDesc.includes("pos:bl")) {
            baseDesc += ", offset: 20 20";
        } else if (baseDesc.includes("pos:bc")) {
            baseDesc += ", offset: 0 20";
        } else if (baseDesc.includes("pos:br")) {
            baseDesc += ", offset: -20 20";
        } else if (baseDesc.includes("pos:tl")) {
            baseDesc += ", offset: 20 -20";
        } else if (baseDesc.includes("pos:tc")) {
            baseDesc += ", offset: 0 -20";
        } else if (baseDesc.includes("pos:tr")) {
            baseDesc += ", offset: -20 -20";
        }
    }

    return baseDesc;
}

function ensureSupportedImageFile(
    imageFile: unknown
): imageFile is File | Blob {
    return (
        typeof imageFile === "object" &&
        imageFile !== null &&
        typeof (imageFile as File | Blob).arrayBuffer === "function"
    );
}

export async function executePdfcpuWasmWatermark(
    pdfFile: File,
    params: Record<string, any>,
    password?: string
): Promise<Blob> {
    // Preserve the existing Option B security behavior.
    if (password || (pdfFile as any).originalPassword) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Password-protected files require the server-side encryption pipeline."
        );
    }

    const pdfBuffer = await pdfFile.arrayBuffer();

    validatePdfHeader(pdfBuffer);

    const watermarkType = normalizeWatermarkType(params);
    const description = buildWatermarkDescription(params);
    const worker = getOrCreateWorker();
    const requestId = createRequestId();

    const timeoutMs = Number(params.timeoutMs) || 30000;

    return new Promise<Blob>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);

                if (workerInstance) {
                    try {
                        workerInstance.terminate();
                    } catch {}
                    workerInstance = null;
                }

                reject(
                    new ExecutionError(
                        "CLIENT_FAILURE",
                        `pdfcpu WASM worker timed out after ${timeoutMs / 1000}s.`
                    )
                );
            }
        }, timeoutMs);

        pendingRequests.set(requestId, {
            resolve,
            reject,
            timeoutId,
        });

        if (watermarkType === "text") {
            const text = String(
                params.text ??
                params.watermarkText ??
                "CONFIDENTIAL"
            );

            const request: PdfcpuWorkerRequest = {
                id: requestId,
                type: "watermark-text",
                pdfBytes: pdfBuffer,
                text,
                description,
            };

            try {
                worker.postMessage(request, [pdfBuffer]);
            } catch (error) {
                pendingRequests.delete(requestId);

                reject(
                    new ExecutionError(
                        "CLIENT_FAILURE",
                        "Failed to send the PDF to the pdfcpu worker.",
                        error
                    )
                );
            }

            return;
        }

        const imageFile =
            params.watermarkImage ||
            params.imageFile;

        if (!ensureSupportedImageFile(imageFile)) {
            pendingRequests.delete(requestId);

            reject(
                new ExecutionError(
                    "INVALID_INPUT",
                    "Missing image file for image watermark."
                )
            );

            return;
        }

        imageFile
            .arrayBuffer()
            .then((imageBuffer) => {
                const request: PdfcpuWorkerRequest = {
                    id: requestId,
                    type: "watermark-image",
                    pdfBytes: pdfBuffer,
                    imageBytes: imageBuffer,
                    description,
                };

                try {
                    worker.postMessage(
                        request,
                        [pdfBuffer, imageBuffer]
                    );
                } catch (error) {
                    pendingRequests.delete(requestId);

                    reject(
                        new ExecutionError(
                            "CLIENT_FAILURE",
                            "Failed to send watermark data to the pdfcpu worker.",
                            error
                        )
                    );
                }
            })
            .catch((error) => {
                pendingRequests.delete(requestId);

                reject(
                    new ExecutionError(
                        "INVALID_INPUT",
                        "Failed to read watermark image file.",
                        error
                    )
                );
            });
    });
}

export function disposePdfcpuWorker(): void {
    if (!workerInstance) {
        return;
    }

    workerInstance.terminate();
    workerInstance = null;

    pendingRequests.forEach(({ reject }) => {
        reject(
            new ExecutionError(
                "CLIENT_FAILURE",
                "pdfcpu worker was terminated."
            )
        );
    });

    pendingRequests.clear();
}