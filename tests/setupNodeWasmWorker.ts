import fs from "fs";
import path from "path";
import { setWorkerFactory } from "../lib/execution/pdfcpu/pdfcpuClient";

let nodeWasmReady = false;

async function initNodeWasm(): Promise<void> {
    if (nodeWasmReady) return;
    try {
        require("/usr/local/go/lib/wasm/wasm_exec.js");
    } catch {
        const localWasmExec = path.resolve(__dirname, "../public/wasm/wasm_exec.js");
        require(localWasmExec);
    }
    const go = new (global as any).Go();
    const wasmPath = path.resolve(__dirname, "../public/wasm/pdfcpu_watermark.wasm");
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, go.importObject);
    go.run(wasmModule.instance);
    nodeWasmReady = true;
}

// Polyfill DOM globals in Node.js test environment for pdfjs-dist
if (typeof global !== "undefined") {
    if (!(global as any).DOMMatrix) {
        (global as any).DOMMatrix = class DOMMatrix {
            a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
            m11 = 1; m12 = 0; m13 = 0; m14 = 0;
            m21 = 0; m22 = 1; m23 = 0; m24 = 0;
            m31 = 0; m32 = 0; m33 = 1; m34 = 0;
            m41 = 0; m42 = 0; m43 = 0; m44 = 1;
            constructor(init?: any) {
                if (Array.isArray(init)) {
                    this.a = init[0] ?? 1;
                    this.b = init[1] ?? 0;
                    this.c = init[2] ?? 0;
                    this.d = init[3] ?? 1;
                    this.e = init[4] ?? 0;
                    this.f = init[5] ?? 0;
                }
            }
        };
    }
    if (!(global as any).ImageData) {
        (global as any).ImageData = class ImageData {
            width: number;
            height: number;
            data: Uint8ClampedArray;
            constructor(width: number, height: number) {
                this.width = width;
                this.height = height;
                this.data = new Uint8ClampedArray(width * height * 4);
            }
        };
    }
    if (!(global as any).Path2D) {
        (global as any).Path2D = class Path2D {};
    }
}

export function setupNodeWasmWorker(): void {
    if (typeof Worker === "undefined" && typeof process !== "undefined") {
        setWorkerFactory(() => {
            const listeners: Record<string, ((event: any) => void)[]> = {
                message: [],
                error: [],
                messageerror: [],
            };

            const workerShim = {
                onmessage: null as ((event: any) => void) | null,
                onerror: null as ((event: any) => void) | null,
                onmessageerror: null as ((event: any) => void) | null,

                addEventListener(event: string, cb: (event: any) => void) {
                    if (listeners[event]) listeners[event].push(cb);
                },
                removeEventListener(event: string, cb: (event: any) => void) {
                    if (listeners[event]) {
                        listeners[event] = listeners[event].filter((l) => l !== cb);
                    }
                },

                async postMessage(request: any) {
                    await initNodeWasm();
                    setTimeout(() => {
                        try {
                            if (request.type === "watermark-text") {
                                const result = (global as any).pdfcpuApplyTextWatermark(
                                    new Uint8Array(request.pdfBytes),
                                    request.text,
                                    request.description
                                );
                                if (result.error) {
                                    const resp = {
                                        id: request.id,
                                        type: "error",
                                        code: "CLIENT_FAILURE",
                                        message: result.error,
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                } else {
                                    const resp = {
                                        id: request.id,
                                        type: "success",
                                        pdfBytes: result.pdfBytes.buffer.slice(
                                            result.pdfBytes.byteOffset,
                                            result.pdfBytes.byteOffset + result.pdfBytes.byteLength
                                        ),
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                }
                            } else if (request.type === "watermark-image") {
                                const result = (global as any).pdfcpuApplyImageWatermark(
                                    new Uint8Array(request.pdfBytes),
                                    new Uint8Array(request.imageBytes),
                                    request.description
                                );
                                if (result.error) {
                                    const resp = {
                                        id: request.id,
                                        type: "error",
                                        code: "CLIENT_FAILURE",
                                        message: result.error,
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                } else {
                                    const resp = {
                                        id: request.id,
                                        type: "success",
                                        pdfBytes: result.pdfBytes.buffer.slice(
                                            result.pdfBytes.byteOffset,
                                            result.pdfBytes.byteOffset + result.pdfBytes.byteLength
                                        ),
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                }
                            } else if (request.type === "add-text") {
                                const elementsJson = typeof request.elements === "string"
                                    ? request.elements
                                    : JSON.stringify(request.elements || []);
                                const result = (global as any).pdfcpuApplyTextElements(
                                    new Uint8Array(request.pdfBytes),
                                    elementsJson
                                );
                                if (result.error) {
                                    const resp = {
                                        id: request.id,
                                        type: "error",
                                        code: "CLIENT_FAILURE",
                                        message: result.error,
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                } else {
                                    const resp = {
                                        id: request.id,
                                        type: "success",
                                        pdfBytes: result.pdfBytes.buffer.slice(
                                            result.pdfBytes.byteOffset,
                                            result.pdfBytes.byteOffset + result.pdfBytes.byteLength
                                        ),
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                }
                            } else if (request.type === "decrypt") {
                                const result = (global as any).pdfcpuDecryptPDF(
                                    new Uint8Array(request.pdfBytes),
                                    request.password || ""
                                );
                                if (result.error) {
                                    const errStr = String(result.error);
                                    let code = "UNSUPPORTED_CLIENT_OP";
                                    if (errStr.toLowerCase().includes("password") || errStr.toLowerCase().includes("auth") || errStr.toLowerCase().includes("credentials")) {
                                        code = "DECRYPTION_AUTH_FAILED";
                                    } else if (errStr.toLowerCase().includes("invalid") || errStr.toLowerCase().includes("corrupt") || errStr.toLowerCase().includes("header")) {
                                        code = "INVALID_INPUT";
                                    }
                                    const resp = {
                                        id: request.id,
                                        type: "error",
                                        code,
                                        message: result.error,
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                } else {
                                    const resp = {
                                        id: request.id,
                                        type: "success",
                                        pdfBytes: result.pdfBytes.buffer.slice(
                                            result.pdfBytes.byteOffset,
                                            result.pdfBytes.byteOffset + result.pdfBytes.byteLength
                                        ),
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                }
                            } else if (request.type === "encrypt") {
                                const result = (global as any).pdfcpuEncryptPDF(
                                    new Uint8Array(request.pdfBytes),
                                    request.password || "",
                                    request.keyLength || 128
                                );
                                if (result.error) {
                                    const errStr = String(result.error);
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
                                    const resp = {
                                        id: request.id,
                                        type: "error",
                                        code,
                                        message: result.error,
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                } else {
                                    const resp = {
                                        id: request.id,
                                        type: "success",
                                        pdfBytes: result.pdfBytes.buffer.slice(
                                            result.pdfBytes.byteOffset,
                                            result.pdfBytes.byteOffset + result.pdfBytes.byteLength
                                        ),
                                    };
                                    workerShim.onmessage?.({ data: resp });
                                    listeners.message.forEach((cb) => cb({ data: resp }));
                                }
                            }
                        } catch (err: any) {
                            const resp = {
                                id: request.id,
                                type: "error",
                                code: "CLIENT_FAILURE",
                                message: err?.message || String(err),
                            };
                            workerShim.onmessage?.({ data: resp });
                            listeners.message.forEach((cb) => cb({ data: resp }));
                        }
                    }, 0);
                },

                terminate() {},
            };

            return workerShim as any;
        });
    }
}
