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
