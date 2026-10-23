import assert from "node:assert/strict";
import { executePdfcpuWasmUnlock, setWorkerFactory } from "@/lib/execution/pdfcpu/pdfcpuClient";
import { ExecutionError } from "@/lib/execution/types";

const listeners = new Set<(event: { data: unknown }) => void>();
let postedRequestId = "";
let didPost = false;

const fakeWorker = {
    addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { data: unknown }) => void) => listeners.delete(listener),
    postMessage: (request: { id: string }) => {
        postedRequestId = request.id;
        didPost = true;
    },
} as unknown as Worker;

async function main(): Promise<void> {
    setWorkerFactory(() => fakeWorker);
    try {
        const file = new File(["%PDF-1.7\nsynthetic protected bytes"], "protected.pdf", {
            type: "application/pdf",
        });
        const controller = new AbortController();
        const operation = executePdfcpuWasmUnlock(file, "synthetic password", controller.signal);

        for (let attempt = 0; attempt < 10 && !didPost; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        assert.equal(didPost, true, "the local decrypt operation should reach the worker");

        controller.abort();
        await assert.rejects(
            operation,
            (error: unknown) => error instanceof ExecutionError && error.code === "USER_CANCELLATION"
        );

        for (const listener of [...listeners]) {
            listener({
                data: {
                    id: postedRequestId,
                    type: "success",
                    pdfBytes: new Uint8Array([37, 80, 68, 70, 45]),
                },
            });
        }
        assert.equal(listeners.size, 0, "cancelled worker listeners are removed before a late response");
        console.log("PASS: local PDF unlock cancellation rejects and ignores a late worker result");
    } finally {
        setWorkerFactory(null);
    }
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
