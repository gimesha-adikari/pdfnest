"use client";

import { ExecutionError } from "../types";
import {
    PdfcpuWorkerRequest,
    PdfcpuWorkerResponse,
    TextElement,
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
            data.code === "DECRYPTION_AUTH_FAILED"
                ? "DECRYPTION_AUTH_FAILED"
                : data.code === "INVALID_INPUT"
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

export function buildTextElementDescription(el: TextElement): string {
    let colorHex = el.color || "#000000";
    if (!colorHex.startsWith("#")) {
        colorHex = "#" + colorHex;
    }
    if (colorHex.length === 4) {
        colorHex = `#${colorHex[1]}${colorHex[1]}${colorHex[2]}${colorHex[2]}${colorHex[3]}${colorHex[3]}`;
    }
    const fontSize = Number(el.fontSize) || 24;
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    return `font:Helvetica, points:${fontSize}, pos:tl, offset:${x} ${-y - 13}, scale:1 abs, rot:0, fillcol:${colorHex}`;
}

export async function executePdfcpuWasmAddText(
    pdfFile: File,
    elements: TextElement[],
    password?: string
): Promise<Blob> {
    // Preserve Option B security behavior.
    if (password || (pdfFile as any).originalPassword) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Password-protected files require server-side encryption pipeline."
        );
    }

    const pdfBuffer = await pdfFile.arrayBuffer();
    validatePdfHeader(pdfBuffer);

    const validElements = (elements || []).filter(
        (e) => e && typeof e.text === "string" && e.text.trim() !== ""
    );

    if (validElements.length === 0) {
        return new Blob([pdfBuffer], { type: "application/pdf" });
    }

    const worker = getOrCreateWorker();
    const requestId = createRequestId();

    return new Promise<Blob>((resolve, reject) => {
        pendingRequests.set(requestId, {
            resolve,
            reject,
        });

        const request: PdfcpuWorkerRequest = {
            id: requestId,
            type: "add-text",
            pdfBytes: pdfBuffer,
            elements: validElements,
        };

        try {
            worker.postMessage(request, [pdfBuffer]);
        } catch (error) {
            pendingRequests.delete(requestId);
            reject(
                new ExecutionError(
                    "CLIENT_FAILURE",
                    "Failed to send add-text data to the pdfcpu worker.",
                    error
                )
            );
        }
    });
}

export async function executePdfcpuWasmUnlock(
    pdfFile: File,
    password?: string
): Promise<Blob> {
    if (!pdfFile) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "No PDF document provided to unlock."
        );
    }

    const effectivePassword = password || (pdfFile as any).originalPassword || "";
    if (!effectivePassword) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "Password is required to unlock this file."
        );
    }

    const pdfBuffer = await pdfFile.arrayBuffer();
    validatePdfHeader(pdfBuffer);

    // Node.js test environment direct WASM fallback
    if (typeof window === "undefined") {
        const workerShim = customWorkerFactory
            ? customWorkerFactory("/wasm/pdfcpu.worker.js")
            : null;
        if (workerShim) {
            const requestId = createRequestId();
            return new Promise<Blob>((resolve, reject) => {
                const handler = (event: any) => {
                    const data = event.data || event;
                    if (data.id === requestId) {
                        if (data.type === "success") {
                            resolve(new Blob([data.pdfBytes], { type: "application/pdf" }));
                        } else {
                            reject(
                                new ExecutionError(
                                    (data.code as any) || "UNSUPPORTED_CLIENT_OP",
                                    data.message || "Decryption failed."
                                )
                            );
                        }
                    }
                };
                if (typeof workerShim.addEventListener === "function") {
                    workerShim.addEventListener("message", handler);
                } else if ("onmessage" in workerShim) {
                    workerShim.onmessage = handler;
                }
                workerShim.postMessage({
                    id: requestId,
                    type: "decrypt",
                    pdfBytes: pdfBuffer,
                    password: effectivePassword,
                });
            });
        }

        if (typeof (globalThis as any).pdfcpuDecryptPDF === "function") {
            const res = (globalThis as any).pdfcpuDecryptPDF(
                new Uint8Array(pdfBuffer),
                effectivePassword
            );
            if (res && res.error) {
                const errStr = String(res.error);
                let code = "UNSUPPORTED_CLIENT_OP";
                if (
                    errStr.toLowerCase().includes("password") ||
                    errStr.toLowerCase().includes("auth") ||
                    errStr.toLowerCase().includes("credentials")
                ) {
                    code = "DECRYPTION_AUTH_FAILED";
                } else if (
                    errStr.toLowerCase().includes("invalid") ||
                    errStr.toLowerCase().includes("corrupt") ||
                    errStr.toLowerCase().includes("header")
                ) {
                    code = "INVALID_INPUT";
                }
                throw new ExecutionError(code as any, errStr);
            }
            return new Blob([res.pdfBytes], { type: "application/pdf" });
        }
    }

    // Browser Web Worker execution path
    const worker = getOrCreateWorker();
    const requestId = createRequestId();

    return new Promise<Blob>((resolve, reject) => {
        pendingRequests.set(requestId, {
            resolve,
            reject,
        });

        const request: PdfcpuWorkerRequest = {
            id: requestId,
            type: "decrypt",
            pdfBytes: pdfBuffer,
            password: effectivePassword,
        };

        try {
            worker.postMessage(request, [pdfBuffer]);
        } catch (error) {
            pendingRequests.delete(requestId);
            reject(
                new ExecutionError(
                    "CLIENT_FAILURE",
                    "Failed to send decrypt data to the pdfcpu worker.",
                    error
                )
            );
        }
    });
}

export async function executePdfcpuWasmLock(
    pdfFile: File,
    password?: string,
    keyLength: number = 128
): Promise<Blob> {
    if (!pdfFile) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "No PDF document provided to encrypt."
        );
    }

    const effectivePassword = password || (pdfFile as any).originalPassword || "";
    if (!effectivePassword) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "Password is required to encrypt this file."
        );
    }

    const pdfBuffer = await pdfFile.arrayBuffer();
    validatePdfHeader(pdfBuffer);

    // Node.js test environment direct WASM fallback
    if (typeof window === "undefined") {
        const workerShim = customWorkerFactory
            ? customWorkerFactory("/wasm/pdfcpu.worker.js")
            : null;
        if (workerShim) {
            const requestId = createRequestId();
            return new Promise<Blob>((resolve, reject) => {
                const handler = (event: any) => {
                    const data = event.data || event;
                    if (data.id === requestId) {
                        if (data.type === "success") {
                            resolve(new Blob([data.pdfBytes], { type: "application/pdf" }));
                        } else {
                            reject(
                                new ExecutionError(
                                    (data.code as any) || "UNSUPPORTED_CLIENT_OP",
                                    data.message || "Encryption failed."
                                )
                            );
                        }
                    }
                };
                if (typeof workerShim.addEventListener === "function") {
                    workerShim.addEventListener("message", handler);
                } else if ("onmessage" in workerShim) {
                    workerShim.onmessage = handler;
                }
                workerShim.postMessage({
                    id: requestId,
                    type: "encrypt",
                    pdfBytes: pdfBuffer,
                    password: effectivePassword,
                    keyLength,
                });
            });
        }

        if (typeof (globalThis as any).pdfcpuEncryptPDF === "function") {
            const res = (globalThis as any).pdfcpuEncryptPDF(
                new Uint8Array(pdfBuffer),
                effectivePassword,
                keyLength
            );
            if (res && res.error) {
                const errStr = String(res.error);
                let code = "UNSUPPORTED_CLIENT_OP";
                if (
                    errStr.toLowerCase().includes("invalid") ||
                    errStr.toLowerCase().includes("corrupt") ||
                    errStr.toLowerCase().includes("header") ||
                    errStr.toLowerCase().includes("already") ||
                    errStr.toLowerCase().includes("empty")
                ) {
                    code = "INVALID_INPUT";
                }
                throw new ExecutionError(code as any, errStr);
            }
            return new Blob([res.pdfBytes], { type: "application/pdf" });
        }
    }

    // Browser Web Worker execution path
    const worker = getOrCreateWorker();
    const requestId = createRequestId();

    return new Promise<Blob>((resolve, reject) => {
        pendingRequests.set(requestId, {
            resolve,
            reject,
        });

        const request: PdfcpuWorkerRequest = {
            id: requestId,
            type: "encrypt",
            pdfBytes: pdfBuffer,
            password: effectivePassword,
            keyLength,
        };

        try {
            worker.postMessage(request, [pdfBuffer]);
        } catch (error) {
            pendingRequests.delete(requestId);
            reject(
                new ExecutionError(
                    "CLIENT_FAILURE",
                    "Failed to send encrypt data to the pdfcpu worker.",
                    error
                )
            );
        }
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