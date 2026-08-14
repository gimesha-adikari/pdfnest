// pdfnest/tests/unit/usePreviews.test.ts

/**
 * usePreviews — unit tests
 *
 * Tests observable behaviour only:
 *   - results array length and per-slot values (src / isLoading / error)
 *   - how many PreviewManager.request() calls are made (via SpyPreviewManager)
 *   - AbortSignal state for in-flight renders (observable through renderer)
 *   - resource revoke callbacks (observable through mock PreviewResource)
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import assert from "assert";

import { usePreviews, PreviewItemRequest, PreviewItemResult } from "../../lib/preview/usePreviews";
import { PreviewManager } from "../../lib/preview/PreviewManager";
import {
    PreviewRequest,
    PreviewResource,
    PreviewRenderer,
    PreviewError,
    createPreviewKey,
} from "../../lib/preview/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── DOM mock (mirrors usePreview.test.ts setup) ───────────────────────────────

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

const mockDoc: any = new MockElement();
mockDoc.nodeType = 9;
mockDoc.nodeName = "#document";
mockDoc.createElement = (tag: string) => {
    const el = new MockElement();
    el.nodeName = tag.toUpperCase();
    el.tagName = tag.toUpperCase();
    el.ownerDocument = mockDoc;
    return el;
};
mockDoc.createElementNS = (_ns: string, tag: string) => mockDoc.createElement(tag);
mockDoc.createTextNode = (text: string) => {
    const el = new MockElement();
    el.nodeType = 3;
    el.nodeName = "#text";
    (el as any).nodeValue = text;
    el.ownerDocument = mockDoc;
    return el;
};
mockDoc.defaultView = globalThis;
mockDoc.HTMLIFrameElement = class HTMLIFrameElement {};

(globalThis as any).document = mockDoc;
(globalThis as any).window = globalThis;
(globalThis as any).HTMLIFrameElement = mockDoc.HTMLIFrameElement;
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};

// ── renderHook harness ────────────────────────────────────────────────────────

interface HarnessProps {
    requests: PreviewItemRequest[];
    manager: PreviewManager;
}

interface Harness {
    result: { current: PreviewItemResult[] };
    rerender: (requests: PreviewItemRequest[], manager?: PreviewManager) => Promise<void>;
    unmount: () => Promise<void>;
}

async function renderHook(
    initialRequests: PreviewItemRequest[],
    manager: PreviewManager,
): Promise<Harness> {
    const container = mockDoc.createElement("div");
    const root = createRoot(container);
    const result: { current: PreviewItemResult[] } = { current: [] };

    let currentProps: HarnessProps = { requests: initialRequests, manager };

    function Component({ props }: { props: HarnessProps }) {
        result.current = usePreviews(props.requests, { manager: props.manager });
        return null;
    }

    await act(async () => {
        root.render(React.createElement(Component, { props: currentProps }));
    });

    const rerender = async (requests: PreviewItemRequest[], mgr?: PreviewManager) => {
        currentProps = { requests, manager: mgr ?? currentProps.manager };
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(
    name = "test.pdf",
    size = 1000,
    lastModified = 12345,
): File {
    return { name, size, lastModified, type: "application/pdf" } as unknown as File;
}

function makeResource(url: string): PreviewResource {
    let revoked = false;
    return {
        type: "image-url",
        url,
        get _revoked() { return revoked; },
        revoke: () => { revoked = true; },
    } as PreviewResource & { _revoked: boolean };
}

function makeCanvasResource(dataUrl = "data:image/png;base64,mockCanvas"): PreviewResource {
    let revoked = false;
    const canvas = {
        toDataURL: () => dataUrl,
    } as unknown as HTMLCanvasElement;
    return {
        type: "canvas",
        canvas,
        get _revoked() { return revoked; },
        revoke: () => { revoked = true; },
    } as PreviewResource & { _revoked: boolean };
}

/** Compute the same cache key that usePreviews builds internally. */
function makeKey(
    file: File,
    page: number,
    scale = 0.3,
    renderer = "client",
): string {
    const doc = {
        id: `${file.name}:${file.size}:${file.lastModified}:${file.type}`,
        version: String(file.lastModified),
        pageCount: 0,
    };
    return createPreviewKey({
        document: doc as any,
        page,
        scale,
        mode: "thumbnail",
        renderer: renderer as any,
    });
}

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject:  (e: unknown) => void;
};

function makeDeferred<T>(): Deferred<T> {
    let resolve!: (v: T) => void;
    let reject!:  (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/**
 * Multi-key controlled renderer.
 * Each call to render() creates a separate deferred keyed by createPreviewKey.
 * Tests can resolve/reject specific keys or observe whether a key is still pending.
 */
class ControlledRenderer implements PreviewRenderer {
    readonly id = "controlled";
    readonly capabilities = { client: true, server: true };

    renderCount = 0;
    private readonly pending = new Map<string, Deferred<PreviewResource>>();
    readonly abortedKeys: string[] = [];

    canRender(_req: PreviewRequest): boolean { return true; }

    render(req: PreviewRequest, signal: AbortSignal): Promise<PreviewResource> {
        this.renderCount++;
        const key = createPreviewKey(req);
        const d = makeDeferred<PreviewResource>();
        this.pending.set(key, d);
        signal.addEventListener("abort", () => {
            this.abortedKeys.push(key);
            // Reject the deferred with an AbortError so PreviewManager treats it correctly.
            const err = new DOMException("Aborted", "AbortError");
            // Guard: may have already been resolved.
            const entry = this.pending.get(key);
            if (entry === d) {
                this.pending.delete(key);
                d.reject(err);
            }
        });
        return d.promise;
    }

    resolve(key: string, resource: PreviewResource): void {
        const d = this.pending.get(key);
        if (!d) throw new Error(`ControlledRenderer: no pending render for key "${key}"`);
        this.pending.delete(key);
        d.resolve(resource);
    }

    reject(key: string, err: unknown): void {
        const d = this.pending.get(key);
        if (!d) throw new Error(`ControlledRenderer: no pending render for key "${key}"`);
        this.pending.delete(key);
        d.reject(err);
    }

    hasPending(key: string): boolean {
        return this.pending.has(key);
    }

    pendingCount(): number {
        return this.pending.size;
    }
}

/** SpyPreviewManager: counts request() calls, otherwise delegates to super. */
class SpyPreviewManager extends PreviewManager {
    requestCallCount = 0;

    override request(req: PreviewRequest) {
        this.requestCallCount++;
        return super.request(req);
    }
}

function makeManagerWithRenderer(): { manager: SpyPreviewManager; renderer: ControlledRenderer } {
    const renderer = new ControlledRenderer();
    const manager = new SpyPreviewManager();
    manager.registerRenderer(renderer);
    return { manager, renderer };
}

// ── Test suite ────────────────────────────────────────────────────────────────

// test 1 ──────────────────────────────────────────────────────────────────────
async function test01_emptyRequests(): Promise<void> {
    const { manager } = makeManagerWithRenderer();
    const h = await renderHook([], manager);

    assert.deepStrictEqual(h.result.current, [], "empty requests → empty results");
    assert.equal(manager.requestCallCount, 0, "no manager requests issued");
    await h.unmount();
}

// test 2 ──────────────────────────────────────────────────────────────────────
async function test02_oneRequest(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);

    assert.equal(h.result.current.length, 1);
    assert.equal(h.result.current[0].isLoading, true, "loading before render completes");
    assert.equal(h.result.current[0].src, "");
    assert.equal(h.result.current[0].error, null);

    const res = makeResource("blob:one/1");
    await act(async () => { renderer.resolve(key, res); });

    assert.equal(h.result.current[0].src, "blob:one/1");
    assert.equal(h.result.current[0].isLoading, false);
    assert.equal(h.result.current[0].error, null);

    await h.unmount();
}

// test 3 ──────────────────────────────────────────────────────────────────────
async function test03_multiplePages(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile("doc.pdf", 2000, 99999);
    const key1 = makeKey(file, 1);
    const key2 = makeKey(file, 2);
    const key3 = makeKey(file, 3);

    const h = await renderHook(
        [{ file, page: 1 }, { file, page: 2 }, { file, page: 3 }],
        manager,
    );

    assert.equal(h.result.current.length, 3);
    assert.ok(h.result.current.every(r => r.isLoading), "all loading before any resolve");

    await act(async () => { renderer.resolve(key2, makeResource("blob:p2")); });
    assert.equal(h.result.current[0].isLoading, true, "slot 0 still loading");
    assert.equal(h.result.current[1].src, "blob:p2", "slot 1 resolved");
    assert.equal(h.result.current[2].isLoading, true, "slot 2 still loading");

    await act(async () => {
        renderer.resolve(key1, makeResource("blob:p1"));
        renderer.resolve(key3, makeResource("blob:p3"));
    });

    assert.equal(h.result.current[0].src, "blob:p1");
    assert.equal(h.result.current[1].src, "blob:p2");
    assert.equal(h.result.current[2].src, "blob:p3");
    assert.ok(h.result.current.every(r => !r.isLoading), "all loaded");

    await h.unmount();
}

// test 4 ──────────────────────────────────────────────────────────────────────
async function test04_multipleFiles(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const fileA = makeFile("a.pdf", 100, 1);
    const fileB = makeFile("b.pdf", 200, 2);
    const fileC = makeFile("c.pdf", 300, 3);
    const keyA = makeKey(fileA, 1);
    const keyB = makeKey(fileB, 1);
    const keyC = makeKey(fileC, 1);

    const h = await renderHook(
        [{ file: fileA, page: 1 }, { file: fileB, page: 1 }, { file: fileC, page: 1 }],
        manager,
    );

    assert.equal(h.result.current.length, 3);
    assert.ok(h.result.current.every(r => r.isLoading));

    await act(async () => {
        renderer.resolve(keyA, makeResource("blob:a"));
        renderer.resolve(keyB, makeResource("blob:b"));
    });

    await act(async () => {
        renderer.resolve(keyC, makeResource("blob:c"));
    });

    assert.equal(h.result.current[0].src, "blob:a");
    assert.equal(h.result.current[1].src, "blob:b");
    assert.equal(h.result.current[2].src, "blob:c");

    await h.unmount();
}

// test 5 ──────────────────────────────────────────────────────────────────────
async function test05_mixedRequests(): Promise<void> {
    // File A at page 1, file B at page 3 — different files, different pages
    const { manager, renderer } = makeManagerWithRenderer();
    const fileA = makeFile("a.pdf", 10, 1);
    const fileB = makeFile("b.pdf", 20, 2);
    const keyA1 = makeKey(fileA, 1);
    const keyB3 = makeKey(fileB, 3);

    const h = await renderHook(
        [{ file: fileA, page: 1 }, { file: fileB, page: 3 }],
        manager,
    );

    assert.equal(h.result.current.length, 2);

    await act(async () => {
        renderer.resolve(keyA1, makeResource("blob:a1"));
        renderer.resolve(keyB3, makeResource("blob:b3"));
    });

    assert.equal(h.result.current[0].src, "blob:a1");
    assert.equal(h.result.current[1].src, "blob:b3");

    await h.unmount();
}

// test 6 ──────────────────────────────────────────────────────────────────────
async function test06_inlineArrayRecreatedEveryRender(): Promise<void> {
    // An inline requests array (new reference each render) with identical content
    // must not disturb active subscriptions or cause extra manager calls.
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);
    assert.equal(manager.requestCallCount, 1, "initial request");

    // Simulate N re-renders with new array references but same content.
    for (let i = 0; i < 5; i++) {
        await h.rerender([{ file, page: 1 }]); // new array ref each call
    }

    assert.equal(
        manager.requestCallCount,
        1,
        "no new requests despite 5 re-renders with same content",
    );
    assert.equal(h.result.current[0].isLoading, true, "slot still loading (render never resolved)");

    // Resolve and confirm results still arrive correctly.
    await act(async () => { renderer.resolve(key, makeResource("blob:inline")); });
    assert.equal(h.result.current[0].src, "blob:inline");

    await h.unmount();
}

// test 7 ──────────────────────────────────────────────────────────────────────
async function test07_equivalentContentNoResubscribe(): Promise<void> {
    // After a render completes (subscription fulfilled), a re-render with a new
    // array reference but same content must NOT unsubscribe/resubscribe or lose src.
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);
    await act(async () => { renderer.resolve(key, makeResource("blob:eq")); });
    assert.equal(h.result.current[0].src, "blob:eq");

    const countBefore = manager.requestCallCount; // should be 1

    // Re-render with a fresh array object containing the same item.
    await h.rerender([{ file, page: 1 }]); // new object ref, same effective content

    assert.equal(manager.requestCallCount, countBefore, "no new request on equivalent re-render");
    assert.equal(h.result.current[0].src, "blob:eq", "src preserved — handle not unsubscribed");
    assert.equal(h.result.current[0].isLoading, false);

    await h.unmount();
}

// test 8 ──────────────────────────────────────────────────────────────────────
async function test08_changedPageNewRequestOldHandleCleanedUp(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key1 = makeKey(file, 1);
    const key2 = makeKey(file, 2);

    // Initial: page 1 in-flight
    const h = await renderHook([{ file, page: 1 }], manager);
    assert.ok(renderer.hasPending(key1), "page 1 render pending");

    // Change to page 2 — old handle must be unsubscribed
    await h.rerender([{ file, page: 2 }]);

    // Page 1's in-flight render had no other subscribers → AbortSignal fired
    assert.ok(renderer.abortedKeys.includes(key1), "page 1 render aborted after unsubscribe");
    assert.equal(manager.requestCallCount, 2, "page 2 issued a new request");
    assert.ok(renderer.hasPending(key2), "page 2 now pending");
    assert.equal(h.result.current[0].isLoading, true, "waiting for page 2");

    await act(async () => { renderer.resolve(key2, makeResource("blob:p2")); });
    assert.equal(h.result.current[0].src, "blob:p2");

    await h.unmount();
}

// test 9 ──────────────────────────────────────────────────────────────────────
async function test09_changedFileNewRequestOldHandleCleanedUp(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const fileA = makeFile("a.pdf", 10, 1);
    const fileB = makeFile("b.pdf", 20, 2);
    const keyA = makeKey(fileA, 1);
    const keyB = makeKey(fileB, 1);

    const h = await renderHook([{ file: fileA, page: 1 }], manager);
    assert.ok(renderer.hasPending(keyA));

    await h.rerender([{ file: fileB, page: 1 }]);

    assert.ok(renderer.abortedKeys.includes(keyA), "file A render aborted");
    assert.equal(manager.requestCallCount, 2);
    assert.ok(renderer.hasPending(keyB), "file B render pending");

    await act(async () => { renderer.resolve(keyB, makeResource("blob:b")); });
    assert.equal(h.result.current[0].src, "blob:b");

    await h.unmount();
}

// test 10 ─────────────────────────────────────────────────────────────────────
async function test10_removedItemUnsubscribesHandle(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key1 = makeKey(file, 1);
    const key2 = makeKey(file, 2);

    const h = await renderHook([{ file, page: 1 }, { file, page: 2 }], manager);
    assert.ok(renderer.hasPending(key1));
    assert.ok(renderer.hasPending(key2));

    // Remove page 2 — its handle must be unsubscribed
    await h.rerender([{ file, page: 1 }]);

    assert.ok(renderer.abortedKeys.includes(key2), "page 2 handle unsubscribed on removal");
    assert.equal(h.result.current.length, 1, "results array reflects new request count");
    assert.equal(h.result.current[0].isLoading, true, "page 1 still loading");

    await act(async () => { renderer.resolve(key1, makeResource("blob:p1")); });
    assert.equal(h.result.current[0].src, "blob:p1");

    await h.unmount();
}

// test 11 ─────────────────────────────────────────────────────────────────────
async function test11_reorderedRequestsPreserveOrdering(): Promise<void> {
    // After both pages are cached, swap their order → results[i] reflects requests[i].
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key1 = makeKey(file, 1);
    const key2 = makeKey(file, 2);

    const h = await renderHook([{ file, page: 1 }, { file, page: 2 }], manager);

    // Resolve both to populate cache
    await act(async () => {
        renderer.resolve(key1, makeResource("blob:p1"));
        renderer.resolve(key2, makeResource("blob:p2"));
    });
    assert.equal(h.result.current[0].src, "blob:p1");
    assert.equal(h.result.current[1].src, "blob:p2");

    // Reorder: [page2, page1]
    await h.rerender([{ file, page: 2 }, { file, page: 1 }]);

    // Both are cached → synchronous delivery → results swap
    assert.equal(h.result.current[0].src, "blob:p2", "slot 0 now shows page 2");
    assert.equal(h.result.current[1].src, "blob:p1", "slot 1 now shows page 1");
    assert.ok(h.result.current.every(r => !r.isLoading));

    await h.unmount();
}

// test 12 ─────────────────────────────────────────────────────────────────────
async function test12_disabledRequestMakesNoManagerRequest(): Promise<void> {
    const { manager } = makeManagerWithRenderer();
    const file = makeFile();

    const h = await renderHook(
        [
            { file, page: 1, enabled: false },
            { file: null, page: 2 },
        ],
        manager,
    );

    assert.equal(manager.requestCallCount, 0, "no requests for disabled slots");
    assert.equal(h.result.current.length, 2);
    assert.equal(h.result.current[0].isLoading, false, "disabled slot immediately non-loading");
    assert.equal(h.result.current[0].src, "");
    assert.equal(h.result.current[0].error, null);
    assert.equal(h.result.current[1].isLoading, false, "null-file slot immediately non-loading");

    await h.unmount();
}

// test 13 ─────────────────────────────────────────────────────────────────────
async function test13_perItemLoadingState(): Promise<void> {
    // Three slots; resolve them in sequence — each independently transitions.
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const k1 = makeKey(file, 1);
    const k2 = makeKey(file, 2);
    const k3 = makeKey(file, 3);

    const h = await renderHook(
        [{ file, page: 1 }, { file, page: 2 }, { file, page: 3 }],
        manager,
    );

    // All loading
    assert.ok(h.result.current[0].isLoading);
    assert.ok(h.result.current[1].isLoading);
    assert.ok(h.result.current[2].isLoading);

    await act(async () => { renderer.resolve(k1, makeResource("b:1")); });
    assert.equal(h.result.current[0].isLoading, false);
    assert.ok(h.result.current[1].isLoading);
    assert.ok(h.result.current[2].isLoading);

    await act(async () => { renderer.resolve(k3, makeResource("b:3")); });
    assert.equal(h.result.current[0].isLoading, false);
    assert.ok(h.result.current[1].isLoading);
    assert.equal(h.result.current[2].isLoading, false);

    await act(async () => { renderer.resolve(k2, makeResource("b:2")); });
    assert.ok(h.result.current.every(r => !r.isLoading));

    await h.unmount();
}

// test 14 ─────────────────────────────────────────────────────────────────────
async function test14_perItemSuccess(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const k1 = makeKey(file, 1);
    const k2 = makeKey(file, 2);

    const h = await renderHook([{ file, page: 1 }, { file, page: 2 }], manager);

    await act(async () => {
        renderer.resolve(k1, makeResource("blob:ok1"));
        renderer.resolve(k2, makeResource("blob:ok2"));
    });

    assert.equal(h.result.current[0].src, "blob:ok1");
    assert.equal(h.result.current[0].isLoading, false);
    assert.equal(h.result.current[0].error, null);

    assert.equal(h.result.current[1].src, "blob:ok2");
    assert.equal(h.result.current[1].isLoading, false);
    assert.equal(h.result.current[1].error, null);

    await h.unmount();
}

// test 15 ─────────────────────────────────────────────────────────────────────
async function test15_perItemError(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);

    const renderErr = { code: "RENDER_FAIL", message: "canvas error" };
    await act(async () => { renderer.reject(key, renderErr); });

    assert.equal(h.result.current[0].src, "");
    assert.equal(h.result.current[0].isLoading, false);
    assert.ok(h.result.current[0].error !== null, "error is set");
    // Observable: error message should surface
    assert.ok(
        (h.result.current[0].error!.message as string).length > 0,
        "error has a message",
    );

    await h.unmount();
}

// test 16 ─────────────────────────────────────────────────────────────────────
async function test16_oneItemFailDoesNotAffectOthers(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const k1 = makeKey(file, 1);
    const k2 = makeKey(file, 2);

    const h = await renderHook([{ file, page: 1 }, { file, page: 2 }], manager);

    // Fail slot 0, succeed slot 1
    await act(async () => {
        renderer.reject(k1, { code: "FAIL", message: "slot 0 failed" });
        renderer.resolve(k2, makeResource("blob:ok2"));
    });

    assert.equal(h.result.current[0].src, "", "failed slot has no src");
    assert.ok(h.result.current[0].error !== null, "failed slot has error");
    assert.equal(h.result.current[0].isLoading, false);

    assert.equal(h.result.current[1].src, "blob:ok2", "succeeded slot unaffected");
    assert.equal(h.result.current[1].error, null);
    assert.equal(h.result.current[1].isLoading, false);

    await h.unmount();
}

// test 17 ─────────────────────────────────────────────────────────────────────
async function test17_unmountUnsubscribesAllActiveHandles(): Promise<void> {
    // Observable: after unmount, all in-flight renders for which we were the
    // last subscriber have their AbortSignal aborted by PreviewManager.
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile();
    const k1 = makeKey(file, 1);
    const k2 = makeKey(file, 2);

    const h = await renderHook([{ file, page: 1 }, { file, page: 2 }], manager);
    assert.ok(renderer.hasPending(k1));
    assert.ok(renderer.hasPending(k2));

    await h.unmount();

    // Both in-flight renders had only this hook as their subscriber.
    // After unsubscribe, PreviewManager called controller.abort().
    assert.ok(renderer.abortedKeys.includes(k1), "slot 0 handle unsubscribed on unmount");
    assert.ok(renderer.abortedKeys.includes(k2), "slot 1 handle unsubscribed on unmount");
}

// test 18 ─────────────────────────────────────────────────────────────────────
async function test18_managerReplacementCleansUpOldSubscriptions(): Promise<void> {
    const rendererA = new ControlledRenderer();
    const managerA = new SpyPreviewManager();
    managerA.registerRenderer(rendererA);

    const rendererB = new ControlledRenderer();
    const managerB = new SpyPreviewManager();
    managerB.registerRenderer(rendererB);

    const file = makeFile();
    const key = makeKey(file, 1);

    // Start with manager A
    const h = await renderHook([{ file, page: 1 }], managerA);
    assert.equal(managerA.requestCallCount, 1);
    assert.ok(rendererA.hasPending(key), "manager A has in-flight render");

    // Replace with manager B — same request, different manager
    await h.rerender([{ file, page: 1 }], managerB);

    // Manager A's subscription should be gone (handle unsubscribed = in-flight aborted)
    assert.ok(rendererA.abortedKeys.includes(key), "manager A render aborted on replacement");

    // Manager B should now have its own in-flight render
    assert.equal(managerB.requestCallCount, 1, "manager B issued a new request");
    assert.ok(rendererB.hasPending(key), "manager B has in-flight render");

    await act(async () => { rendererB.resolve(key, makeResource("blob:b")); });
    assert.equal(h.result.current[0].src, "blob:b", "result from manager B");

    await h.unmount();
}

// test 19 ─────────────────────────────────────────────────────────────────────
async function test19_cacheHitResourcesRetainedAndReleased(): Promise<void> {
    // First render populates cache. A second hook instance obtains the cached
    // resource without triggering a new renderer.render() call. After both
    // unmount, the resource should eventually be released (revoke called).
    const renderer = new ControlledRenderer();
    const manager = new SpyPreviewManager();
    manager.registerRenderer(renderer);

    const file = makeFile("cached.pdf", 500, 55555);
    const key = makeKey(file, 1);
    const resource = makeResource("blob:cached");
    const spyResource = resource as PreviewResource & { _revoked: boolean };

    // First instance
    const h1 = await renderHook([{ file, page: 1 }], manager);
    assert.ok(renderer.hasPending(key));
    await act(async () => { renderer.resolve(key, spyResource); });
    assert.equal(h1.result.current[0].src, "blob:cached");
    assert.equal(renderer.renderCount, 1);

    // Second instance — same request, should be a cache hit (no new render call)
    const h2 = await renderHook([{ file, page: 1 }], manager);
    assert.equal(renderer.renderCount, 1, "no new render for cache-hit request");
    assert.equal(h2.result.current[0].src, "blob:cached", "cache-hit delivers same src");

    // Both unmount; after both release their references the resource can be revoked.
    await h1.unmount();
    await h2.unmount();

    // The PreviewCache still holds one reference (from cache.set) — the resource
    // is not revoked until evicted from the LRU. That is correct PreviewManager
    // ownership behaviour. What we verify here is that the src was served correctly.
    // Revocation on eviction is covered by PreviewCache/PreviewManager tests.
    assert.equal(spyResource._revoked, false, "resource not prematurely revoked");
}

// test 20 ─────────────────────────────────────────────────────────────────────
async function test20_duplicateIdenticalRequestsShareCacheBehaviour(): Promise<void> {
    // Two slots with the same (file, page, scale, renderer) in one requests array.
    // PreviewManager deduplicates in-flight renders → renderer.renderCount stays 1.
    // Both slots receive the same src.
    const renderer = new ControlledRenderer();
    const manager = new SpyPreviewManager();
    manager.registerRenderer(renderer);

    const file = makeFile("dup.pdf", 1000, 11111);
    const key = makeKey(file, 1);
    const req: PreviewItemRequest = { file, page: 1, scale: 0.3, renderer: "client" };

    const h = await renderHook([req, req], manager);

    // PreviewManager deduplicates: only one render triggered
    assert.equal(renderer.renderCount, 1, "only one render for duplicate requests");
    assert.equal(manager.requestCallCount, 2, "two handle requests issued");

    await act(async () => { renderer.resolve(key, makeResource("blob:dup")); });

    assert.equal(h.result.current[0].src, "blob:dup", "slot 0 gets the shared src");
    assert.equal(h.result.current[1].src, "blob:dup", "slot 1 gets the shared src");
    assert.ok(h.result.current.every(r => !r.isLoading));

    await h.unmount();
}

// test 21 ─────────────────────────────────────────────────────────────────────
async function test21_successfulCanvasPreviewResource(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile("canvas.pdf", 1000, 100);
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);
    const canvasRes = makeCanvasResource("data:image/png;base64,canvasData123");

    await act(async () => { renderer.resolve(key, canvasRes); });

    assert.equal(h.result.current[0].src, "data:image/png;base64,canvasData123");
    assert.equal(h.result.current[0].isLoading, false);
    assert.equal(h.result.current[0].error, null);

    await h.unmount();
}

// test 22 ─────────────────────────────────────────────────────────────────────
async function test22_successfulImageUrlPreviewResource(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile("img.pdf", 1000, 100);
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);
    const imgRes = makeResource("blob:http://localhost/test-blob-123");

    await act(async () => { renderer.resolve(key, imgRes); });

    assert.equal(h.result.current[0].src, "blob:http://localhost/test-blob-123");
    assert.equal(h.result.current[0].isLoading, false);
    assert.equal(h.result.current[0].error, null);

    await h.unmount();
}

// test 23 ─────────────────────────────────────────────────────────────────────
async function test23_failedResultEmptySrcAndPreviewError(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile("fail.pdf", 1000, 100);
    const key = makeKey(file, 1);

    const h = await renderHook([{ file, page: 1 }], manager);

    const err = { code: "SERVER_ERROR", message: "Server PyMuPDF failed to render page" };
    await act(async () => { renderer.reject(key, err); });

    assert.equal(h.result.current[0].src, "");
    assert.equal(h.result.current[0].isLoading, false);
    assert.notEqual(h.result.current[0].error, null);
    assert.equal(h.result.current[0].error?.code, "SERVER_ERROR");
    assert.equal(h.result.current[0].error?.message, "Server PyMuPDF failed to render page");

    await h.unmount();
}

// test 24 ─────────────────────────────────────────────────────────────────────
async function test24_resourceLifecycleOwnedByPreviewManager(): Promise<void> {
    const { manager, renderer } = makeManagerWithRenderer();
    const file = makeFile("lifecycle.pdf", 1000, 100);
    const key = makeKey(file, 1);

    const res = makeResource("blob:lifecycle-url");
    const spyRes = res as PreviewResource & { _revoked: boolean };

    const h = await renderHook([{ file, page: 1 }], manager);
    await act(async () => { renderer.resolve(key, spyRes); });

    assert.equal(h.result.current[0].src, "blob:lifecycle-url");
    assert.equal(spyRes._revoked, false, "usePreviews must not call revoke on deliver");

    // Unmounting the hook unsubscribes handle.
    await h.unmount();

    // usePreviews itself must not directly call revoke(). Revocation lifecycle is managed by PreviewCache/Manager.
    assert.equal(spyRes._revoked, false, "usePreviews must not manually invoke resource.revoke()");
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ["test01 — empty requests",                               test01_emptyRequests],
        ["test02 — one request",                                  test02_oneRequest],
        ["test03 — multiple pages",                               test03_multiplePages],
        ["test04 — multiple files",                               test04_multipleFiles],
        ["test05 — mixed requests",                               test05_mixedRequests],
        ["test06 — inline array recreated every render",          test06_inlineArrayRecreatedEveryRender],
        ["test07 — equivalent content does not resubscribe",      test07_equivalentContentNoResubscribe],
        ["test08 — changed page → new request, old aborted",      test08_changedPageNewRequestOldHandleCleanedUp],
        ["test09 — changed file → new request, old aborted",      test09_changedFileNewRequestOldHandleCleanedUp],
        ["test10 — removed item unsubscribes handle",             test10_removedItemUnsubscribesHandle],
        ["test11 — reordered requests preserve ordering",         test11_reorderedRequestsPreserveOrdering],
        ["test12 — disabled request makes no manager request",    test12_disabledRequestMakesNoManagerRequest],
        ["test13 — per-item loading state",                       test13_perItemLoadingState],
        ["test14 — per-item success",                             test14_perItemSuccess],
        ["test15 — per-item error",                               test15_perItemError],
        ["test16 — one item failing does not affect others",      test16_oneItemFailDoesNotAffectOthers],
        ["test17 — unmount unsubscribes all active handles",      test17_unmountUnsubscribesAllActiveHandles],
        ["test18 — manager replacement cleans up old manager",    test18_managerReplacementCleansUpOldSubscriptions],
        ["test19 — cache-hit resources retained/released",        test19_cacheHitResourcesRetainedAndReleased],
        ["test20 — duplicate identical requests share behaviour", test20_duplicateIdenticalRequestsShareCacheBehaviour],
        ["test21 — successful canvas PreviewResource",            test21_successfulCanvasPreviewResource],
        ["test22 — successful image-url PreviewResource",         test22_successfulImageUrlPreviewResource],
        ["test23 — failed result empty src + PreviewError",       test23_failedResultEmptySrcAndPreviewError],
        ["test24 — resource lifecycle owned by PreviewManager",   test24_resourceLifecycleOwnedByPreviewManager],
    ];

    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err: unknown) {
            console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.stack) {
                console.error(err.stack);
            }
            failed++;
        }
    }

    console.log(`\nusePreviews: ${passed}/${passed + failed} tests passed`);
    if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
    console.error(e);
    process.exit(1);
});

