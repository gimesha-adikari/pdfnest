import assert from "node:assert/strict";

const originalWindow = (globalThis as { window?: unknown }).window;
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalSetTimeout = globalThis.setTimeout;
const browserEvents = new Map<string, () => void>();

// The tracker only performs network checks in a browser. Supply the minimal
// browser surface before importing its singleton for deterministic unit tests.
(globalThis as { window?: unknown }).window = {
    addEventListener: (name: string, listener: () => void) => browserEvents.set(name, listener),
};

async function run() {
    const { backendHealth } = await import("@/lib/health/backendHealth");

    assert.equal(backendHealth.getState().status, "unknown");
    assert.equal(backendHealth.getState().isAvailable, false, "unknown must not authorize cloud execution");

    let clock = 100_000;
    Date.now = () => clock;
    let resolveHealth!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Promise<Response>(resolve => { resolveHealth = resolve; }); };
    const first = backendHealth.checkHealth();
    assert.equal(backendHealth.getState().status, "checking");
    assert.equal(backendHealth.getState().isAvailable, false);
    const concurrent = backendHealth.checkHealth();
    assert.equal(calls, 1, "concurrent checks share the single fetch");
    resolveHealth(new Response("ok", { status: 200 }));
    assert.equal(await first, true);
    assert.equal(await concurrent, true);
    assert.equal(await backendHealth.checkHealth(), true);
    assert.equal(calls, 1, "automatic checks respect cooldown");
    browserEvents.get("offline")!();
    assert.equal(backendHealth.getState().status, "offline");
    assert.equal(await backendHealth.maybeRecover(), false);
    assert.equal(calls, 1, "recovery cooldown avoids request storms");
    clock += 60_001;
    const recovery = backendHealth.maybeRecover();
    assert.equal(calls, 2);
    resolveHealth(new Response("ok", { status: 200 }));
    assert.equal(await recovery, true);
    assert.equal(backendHealth.getState().isAvailable, true);
    assert.equal(backendHealth.getState().error, null);
    assert.equal(await backendHealth.maybeRecover(), true);
    assert.equal(calls, 2, "online recovery signals do not poll");

    // Exercise the actual timeout's abort signal without waiting four seconds.
    let fireTimeout!: () => void;
    globalThis.setTimeout = ((callback: () => void, delay: number) => {
        assert.equal(delay, 4000); fireTimeout = callback; return originalSetTimeout(() => {}, 60_000);
    }) as typeof setTimeout;
    globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    });
    const timedOut = backendHealth.checkHealth(true);
    fireTimeout();
    assert.equal(await timedOut, false);
    assert.equal(backendHealth.getState().error, "Health check timed out");
    globalThis.setTimeout = originalSetTimeout;

    const cases: Array<{
        name: string;
        fetch: () => Promise<Response>;
        expectedAvailable: boolean;
        expectedStatus: "online" | "offline";
    }> = [
        {
            name: "200 health response",
            fetch: async () => new Response(JSON.stringify({ status: "healthy" }), { status: 200 }),
            expectedAvailable: true,
            expectedStatus: "online",
        },
        {
            name: "502 health response",
            fetch: async () => new Response("Bad Gateway", { status: 502 }),
            expectedAvailable: false,
            expectedStatus: "offline",
        },
        {
            name: "503 health response",
            fetch: async () => new Response("Service Unavailable", { status: 503 }),
            expectedAvailable: false,
            expectedStatus: "offline",
        },
        {
            name: "504 health response",
            fetch: async () => new Response("Gateway Timeout", { status: 504 }),
            expectedAvailable: false,
            expectedStatus: "offline",
        },
        {
            name: "connection failure",
            fetch: async () => Promise.reject(new TypeError("Connection refused")),
            expectedAvailable: false,
            expectedStatus: "offline",
        },
        {
            name: "timeout failure",
            fetch: async () => Promise.reject(new DOMException("Timed out", "AbortError")),
            expectedAvailable: false,
            expectedStatus: "offline",
        },
    ];

    try {
        for (const testCase of cases) {
            globalThis.fetch = testCase.fetch as typeof fetch;
            const available = await backendHealth.checkHealth(true);
            const state = backendHealth.getState();

            assert.equal(available, testCase.expectedAvailable, testCase.name);
            assert.equal(state.status, testCase.expectedStatus, testCase.name);
            assert.equal(state.isAvailable, testCase.expectedAvailable, testCase.name);
        }
    } finally {
        globalThis.fetch = originalFetch;
        Date.now = originalNow;
        globalThis.setTimeout = originalSetTimeout;
        (globalThis as { window?: unknown }).window = originalWindow;
    }

    console.log("Backend health pending, deduplication, cooldown, recovery, 200/502/503/504, connection failure, and timeout passed. ✓");
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
