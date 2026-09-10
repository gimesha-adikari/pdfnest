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

    // A page reload must resume a queued task with the same owner credential.
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
    console.log("Async task owner credentials, queued polling and reload recovery passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
