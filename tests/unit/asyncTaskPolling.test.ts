import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useAsyncTask } from "../../hooks/useAsyncTask";

// Minimal DOM surface for a hook-only React root, matching existing hook tests.
class Element {
    nodeType = 1;
    nodeName = "DIV";
    tagName = "DIV";
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style = {};
    ownerDocument: unknown;
    addEventListener() {}
    removeEventListener() {}
}
const documentMock = Object.assign(new Element(), {
    nodeType: 9,
    createElement: () => Object.assign(new Element(), { ownerDocument: documentMock }),
    defaultView: globalThis,
});
const storage = new Map<string, string>();
Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    document: documentMock,
    window: globalThis,
    HTMLIFrameElement: class {},
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
});

async function main() {
    const requests: RequestInit[] = [];
    let reads = 0;
    globalThis.fetch = async (_url, init = {}) => {
        requests.push(init);
        if (init.method === "POST") return Response.json({ task_id: "owned-task" });
        reads += 1;
        return Response.json({ id: "owned-task", status: reads === 1 ? "QUEUED" : "COMPLETED", progress: reads === 1 ? 0 : 100 });
    };
    const ownerPollingFetch = globalThis.fetch;
    let hook!: ReturnType<typeof useAsyncTask>;
    let completed = "";
    function Harness() {
        hook = useAsyncTask("test-tool", (url) => { completed = url; });
        return null;
    }
    const root = createRoot(documentMock.createElement() as unknown as HTMLElement);
    try {
        await act(async () => root.render(React.createElement(Harness)));
        await act(async () => { await hook.submitTask("/api/test", new FormData()); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
        assert.equal(hook.status, "QUEUED");
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
        assert.equal(hook.status, "COMPLETED", "queued tasks continue polling to completion");
        assert.match(completed, /\/api\/v1\/download\/owned-task/);
        assert.ok(requests.every(request => request.credentials === "include"), "submission and status retain owner cookies");
    } finally {
        await act(async () => root.unmount());
    }

    // Polling and the cancel/completion race can both observe the same
    // server-confirmed terminal result. The operation must publish once.
    const pollStarted = deferred<void>();
    const cancelStarted = deferred<void>();
    const terminalLookupStarted = deferred<void>();
    const pollResponse = deferred<Response>();
    const cancelResponse = deferred<Response>();
    const terminalResponse = deferred<Response>();
    let statusLookups = 0;
    const completionUrls: string[] = [];
    globalThis.fetch = async (url, init = {}) => {
        if (init.method === "POST") return Response.json({ task_id: "racing-task" });
        if (init.method === "DELETE") {
            cancelStarted.resolve();
            return cancelResponse.promise;
        }
        if (String(url).endsWith("/api/v1/tasks/racing-task")) {
            statusLookups += 1;
            if (statusLookups === 1) {
                pollStarted.resolve();
                return pollResponse.promise;
            }
            terminalLookupStarted.resolve();
            return terminalResponse.promise;
        }
        throw new Error(`Unexpected request: ${String(url)}`);
    };
    let racingHook!: ReturnType<typeof useAsyncTask>;
    function RacingHarness() {
        racingHook = useAsyncTask("racing-tool", (url) => { completionUrls.push(url); });
        return null;
    }
    const racingRoot = createRoot(documentMock.createElement() as unknown as HTMLElement);
    try {
        await act(async () => racingRoot.render(React.createElement(RacingHarness)));
        await act(async () => { await racingHook.submitTask("/api/test", new FormData()); });
        await act(async () => { await pollStarted.promise; });

        let cancelPromise!: Promise<void>;
        await act(async () => {
            cancelPromise = racingHook.cancelTask();
            await cancelStarted.promise;
        });
        await act(async () => {
            cancelResponse.resolve(Response.json({ id: "racing-task" }, { status: 409 }));
            await terminalLookupStarted.promise;
        });
        await act(async () => {
            pollResponse.resolve(Response.json({ id: "racing-task", status: "COMPLETED", progress: 100 }));
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        await act(async () => {
            terminalResponse.resolve(Response.json({ id: "racing-task", status: "COMPLETED", progress: 100 }));
            await cancelPromise;
        });

        assert.equal(completionUrls.length, 1, "polling and cancellation must not publish duplicate completion callbacks");
        assert.match(completionUrls[0], /\/api\/v1\/download\/racing-task/);
    } finally {
        await act(async () => racingRoot.unmount());
    }

    // A page reload must resume a queued task with the same owner credential.
    globalThis.fetch = ownerPollingFetch;
    storage.set("pdfnest:async-tasks", JSON.stringify([{ taskId: "owned-task", tool: "test-tool", createdAt: Date.now(), status: "QUEUED" }]));
    reads = 0;
    const restored = createRoot(documentMock.createElement() as unknown as HTMLElement);
    try {
        await act(async () => restored.render(React.createElement(Harness)));
        assert.equal(hook.taskId, "owned-task");
        assert.equal(hook.status, "QUEUED");
        assert.equal(requests.at(-1)?.credentials, "include");
    } finally {
        await act(async () => restored.unmount());
    }

    for (const [index, testCase] of [
        { status: "PROCESSING", progress: 99, shouldComplete: false },
        { status: "PROCESSING", progress: 100, shouldComplete: false },
        { status: "FAILED", progress: 100, shouldComplete: false },
        { status: "CANCELLED", progress: 100, shouldComplete: false },
        { status: "COMPLETED", progress: 100, shouldComplete: true },
    ].entries()) {
        const taskId = `progress-terminal-case-${index}`;
        let statusRequested = false;
        let published = 0;
        globalThis.fetch = async (url) => {
            if (String(url).endsWith(`/api/v1/tasks/${taskId}`)) {
                statusRequested = true;
                return Response.json({ id: taskId, status: testCase.status, progress: testCase.progress });
            }
            throw new Error(`Unexpected request for progress terminal case: ${String(url)}`);
        };
        let progressHook!: ReturnType<typeof useAsyncTask>;
        function ProgressHarness() {
            progressHook = useAsyncTask(`progress-case-${index}`, () => { published += 1; });
            return null;
        }
        const progressRoot = createRoot(documentMock.createElement() as unknown as HTMLElement);
        try {
            await act(async () => progressRoot.render(React.createElement(ProgressHarness)));
            await act(async () => {
                progressHook.setTaskId(taskId);
                progressHook.setStatus("PROCESSING");
            });
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
            assert.equal(statusRequested, true, `${testCase.status} at ${testCase.progress}% must come from a status response`);
            assert.equal(published, testCase.shouldComplete ? 1 : 0, `${testCase.status} at ${testCase.progress}% must be terminal-status gated`);
        } finally {
            await act(async () => progressRoot.unmount());
        }
    }
    console.log("Async task owner credentials, queued polling and reload recovery passed.");
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
main().catch(error => { console.error(error); process.exitCode = 1; });
