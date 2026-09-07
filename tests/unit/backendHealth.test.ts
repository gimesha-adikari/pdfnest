import assert from "node:assert/strict";

const originalWindow = (globalThis as { window?: unknown }).window;
const originalFetch = globalThis.fetch;

// The tracker only performs network checks in a browser. Supply the minimal
// browser surface before importing its singleton for deterministic unit tests.
(globalThis as { window?: unknown }).window = {
    addEventListener: () => {},
};

async function run() {
    const { backendHealth } = await import("@/lib/health/backendHealth");

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
        (globalThis as { window?: unknown }).window = originalWindow;
    }

    console.log("Backend health status handling passed for 200, 502, 503, 504, connection failure, and timeout. ✓");
}

void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
