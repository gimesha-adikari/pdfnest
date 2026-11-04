import assert from "node:assert/strict";

const originalWindow = (globalThis as { window?: unknown }).window;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalSetTimeout = globalThis.setTimeout;
const browserEvents = new Map<string, () => void>();

(globalThis as { window?: unknown }).window = {
    addEventListener: (name: string, listener: () => void) => browserEvents.set(name, listener),
};

type Probe = { url: string; signal: AbortSignal; resolve: (response: Response) => void; reject: (error: unknown) => void };
const probes: Probe[] = [];
function installQueuedFetch() {
    globalThis.fetch = async (input, init) => new Promise<Response>((resolve, reject) => {
        const url = String(input);
        assert.match(url, /\/api\/(health|ready)$/);
        probes.push({ url, signal: init!.signal!, resolve, reject });
    });
}
function resolvePair(start: number, health: Response, readiness: Response) {
    assert.equal(probes[start]?.url.endsWith("/api/health"), true);
    assert.equal(probes[start + 1]?.url.endsWith("/api/ready"), true);
    probes[start].resolve(health);
    probes[start + 1].resolve(readiness);
}
function okHealth() { return new Response(JSON.stringify({ status: "healthy" }), { status: 200 }); }
function ready() { return new Response(JSON.stringify({ ready: true }), { status: 200 }); }

async function run() {
    const { backendHealth } = await import("@/lib/health/backendHealth");
    assert.equal(backendHealth.getState().status, "unknown");
    assert.equal(backendHealth.getState().isAvailable, false, "unknown must not authorize cloud execution");

    let clock = 100_000;
    Date.now = () => clock;
    installQueuedFetch();
    const first = backendHealth.checkHealth();
    assert.equal(backendHealth.getState().status, "checking");
    assert.equal(backendHealth.getState().isAvailable, false);
    const concurrent = backendHealth.checkHealth();
    assert.equal(probes.length, 2, "liveness and readiness each run once for concurrent checks");
    resolvePair(0, okHealth(), new Response(JSON.stringify({ ready: false }), { status: 503 }));
    assert.equal(await first, false);
    assert.equal(await concurrent, false);
    let state = backendHealth.getState();
    assert.equal(state.status, "degraded", "liveness 200 with readiness 503 is degraded, not online");
    assert.equal(state.networkReachable, true);
    assert.equal(state.liveness, "healthy");
    assert.equal(state.readiness, "not_ready");
    assert.equal(state.workerReadiness, "unknown", "public probes do not claim Worker health");
    assert.equal(state.isAvailable, false);
    assert.equal(await backendHealth.checkHealth(), false);
    assert.equal(probes.length, 2, "automatic checks respect the cooldown");

    const recovery = backendHealth.checkHealth(true);
    assert.equal(probes.length, 4);
    resolvePair(2, okHealth(), ready());
    assert.equal(await recovery, true);
    state = backendHealth.getState();
    assert.equal(state.status, "online");
    assert.equal(state.isAvailable, true);
    assert.equal(state.readiness, "ready");
    assert.equal(state.error, null);
    assert.equal(await backendHealth.maybeRecover(), true);
    assert.equal(probes.length, 4, "online recovery signals do not poll");

    browserEvents.get("offline")!();
    assert.equal(backendHealth.getState().status, "offline");
    assert.equal(backendHealth.getState().networkReachable, false);
    assert.equal(await backendHealth.maybeRecover(), false);
    assert.equal(probes.length, 4, "recovery cooldown avoids request storms");
    clock += 60_001;
    const browserRecovery = backendHealth.maybeRecover();
    assert.equal(probes.length, 6);
    resolvePair(4, okHealth(), ready());
    assert.equal(await browserRecovery, true);

    // A single failed pair moves a previously ready service into checking. A
    // repeated transport failure is required before the UI calls it offline.
    installQueuedFetch();
    const firstFailure = backendHealth.checkHealth(true);
    assert.equal(probes.length, 8);
    probes[6].reject(new TypeError("Connection refused"));
    probes[7].reject(new TypeError("Connection refused"));
    assert.equal(await firstFailure, false);
    assert.equal(backendHealth.getState().status, "checking");
    assert.equal(backendHealth.getState().isAvailable, false);
    const secondFailure = backendHealth.checkHealth(true);
    assert.equal(probes.length, 10);
    probes[8].reject(new TypeError("Connection refused"));
    probes[9].reject(new TypeError("Connection refused"));
    assert.equal(await secondFailure, false);
    assert.equal(backendHealth.getState().status, "offline");

    // AbortSignal timeout covers both probes and remains bounded to four seconds.
    let fireTimeout!: () => void;
    globalThis.setTimeout = ((callback: () => void, delay: number) => {
        assert.equal(delay, 4000);
        fireTimeout = callback;
        return originalSetTimeout(() => {}, 60_000);
    }) as typeof setTimeout;
    const timedOut = backendHealth.checkHealth(true);
    assert.equal(probes.length, 12);
    probes[10].signal.addEventListener("abort", () => probes[10].reject(new DOMException("Timed out", "AbortError")));
    probes[11].signal.addEventListener("abort", () => probes[11].reject(new DOMException("Timed out", "AbortError")));
    fireTimeout();
    assert.equal(await timedOut, false);
    assert.equal(backendHealth.getState().status, "offline");
    assert.equal(backendHealth.getState().error, "Health check timed out");

    try {
        // Readiness failure denies availability even when liveness is healthy.
        globalThis.fetch = async (input) => String(input).endsWith("/api/health")
            ? okHealth()
            : new Response(JSON.stringify({ ready: false }), { status: 503 });
        assert.equal(await backendHealth.checkHealth(true), false);
        assert.equal(backendHealth.getState().status, "degraded");
        assert.equal(backendHealth.getState().isAvailable, false);

        // Missing/malformed readiness bodies fail closed.
        globalThis.fetch = async (input) => String(input).endsWith("/api/health")
            ? okHealth()
            : new Response("ok", { status: 200 });
        assert.equal(await backendHealth.checkHealth(true), false);
        assert.equal(backendHealth.getState().readiness, "not_ready");
        assert.equal(backendHealth.getState().isAvailable, false);
    } finally {
        globalThis.fetch = originalFetch;
        Date.now = originalNow;
        globalThis.setTimeout = originalSetTimeout;
        (globalThis as { window?: unknown }).window = originalWindow;
    }

    console.log("Backend liveness/readiness split, degraded state, fail-closed readiness, cooldown, recovery, transient network failure, repeated outage, and timeout passed. ✓");
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
