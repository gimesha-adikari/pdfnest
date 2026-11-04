import assert from "node:assert/strict";

const originalWindow = (globalThis as { window?: unknown }).window;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalSetTimeout = globalThis.setTimeout;
const listeners = new Map<string, () => void>();
(globalThis as { window?: unknown }).window = {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
};

function backendHealthy() {
    return new Response(JSON.stringify({ status: "healthy" }), { status: 200 });
}

function backendReady() {
    return new Response(JSON.stringify({ ready: true }), { status: 200 });
}

function worker(status: string, capabilities: Record<string, boolean>, httpStatus = status === "ready" ? 200 : 503) {
    return new Response(JSON.stringify({ status, capabilities }), { status: httpStatus });
}

async function flush() {
    await new Promise<void>((resolve) => setImmediate(resolve));
}

async function run() {
    let clock = 200_000;
    Date.now = () => clock;
    const { backendHealth } = await import("@/lib/health/backendHealth");
    let workerResponse = worker("not_ready", { document_processing: true, ocr: false, office_to_pdf: true, pdf_to_office: true });
    globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.endsWith("/api/health")) return backendHealthy();
        if (url.endsWith("/api/ready")) return backendReady();
        if (url.endsWith("/api/health/worker")) return workerResponse;
        throw new Error(`Unexpected health request: ${url}`);
    };

    assert.equal(await backendHealth.checkHealth(true), true);
    await flush();
    assert.equal(backendHealth.getState().status, "online");
    assert.equal(backendHealth.getState().isAvailable, true);
    assert.equal(backendHealth.getState().workerReadiness, "not_ready");
    assert.deepEqual(backendHealth.getState().workerCapabilities, {
        document_processing: true,
        ocr: false,
        office_to_pdf: true,
        pdf_to_office: true,
    });

    workerResponse = worker("ready", { document_processing: true, ocr: true, office_to_pdf: true, pdf_to_office: true });
    await backendHealth.checkWorkerHealth(true);
    assert.equal(backendHealth.getState().status, "online", "Worker recovery does not replace Backend health");
    assert.equal(backendHealth.getState().workerReadiness, "ready");
    assert.equal(backendHealth.getState().workerCapabilities?.ocr, true);

    // A Backend-mediated authentication failure is represented as unknown while
    // Backend readiness remains online and Worker-dependent execution fails closed.
    workerResponse = worker("unknown", { document_processing: false, ocr: false, office_to_pdf: false, pdf_to_office: false }, 200);
    await backendHealth.checkWorkerHealth(true);
    assert.equal(backendHealth.getState().status, "online");
    assert.equal(backendHealth.getState().workerReadiness, "unknown");
    assert.equal(backendHealth.getState().workerCapabilities, null);

    // A hung Worker probe times out independently and does not mark Backend offline.
    clock += 60_001;
    let fireWorkerTimeout!: () => void;
    globalThis.setTimeout = ((callback: () => void, delay: number) => {
        if (delay === 3000) fireWorkerTimeout = callback;
        return originalSetTimeout(() => {}, 60_000);
    }) as typeof setTimeout;
    globalThis.fetch = async (input, init) => {
        if (String(input).endsWith("/api/health/worker")) {
            return new Promise<Response>((_resolve, reject) => {
                init!.signal!.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
            });
        }
        return String(input).endsWith("/api/health") ? backendHealthy() : backendReady();
    };
    const backendProbe = backendHealth.checkHealth(true);
    assert.equal(await backendProbe, true);
    assert.equal(backendHealth.getState().status, "online");
    fireWorkerTimeout();
    await flush();
    assert.equal(backendHealth.getState().status, "online");
    assert.equal(backendHealth.getState().isAvailable, true);
    assert.equal(backendHealth.getState().workerReadiness, "unknown");

    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalNow;
    (globalThis as { window?: unknown }).window = originalWindow;
    console.log("Worker readiness state, capability recovery, authentication failure, and independent timeout passed. ✓");
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
