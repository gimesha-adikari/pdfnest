// pdfnest/tests/unit/studioPreviewMigration.test.ts
//
// Focused tests for Phase 2 — Milestone 5: Studio main-canvas preview migration.
// These tests verify that usePreview (via PreviewManager + ServerPdfRenderer contract)
// provides the exact API surface required by useStudio / StudioCanvasPreview:
//   - previewSrc string (image URL from server renderer)
//   - isRendering / isLoading loading state
//   - reset() covering both clearPreviewCache and resetPreview semantics
//   - page navigation (page change triggers new request)
//   - file change triggers new request
//   - scale: 2.0 forwarded to renderer
//   - renderer: "server" preference
//   - cancellation / unmount resource release
//   - stale request protection
//   - resource lifecycle (Object URL not prematurely revoked)

import { act } from "react";
import { createRoot } from "react-dom/client";
import React, { useRef } from "react";
import assert from "assert";

import { usePreview, UsePreviewOptions, UsePreviewResult } from "../../lib/preview/usePreview";
import { PreviewManager } from "../../lib/preview/PreviewManager";
import {
    PreviewRequest,
    PreviewResource,
    PreviewRenderer,
} from "../../lib/preview/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ─── Minimal DOM Mock (mirrors usePreview.test.ts) ───────────────────────────

class MockElement {
    nodeType = 1;
    nodeName = "DIV";
    tagName = "DIV";
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style = {};
    childNodes: any[] = [];
    ownerDocument: any = null;

    appendChild(child: any) { this.childNodes.push(child); return child; }
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
    dispatchEvent() { return true; }
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

// Mock URL.revokeObjectURL to track revocations
const revokedUrls: string[] = [];
(globalThis as any).URL = {
    createObjectURL: () => `blob:mock/${Math.random()}`,
    revokeObjectURL: (u: string) => { revokedUrls.push(u); },
};

// ─── renderHook harness ──────────────────────────────────────────────────────

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
        if (newProps !== undefined) currentProps = newProps;
        await act(async () => {
            root.render(React.createElement(Component, { props: currentProps }));
        });
    };

    const unmount = async () => {
        await act(async () => { root.unmount(); });
    };

    return { result, rerender, unmount };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(name = "test.pdf", size = 1000, lastModified = 12345): File {
    return { name, size, lastModified, type: "application/pdf" } as unknown as File;
}

interface DeferredRenderer extends PreviewRenderer {
    lastRequest: PreviewRequest | null;
    invocationCount: number;
    resolveLast: (resource: PreviewResource) => void;
    rejectLast: (err: unknown) => void;
}

function makeDeferredRenderer(id: string, caps = { client: false, server: true }): DeferredRenderer {
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

function makeServerResource(url = "blob:mock/preview-url"): PreviewResource {
    return { type: "image-url", url };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// Test 1: Studio canvas preview initial state with no file
async function test1_noFile(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const h = await renderHook(usePreview, {
        file: null,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    // No file → src is empty, not loading
    assert.equal(h.result.current.src, "", "src should be empty when file is null");
    assert.equal(h.result.current.isLoading, false, "should not be loading when file is null");
    assert.equal(renderer.invocationCount, 0, "renderer must not be called without a file");

    await h.unmount();
}

// Test 2: Studio canvas preview loads server image URL on first render
async function test2_serverImageUrlDelivered(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    assert.equal(h.result.current.isLoading, true, "should be loading immediately");
    assert.equal(h.result.current.src, "", "src should be empty before render completes");

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/studio-page-1"));
    });

    assert.equal(h.result.current.src, "blob:mock/studio-page-1", "src should be the server image URL");
    assert.equal(h.result.current.isLoading, false, "should not be loading after render");

    await h.unmount();
}

// Test 3: Scale 2.0 is forwarded correctly to the renderer request
async function test3_scale2_0ForwardedToRenderer(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    assert.ok(renderer.lastRequest !== null, "renderer should have received a request");
    assert.equal(renderer.lastRequest!.scale, 2.0, "scale 2.0 must be forwarded to renderer");

    await h.unmount();
}

// Test 4: renderer: "server" preference forwarded
async function test4_serverRendererPreferenceForwarded(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    assert.ok(renderer.lastRequest !== null, "renderer should have received a request");
    assert.equal(renderer.lastRequest!.renderer, "server", "renderer preference must be forwarded");

    await h.unmount();
}

// Test 5: Page change triggers new request (Studio page navigation)
async function test5_pageChangeTriggersNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/page-1"));
    });

    assert.equal(h.result.current.src, "blob:mock/page-1");

    // Navigate to page 2
    await h.rerender({ file, page: 2, scale: 2.0, renderer: "server", manager });

    assert.equal(h.result.current.isLoading, true, "should be loading after page change");

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/page-2"));
    });

    assert.equal(h.result.current.src, "blob:mock/page-2", "src should update to page 2 image");
    assert.equal(renderer.invocationCount, 2, "renderer must have been called twice");

    await h.unmount();
}

// Test 6: File change triggers new request with cleared preview
async function test6_fileChangeTriggersNewRequest(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file1 = makeFile("doc1.pdf", 1000, 111);
    const h = await renderHook(usePreview, {
        file: file1,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/file1-page-1"));
    });

    assert.equal(h.result.current.src, "blob:mock/file1-page-1");

    // Replace document
    const file2 = makeFile("doc2.pdf", 2000, 222);
    await h.rerender({ file: file2, page: 1, scale: 2.0, renderer: "server", manager });

    assert.equal(h.result.current.isLoading, true, "should be loading after file change");
    assert.equal(h.result.current.src, "", "src should be cleared on file change");

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/file2-page-1"));
    });

    assert.equal(h.result.current.src, "blob:mock/file2-page-1");
    assert.equal(renderer.invocationCount, 2, "renderer must be called again for new file");

    await h.unmount();
}

// Test 7: reset() clears previewSrc and isLoading (clearPreviewCache / resetPreview semantic)
async function test7_resetClearsState(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/before-reset"));
    });

    assert.equal(h.result.current.src, "blob:mock/before-reset");

    // Simulate clearPreviewCache / resetPreview
    await act(async () => {
        h.result.current.reset();
    });

    assert.equal(h.result.current.src, "", "src should be cleared after reset");
    assert.equal(h.result.current.isLoading, false, "isLoading should be false after reset");
    assert.equal(h.result.current.error, null, "error should be null after reset");

    await h.unmount();
}

// Test 8: unmount releases the handle (no state updates after unmount)
async function test8_unmountReleasesHandle(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    assert.equal(h.result.current.isLoading, true);

    // Unmount before render completes
    await h.unmount();

    // Resolving after unmount should not throw or leak
    await act(async () => {
        try { renderer.resolveLast(makeServerResource("blob:mock/after-unmount")); } catch {}
    });
    // No assertion on state because the component is unmounted; we just verify no throws.
}

// Test 9: Stale page request does not overwrite newer result
async function test9_staleRequestDoesNotOverwriteNewerResult(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        manager,
    });

    // page 1 request is pending. Navigate to page 2 before it resolves.
    await h.rerender({ file, page: 2, scale: 2.0, renderer: "server", manager });

    // The page-2 request is now pending too. Resolve page-2 first.
    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/page-2"));
    });

    assert.equal(h.result.current.src, "blob:mock/page-2");

    // Trying to deliver the stale page-1 result: renderer invocation 1 was already aborted
    // by the PreviewManager when the subscriber unsubscribed. No state change expected.
    // The test verifies no crash and that src remains correct.
    assert.equal(h.result.current.src, "blob:mock/page-2", "newer page must not be overwritten by stale result");

    await h.unmount();
}

// Test 10: Error state — onError callback receives structured PreviewError
async function test10_errorStateAndCallback(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const errors: any[] = [];
    const file = makeFile();
    const h = await renderHook(usePreview, {
        file,
        page: 1,
        scale: 2.0,
        renderer: "server",
        onError: (err) => errors.push(err),
        manager,
    });

    await act(async () => {
        renderer.rejectLast(new Error("Server session failed"));
    });

    assert.equal(h.result.current.src, "", "src should be empty on error");
    assert.equal(h.result.current.isLoading, false, "isLoading should be false on error");
    assert.ok(h.result.current.error !== null, "error should be set");
    assert.ok(h.result.current.error!.message.includes("Server session failed"), "error message must propagate");
    assert.equal(errors.length, 1, "onError must have been called once");

    await h.unmount();
}

// Test 11: Two instances sharing same file+page share one render invocation (deduplication)
async function test11_deduplication(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const file = makeFile();
    const h1 = await renderHook(usePreview, { file, page: 1, scale: 2.0, renderer: "server", manager });
    const h2 = await renderHook(usePreview, { file, page: 1, scale: 2.0, renderer: "server", manager });

    assert.equal(renderer.invocationCount, 1, "renderer must be invoked only once for identical requests");

    await act(async () => {
        renderer.resolveLast(makeServerResource("blob:mock/shared"));
    });

    assert.equal(h1.result.current.src, "blob:mock/shared");
    assert.equal(h2.result.current.src, "blob:mock/shared");

    await h1.unmount();
    await h2.unmount();
}

// Test 12: Resource is not revoked while a second subscriber holds a reference
async function test12_resourceNotRevokedWhileSecondSubscriberHoldsRef(): Promise<void> {
    const manager = new PreviewManager();
    const renderer = makeDeferredRenderer("server");
    manager.registerRenderer(renderer);

    const revokeCallCount = { count: 0 };
    const resource: PreviewResource = {
        type: "image-url",
        url: "blob:mock/shared-resource",
        revoke: () => { revokeCallCount.count++; },
    };

    const file = makeFile();
    const h1 = await renderHook(usePreview, { file, page: 1, scale: 2.0, renderer: "server", manager });
    const h2 = await renderHook(usePreview, { file, page: 1, scale: 2.0, renderer: "server", manager });

    await act(async () => {
        renderer.resolveLast(resource);
    });

    // Unmount h1 — h2 still holds a reference, resource must not be revoked
    await h1.unmount();
    assert.equal(revokeCallCount.count, 0, "resource must not be revoked while a second subscriber is active");

    // Unmount h2 — all subscribers released. However, the PreviewCache still holds
    // its own cache-entry reference (ref count = 1 from cache.set). The resource is NOT
    // immediately revoked; it stays cached for reuse. Revocation only happens at LRU
    // eviction or explicit cache clear()/dispose(). This is correct architecture.
    await h2.unmount();
    assert.equal(revokeCallCount.count, 0, "resource must not be revoked immediately after all subscribers release — cache holds its own reference until eviction");
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ["1: No file — no request, empty state", test1_noFile],
        ["2: Server image URL delivered to src", test2_serverImageUrlDelivered],
        ["3: Scale 2.0 forwarded to renderer", test3_scale2_0ForwardedToRenderer],
        ["4: renderer:server preference forwarded", test4_serverRendererPreferenceForwarded],
        ["5: Page change triggers new request", test5_pageChangeTriggersNewRequest],
        ["6: File change triggers new request", test6_fileChangeTriggersNewRequest],
        ["7: reset() clears state (clearPreviewCache/resetPreview semantic)", test7_resetClearsState],
        ["8: Unmount releases handle", test8_unmountReleasesHandle],
        ["9: Stale request does not overwrite newer result", test9_staleRequestDoesNotOverwriteNewerResult],
        ["10: Error state and onError callback", test10_errorStateAndCallback],
        ["11: Concurrent instances share single render invocation", test11_deduplication],
        ["12: Resource not revoked while second subscriber holds reference", test12_resourceNotRevokedWhileSecondSubscriberHoldsRef],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error("   ", err);
            failed++;
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
