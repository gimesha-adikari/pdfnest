/* Web Worker for pdfcpu v0.12.1 WASM Execution */
self.importScripts('/wasm/wasm_exec.js');

let isInitialized = false;
let initPromise = null;

async function initWasm() {
    if (isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const go = new self.Go();
        const response = await fetch('/wasm/pdfcpu_watermark.wasm');
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM binary: HTTP ${response.status}`);
        }
        const wasmBytes = await response.arrayBuffer();
        const wasmModule = await WebAssembly.instantiate(wasmBytes, go.importObject);
        go.run(wasmModule.instance);
        isInitialized = true;
    })();

    return initPromise;
}

self.onmessage = async (event) => {
    const { id, type, pdfBytes, text, imageBytes, description } = event.data;

    try {
        await initWasm();

        let result;
        if (type === 'watermark-text') {
            result = self.pdfcpuApplyTextWatermark(
                new Uint8Array(pdfBytes),
                text,
                description
            );
        } else if (type === 'watermark-image') {
            result = self.pdfcpuApplyImageWatermark(
                new Uint8Array(pdfBytes),
                new Uint8Array(imageBytes),
                description
            );
        } else if (type === 'add-text') {
            const elementsJson = typeof event.data.elements === 'string'
                ? event.data.elements
                : JSON.stringify(event.data.elements || []);
            result = self.pdfcpuApplyTextElements(
                new Uint8Array(pdfBytes),
                elementsJson
            );
        } else {
            throw new Error(`Unsupported worker request type '${type}'`);
        }

        if (result && result.error) {
            const errStr = String(result.error);
            let code = "UNSUPPORTED_CLIENT_OP";
            if (errStr.toLowerCase().includes("invalid") || errStr.toLowerCase().includes("corrupt")) {
                code = "INVALID_INPUT";
            }
            self.postMessage({ id, type: "error", code, message: errStr });
            return;
        }

        const outPdfBuffer = result.pdfBytes.buffer;
        self.postMessage({ id, type: "success", pdfBytes: outPdfBuffer }, [outPdfBuffer]);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        self.postMessage({ id, type: "error", code: "CLIENT_FAILURE", message: msg });
    }
};
