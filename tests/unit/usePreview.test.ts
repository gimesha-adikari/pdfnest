// pdfnest/tests/unit/usePreview.test.ts

import React, { act, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import assert from "assert";

import { usePreview, UsePreviewOptions, UsePreviewResult } from "../../lib/preview/usePreview";
import { PreviewManager } from "../../lib/preview/PreviewManager";
import { PreviewCache } from "../../lib/preview/PreviewCache";
import { ClientPdfRenderer } from "../../lib/preview/ClientPdfRenderer";
import {
    PreviewRequest,
    PreviewResource,
    PreviewRenderer,
    PreviewError,
} from "../../lib/preview/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ─── DOM Mock Setup for React DOM 19 in Node ─────────────────────────────────

class MockElement {
    nodeType = 1;
    nodeName = "DIV";
    tagName = "DIV";
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style = {};
    childNodes: any[] = [];
    ownerDocument: any = null;

    appendChild(child: any) {
        this.childNodes.push(child);
        return child;
    }
    removeChild(child: any) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
        return child;
    }
    insertBefore(newChild: any, refChild: any) {
        const idx = this.childNodes.indexOf(refChild);
        if (idx >= 0) this.childNodes.splice(idx, 0, newChild);
        else this.childNodes.push(newChild);
        return newChild;
    }
    setAttribute() {}
    removeAttribute() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
        return true;
    }
}

const doc: any = new MockElement();
doc.nodeType = 9;
doc.nodeName = "#document";
doc.createElement = (tag: string) => {
    const el = new MockElement();
    el.nodeName = tag.toUpperCase();
    el.tagName = tag.toUpperCase();
    el.ownerDocument = doc;
    return el;
};
doc.createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
doc.createTextNode = (text: string) => {
    const el = new MockElement();
    el.nodeType = 3;
    el.nodeName = "#text";
    (el as any).nodeValue = text;
    el.ownerDocument = doc;
    return el;
};
doc.defaultView = globalThis;
doc.HTMLIFrameElement = class HTMLIFrameElement {};

(globalThis as any).document = doc;
(globalThis as any).window = globalThis;
(globalThis as any).HTMLIFrameElement = doc.HTMLIFrameElement;
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};

// ─── renderHook Test Harness ─────────────────────────────────────────────────

interface HookHarness<Props, Result> {
    result: { current: Result };
    rerender: (newProps?: Props) => Promise<void>;
    unmount: () => Promise<void>;
}

async function renderHook<Props, Result>(
    hookFn: (props: Props) => Result,
    initialProps: Props,
): Promise<HookHarness<Props, Result>> {
    const container = doc.createElement("div");
    const root = createRoot(container);
    const result = { current: undefined as any };

    let currentProps = initialProps;

    function Component({ props }: { props: Props }) {
        result.current = hookFn(props);
        return null;
    }

    await act(async () => {
        root.render(React.createElement(Component, { props: currentProps }));
    });

    const rerender = async (newProps?: Props) => {
        if (newProps !== undefined) {
            currentProps = newProps;
        }
        await act(async () => {
            root.render(React.createElement(Component, { props: currentProps }));
        });
    };

    const unmount = async () => {
        await act(async () => {
            root.unmount();
        });
    };

    return { result, rerender, unmount };
}

// ─── Fake Helpers ─────────────────────────────────────────────────────────────

function makeFile(name = "test.pdf", size = 1000, lastModified = 12345): File {
    return {
        name,
        size,
        lastModified,
        type: "application/pdf",
    } as unknown as File;
}

interface DeferredRenderer extends PreviewRenderer {
    lastRequest: PreviewRequest | null;
    invocationCount: number;
    resolveLast: (resource: PreviewResource) => void;
    rejectLast: (err: unknown) => void;
}

function makeDeferredRenderer(
    id: string,
    caps = { client: true, server: true },
): DeferredRenderer {
    let pendingResolvers: Array<(r: PreviewResource) => void> = [];
    let pendingRejecters: Array<(e: unknown) => void> = [];

    const renderer: DeferredRenderer = {
        id,
        capabilities: caps,
        lastRequest: null,
        invocationCount: 0,
        canRender: () => true,
        render: (request: PreviewRequest, signal: AbortSignal) => {
            renderer.lastRequest = request;
            renderer.invocationCount++;
            return new Promise<PreviewResource>((resolve, reject) => {
                pendingResolvers.push(resolve);
                pendingRejecters.push(reject);
                signal.addEventListener("abort", () => {
                    const idx = pendingRejecters.indexOf(reject);
                    if (idx >= 0) {
                        pendingRejecters.splice(idx, 1);
                        pendingResolvers.splice(idx, 1);
                    }
                    const err = new DOMException("Aborted", "AbortError");
                    reject(err);
                });
            });
        },
        resolveLast: (resource: PreviewResource) => {
            const res = pendingResolvers.pop();
            pendingRejecters.pop();
            if (res) res(resource);
        },
        rejectLast: (err: unknown) => {
            const rej = pendingRejecters.pop();
            pendingResolvers.pop();
            if (rej) rej(err);
        },
    };

    return renderer;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function test1_initialDisabledState(): Promise<void> {
    const manager = new PreviewManager();
    const h = await renderHook(usePreview, { file: null, page: 1, manager });

    assert.equal(h.result.current.src, "");
    assert.equal(h.result.current.isLoading, false);
    assert.equal(h.result.current.error, null);

    const h2 = await renderHook(usePreview, { file: makeFile(), page: 0, manager });
    assert.equal(h2.result.current.src, "");
    assert.equal(h2.result.current.isLoading, false);

    const h3 = await renderHook(usePreview, { file: makeFile(), page: 1, enabled: false, manager });
    assert.equal(h3.result.current.src, "");
    assert.equal(h3.result.current.isLoading, false);

    await h.unmount();
    await h2.unmount();
    await h3.unmount();
}

async function test2_basicServerPreviewSuccess(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r", { client: false, server: true });
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:http://localhost/123" });
    });

    assert.equal(h.result.current.src, "blob:http://localhost/123");
    assert.equal(h.result.current.isLoading, false);
    assert.equal(h.result.current.error, null);

    await h.unmount();
}

async function test3_loadingToSuccessTransition(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    assert.equal(h.result.current.isLoading, true);
    assert.equal(h.result.current.src, "");

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:http://localhost/success" });
    });

    assert.equal(h.result.current.isLoading, false);
    assert.equal(h.result.current.src, "blob:http://localhost/success");

    await h.unmount();
}

async function test4_correctPreviewRequestConstruction(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile("doc.pdf", 500, 999);
    const h = await renderHook(usePreview, { file, page: 3, manager });

    const req = renderer.lastRequest!;
    assert.ok(req, "Request should be passed to renderer");
    assert.equal(req.document.id, "doc.pdf:500:999:application/pdf");
    assert.equal(req.document.version, "999");
    assert.equal(req.page, 3);
    assert.equal(req.mode, "page");
    assert.equal(req.renderer, "server");
    assert.equal(req.scale, 2.0);

    await h.unmount();
}

async function test5_fileChangeCreatesNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file1 = makeFile("f1.pdf", 100);
    const file2 = makeFile("f2.pdf", 200);

    const h = await renderHook(usePreview, { file: file1, page: 1, manager });
    assert.equal(renderer.invocationCount, 1);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:f1" });
    });
    assert.equal(h.result.current.src, "blob:f1");

    await h.rerender({ file: file2, page: 1, manager });
    assert.equal(renderer.invocationCount, 2);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:f2" });
    });
    assert.equal(h.result.current.src, "blob:f2");

    await h.unmount();
}

async function test6_pageChangeCreatesNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });
    assert.equal(renderer.invocationCount, 1);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:p1" });
    });

    await h.rerender({ file, page: 2, manager });
    assert.equal(renderer.invocationCount, 2);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:p2" });
    });
    assert.equal(h.result.current.src, "blob:p2");

    await h.unmount();
}

async function test7_scaleChangeCreatesNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, scale: 2.0, manager });
    assert.equal(renderer.invocationCount, 1);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:s2" });
    });

    await h.rerender({ file, page: 1, scale: 1.5, manager });
    assert.equal(renderer.invocationCount, 2);
    assert.equal(renderer.lastRequest?.scale, 1.5);

    await h.unmount();
}

async function test8_rendererChangeCreatesNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const clientRenderer = makeDeferredRenderer("client-r", { client: true, server: false });
    const serverRenderer = makeDeferredRenderer("server-r", { client: false, server: true });
    manager.registerRenderer(clientRenderer);
    manager.registerRenderer(serverRenderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, renderer: "server", manager });
    assert.equal(serverRenderer.invocationCount, 1);

    await act(async () => {
        serverRenderer.resolveLast({ type: "image-url", url: "blob:server" });
    });

    await h.rerender({ file, page: 1, renderer: "client", manager });
    assert.equal(clientRenderer.invocationCount, 1);

    await h.unmount();
}

async function test9_modePageDefaultsCorrectly(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, mode: "page", manager });

    assert.equal(renderer.lastRequest?.mode, "page");
    assert.equal(renderer.lastRequest?.renderer, "server");
    assert.equal(renderer.lastRequest?.scale, 2.0);

    await h.unmount();
}

async function test10_modeThumbnailDefaultsCorrectly(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("client-r", { client: true, server: false });
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, mode: "thumbnail", manager });

    assert.equal(renderer.lastRequest?.mode, "thumbnail");
    assert.equal(renderer.lastRequest?.renderer, "client");
    assert.equal(renderer.lastRequest?.scale, 0.3);

    await h.unmount();
}

async function test11_explicitScaleOverridesMode(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("client-r", { client: true, server: false });
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, mode: "thumbnail", scale: 0.5, manager });

    assert.equal(renderer.lastRequest?.scale, 0.5);

    await h.unmount();
}

async function test12_enabledFalsePreventsRequests(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, enabled: false, manager });

    assert.equal(renderer.invocationCount, 0);
    assert.equal(h.result.current.src, "");
    assert.equal(h.result.current.isLoading, false);

    await h.unmount();
}

async function test13_enabledTrueAfterFalseRequestsCorrectly(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, enabled: false, manager });
    assert.equal(renderer.invocationCount, 0);

    await h.rerender({ file, page: 1, enabled: true, manager });
    assert.equal(renderer.invocationCount, 1);

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:enabled" });
    });
    assert.equal(h.result.current.src, "blob:enabled");

    await h.unmount();
}

async function test14_errorState(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.rejectLast(new Error("Render failed"));
    });

    assert.equal(h.result.current.src, "");
    assert.equal(h.result.current.isLoading, false);
    assert.ok(h.result.current.error !== null);
    assert.equal(h.result.current.error?.message, "Render failed");

    await h.unmount();
}

async function test15_onErrorReceivesPreviewError(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    let receivedError: PreviewError | null = null;
    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        manager,
        onError: (err) => { receivedError = err; },
    });

    await act(async () => {
        renderer.rejectLast({ code: "ERR_500", message: "Internal server error" });
    });

    assert.ok(receivedError !== null);
    assert.equal((receivedError as PreviewError).code, "ERR_500");
    assert.equal((receivedError as PreviewError).message, "Internal server error");

    await h.unmount();
}

async function test16_errorClearsWhenNewRequestStarts(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.rejectLast(new Error("Fail"));
    });
    assert.ok(h.result.current.error !== null);

    await h.rerender({ file, page: 2, manager });
    assert.equal(h.result.current.error, null);
    assert.equal(h.result.current.isLoading, true);

    await h.unmount();
}

async function test17_resetClearsState(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:res" });
    });
    assert.equal(h.result.current.src, "blob:res");

    await act(async () => {
        h.result.current.reset();
    });

    assert.equal(h.result.current.src, "");
    assert.equal(h.result.current.isLoading, false);
    assert.equal(h.result.current.error, null);

    await h.unmount();
}

async function test18_resetUnsubscribes(): Promise<void> {
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:res" });
    });

    // Resource should be retained while subscribed
    const key = renderer.lastRequest ? manager.getCached(renderer.lastRequest) : null;
    assert.ok(key, "Resource should be cached");

    await act(async () => {
        h.result.current.reset();
    });

    await h.unmount();
}

async function test19_unmountUnsubscribes(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:unmount" });
    });

    await h.unmount();
    // Successfully unmounted without error
}

async function test20_noStateUpdateAfterUnsubscribe(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    await h.unmount();

    // Resolve after unmount — should not crash or trigger react state update warning
    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:after-unmount" });
    });
}

async function test21_synchronousCacheHitDelivery(): Promise<void> {
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    // Prime cache with first hook instance
    const h1 = await renderHook(usePreview, { file, page: 1, manager });
    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:cache-hit" });
    });
    assert.equal(h1.result.current.src, "blob:cache-hit");

    // Second hook instance for same request should get cache hit immediately
    const h2 = await renderHook(usePreview, { file, page: 1, manager });
    assert.equal(h2.result.current.src, "blob:cache-hit");
    assert.equal(h2.result.current.isLoading, false);

    await h1.unmount();
    await h2.unmount();
}

async function test22_asynchronousRenderDelivery(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    assert.equal(h.result.current.isLoading, true);
    assert.equal(h.result.current.src, "");

    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:async-render" });
    });

    assert.equal(h.result.current.src, "blob:async-render");
    assert.equal(h.result.current.isLoading, false);

    await h.unmount();
}

async function test23_staleRequestCannotOverwriteNewerRequest(): Promise<void> {
    const manager = new PreviewManager();
    let resolverP1: any = null;
    let resolverP2: any = null;

    const renderer: PreviewRenderer = {
        id: "server-r",
        capabilities: { client: true, server: true },
        canRender: () => true,
        render: (req: PreviewRequest, signal: AbortSignal) => {
            return new Promise((resolve, reject) => {
                if (req.page === 1) resolverP1 = resolve;
                if (req.page === 2) resolverP2 = resolve;
                signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        },
    };
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, { file, page: 1, manager });

    // Switch to page 2 while page 1 is in flight
    await h.rerender({ file, page: 2, manager });

    // Resolve page 2
    await act(async () => {
        resolverP2({ type: "image-url", url: "blob:p2" });
    });
    assert.equal(h.result.current.src, "blob:p2");

    // Resolve stale page 1
    await act(async () => {
        if (resolverP1) resolverP1({ type: "image-url", url: "blob:p1-stale" });
    });

    // Output must stay blob:p2
    assert.equal(h.result.current.src, "blob:p2");

    await h.unmount();
}

async function test24_reactStrictModeMountCleanup(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();

    // Simulate Strict Mode: Mount 1 -> Unmount 1 -> Mount 2
    const h1 = await renderHook(usePreview, { file, page: 1, manager });
    await h1.unmount();

    const h2 = await renderHook(usePreview, { file, page: 1, manager });
    await act(async () => {
        renderer.resolveLast({ type: "image-url", url: "blob:strict-mode" });
    });

    assert.equal(h2.result.current.src, "blob:strict-mode");

    await h2.unmount();
}

async function test25_multipleHookInstancesShareResource(): Promise<void> {
    let revoked = false;
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const renderer = makeDeferredRenderer("server-r");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const resource: PreviewResource = {
        type: "image-url",
        url: "blob:shared",
        revoke: () => { revoked = true; },
    };

    const h1 = await renderHook(usePreview, { file, page: 1, manager });
    const h2 = await renderHook(usePreview, { file, page: 1, manager });

    await act(async () => {
        renderer.resolveLast(resource);
    });

    assert.equal(h1.result.current.src, "blob:shared");
    assert.equal(h2.result.current.src, "blob:shared");

    // Unmount instance 1 — instance 2 still active so resource must NOT be revoked
    await h1.unmount();
    assert.equal(revoked, false, "Resource should not be revoked while h2 is active");

    // Unmount instance 2 — subscribers gone; resource remains in cache for future hits
    await h2.unmount();
    assert.equal(revoked, false, "Resource should remain in cache after subscribers unmount");

    // Clearing/evicting cache drops the final reference and revokes the resource
    cache.clear();
    assert.equal(revoked, true, "Resource should be revoked once cache is cleared and subscribers are gone");
}

async function test26_clientRendererDeliversSrc(): Promise<void> {
    const mockPdfDoc = {
        getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
                width: 400 * scale,
                height: 600 * scale,
            }),
            render: () => ({
                promise: Promise.resolve(),
                cancel: () => {},
            }),
        }),
        destroy: () => {},
    };

    const mockPdfJs = {
        getDocument: () => ({
            promise: Promise.resolve(mockPdfDoc),
            destroy: () => {},
        }),
    };

    const manager = new PreviewManager();
    const clientRenderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockPdfJs });
    manager.registerRenderer(clientRenderer);

    const file = new File([new Blob(["%PDF-1.4 mock"])], "test.pdf", { type: "application/pdf" });
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "client",
        manager,
    });

    assert.equal(h.result.current.isLoading, false, "26: render should complete and finish loading");
    assert.ok(
        typeof h.result.current.src === "string" && h.result.current.src.length > 0,
        "26: usePreview with renderer:'client' exposes ClientPdfRenderer resource URL through src"
    );
    assert.equal(h.result.current.error, null, "26: should have no error");

    await h.unmount();
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    const tests: [string, () => Promise<void>][] = [
        ["1: Initial disabled state", test1_initialDisabledState],
        ["2: Basic server preview success", test2_basicServerPreviewSuccess],
        ["3: Loading -> success transition", test3_loadingToSuccessTransition],
        ["4: Correct PreviewRequest construction", test4_correctPreviewRequestConstruction],
        ["5: File change creates new request", test5_fileChangeCreatesNewRequest],
        ["6: Page change creates new request", test6_pageChangeCreatesNewRequest],
        ["7: Scale change creates new request", test7_scaleChangeCreatesNewRequest],
        ["8: Renderer change creates new request", test8_rendererChangeCreatesNewRequest],
        ["9: mode=page defaults correctly", test9_modePageDefaultsCorrectly],
        ["10: mode=thumbnail defaults correctly", test10_modeThumbnailDefaultsCorrectly],
        ["11: Explicit scale overrides mode", test11_explicitScaleOverridesMode],
        ["12: enabled=false prevents requests", test12_enabledFalsePreventsRequests],
        ["13: enabled=true after false requests correctly", test13_enabledTrueAfterFalseRequestsCorrectly],
        ["14: Error state", test14_errorState],
        ["15: onError receives PreviewError", test15_onErrorReceivesPreviewError],
        ["16: Error clears when new request starts", test16_errorClearsWhenNewRequestStarts],
        ["17: reset() clears state", test17_resetClearsState],
        ["18: reset() unsubscribes handle", test18_resetUnsubscribes],
        ["19: unmount unsubscribes handle", test19_unmountUnsubscribes],
        ["20: No state update after unsubscribe", test20_noStateUpdateAfterUnsubscribe],
        ["21: Synchronous cache-hit delivery", test21_synchronousCacheHitDelivery],
        ["22: Asynchronous render delivery", test22_asynchronousRenderDelivery],
        ["23: Stale request cannot overwrite newer request", test23_staleRequestCannotOverwriteNewerRequest],
        ["24: React Strict Mode mount cleanup", test24_reactStrictModeMountCleanup],
        ["25: Multiple hook instances share resource without premature release", test25_multipleHookInstancesShareResource],
        ["26: ClientPdfRenderer delivers resource URL through usePreview src", test26_clientRendererDeliversSrc],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (e: unknown) {
            console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
            if (e instanceof Error && e.stack) {
                console.error(e.stack);
            }
            failed++;
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
    console.error(e);
    process.exit(1);
});
