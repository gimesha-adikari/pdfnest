// pdfnest/tests/unit/previewManager.test.ts

import { PreviewManager } from "../../lib/preview/PreviewManager";
import { PreviewCache } from "../../lib/preview/PreviewCache";
import {
    PreviewRequest,
    PreviewResource,
    PreviewResult,
    PreviewRenderer,
    createPreviewKey,
} from "../../lib/preview/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeRequest(
    docId: string,
    version: string,
    page: number,
    rendererPref?: "auto" | "client" | "server"
): PreviewRequest {
    return {
        document: { id: docId, version, pageCount: 10 },
        page,
        renderer: rendererPref,
    };
}

interface FakeRenderer extends PreviewRenderer {
    invocationCount: number;
    lastSignal: AbortSignal | null;
    resolveAll: () => void;
    rejectAll: (err: unknown) => void;
}

function makeFakeRenderer(
    id: string,
    canRenderResult = true,
    caps: { client: boolean; server: boolean } = { client: true, server: false }
): FakeRenderer {
    let pendingResolvers: Array<(r: PreviewResource) => void> = [];
    let pendingRejecters: Array<(e: unknown) => void> = [];
    let invocationCount = 0;
    let lastSignal: AbortSignal | null = null;

    const renderer: FakeRenderer = {
        id,
        capabilities: caps,
        invocationCount: 0,
        lastSignal: null,
        canRender: () => canRenderResult,
        render: (_req: PreviewRequest, signal: AbortSignal): Promise<PreviewResource> => {
            invocationCount++;
            renderer.invocationCount = invocationCount;
            lastSignal = signal;
            renderer.lastSignal = signal;
            return new Promise<PreviewResource>((resolve, reject) => {
                pendingResolvers.push(resolve);
                pendingRejecters.push(reject);
                signal.addEventListener("abort", () => {
                    const err = new Error("AbortError");
                    (err as any).name = "AbortError";
                    reject(err);
                });
            });
        },
        resolveAll: () => {
            const res: PreviewResource = { type: "image-url", url: "blob:" + id };
            pendingResolvers.forEach(fn => fn(res));
            pendingResolvers = [];
            pendingRejecters = [];
        },
        rejectAll: (err: unknown) => {
            pendingRejecters.forEach(fn => fn(err));
            pendingResolvers = [];
            pendingRejecters = [];
        },
    };
    return renderer;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition: boolean, msg: string): void {
    if (!condition) throw new Error(`FAIL: ${msg}`);
}

// ─── tests ───────────────────────────────────────────────────────────────────

async function testA_cacheHitNoSubscribe(): Promise<void> {
    // A. Cache hit + no subscribe → no manager retention
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 1);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:a" };
    cache.set(key, res);

    const handle = manager.request(req);
    // deliberately no subscribe
    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(refs.size === 0, "A: no retain when no subscriber");
    handle.unsubscribe(); // safe to call even without subscribe
    assert(refs.size === 0, "A: still no retain after unsubscribe without subscribe");
}

async function testB_cacheHitSubscribe(): Promise<void> {
    // B. Cache hit + subscribe → exactly one retain
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 2);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:b" };
    cache.set(key, res);

    let received: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { received = r; });

    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(refs.get(res) === 1, "B: exactly one retain after subscribe");
    assert(received !== undefined && received.isSuccess, "B: result delivered synchronously");
    assert(received!.resource === res, "B: correct resource delivered");
}

async function testC_cacheHitUnsubscribe(): Promise<void> {
    // C. Cache hit + unsubscribe → exactly one release
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 3);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:c" };
    cache.set(key, res);

    const handle = manager.request(req);
    handle.subscribe(() => {});
    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(refs.get(res) === 1, "C: retained before unsubscribe");
    handle.unsubscribe();
    assert(!refs.has(res), "C: entry removed from map after release");
    assert(cache.get(key) !== undefined, "C: cache still owns resource after subscriber release");
}

async function testD_cacheHitUnsubscribeBeforeSubscribe(): Promise<void> {
    // D. Cache hit + unsubscribe before subscribe → zero callback, zero retain
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 4);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:d" };
    cache.set(key, res);

    const handle = manager.request(req);
    handle.unsubscribe(); // unsubscribe before any subscribe

    let called = false;
    handle.subscribe(() => { called = true; });
    assert(!called, "D: callback not delivered after unsubscribe-before-subscribe");
    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(!refs.has(res), "D: no retain occurred");
}

async function testE_subscribeTwice(): Promise<void> {
    // E. subscribe twice → second subscription ignored
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 5);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:e" };
    cache.set(key, res);

    let count1 = 0;
    let count2 = 0;
    const handle = manager.request(req);
    handle.subscribe(() => { count1++; });
    handle.subscribe(() => { count2++; }); // second call ignored

    assert(count1 === 1, "E: first subscriber received result");
    assert(count2 === 0, "E: second subscriber ignored");
}

async function testF_unsubscribeTwice(): Promise<void> {
    // F. unsubscribe twice → one release
    const cache = new PreviewCache();
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 6);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:f" };
    cache.set(key, res);

    const handle = manager.request(req);
    handle.subscribe(() => {});
    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(refs.get(res) === 1, "F: retained");
    handle.unsubscribe();
    assert(!refs.has(res), "F: released after first unsubscribe");
    handle.unsubscribe(); // idempotent
    assert(!refs.has(res), "F: no double-release after second unsubscribe");
}

async function testG_noCallbackAfterUnsubscribe(): Promise<void> {
    // G. callback never occurs after unsubscribe
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("g");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 7);

    let called = false;
    const handle = manager.request(req);
    handle.subscribe(() => { called = true; });
    handle.unsubscribe();
    renderer.resolveAll();
    await sleep(10);
    assert(!called, "G: no callback after unsubscribe");
}

async function testH_clearCancelsAndManagerReusable(): Promise<void> {
    // H. clear() with active render → subscriber notified of cancellation, manager remains usable
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("h");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 8);

    let result: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { result = r; });
    manager.clear();
    assert(result !== undefined && result.isError, "H: subscriber notified of cancellation");
    assert(result!.error?.code === "CANCELLED", "H: error code is CANCELLED");

    const inflight = (manager as any).inflight as Map<any, any>;
    assert(inflight.size === 0, "H: inflight cleared");

    // manager still usable after clear — unregister old renderer, register fresh one
    manager.unregisterRenderer("h");
    const renderer2 = makeFakeRenderer("h2");
    manager.registerRenderer(renderer2);
    const req2 = makeRequest("d2", "v", 1);
    let result2: PreviewResult | undefined;
    const handle2 = manager.request(req2);
    handle2.subscribe(r => { result2 = r; });
    renderer2.resolveAll();
    await sleep(10);
    assert(result2 !== undefined && result2.isSuccess, "H: manager reusable after clear");
    handle2.unsubscribe();
}

async function testI_disposeWithActiveSubscriber(): Promise<void> {
    // I. dispose() with active subscriber → manager ownership released, handle safe
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("i");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 9);

    const handle = manager.request(req);
    handle.subscribe(() => {});
    manager.dispose();

    const refs = (manager as any).managerRetainedRefs as Map<PreviewResource, number>;
    assert(refs.size === 0, "I: all retained refs released on dispose");
    // further request must throw
    let threw = false;
    try { manager.request(req); } catch { threw = true; }
    assert(threw, "I: request() throws after dispose");
    // unsubscribe safe
    handle.unsubscribe(); // must not throw
}

async function testJ_rendererSyncThrow(): Promise<void> {
    // J. renderer synchronous throw → PreviewError, no uncaught exception
    const manager = new PreviewManager();
    const throwingRenderer: PreviewRenderer = {
        id: "j",
        capabilities: { client: true, server: false },
        canRender: () => true,
        render: () => { throw new Error("sync boom"); },
    };
    manager.registerRenderer(throwingRenderer);
    const req = makeRequest("d", "v", 10);

    let result: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { result = r; });
    assert(result !== undefined && result.isError, "J: sync throw produces error result");
    assert(result!.error?.message === "sync boom", "J: error message preserved");
}

async function testK_rendererRejectedPromise(): Promise<void> {
    // K. renderer rejected Promise → PreviewError, no cache entry
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("k");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 11);

    let result: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { result = r; });
    renderer.rejectAll(new Error("async boom"));
    await sleep(10);
    assert(result !== undefined && result.isError, "K: rejected promise produces error");
    assert(manager.getCached(req) === undefined, "K: no cache entry after failure");
}

async function testL_numericErrorCode(): Promise<void> {
    // L. numeric renderer error code → PreviewError.code is string
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("l");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 12);

    let result: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { result = r; });
    const errWithNumericCode = Object.assign(new Error("num err"), { code: 404 });
    renderer.rejectAll(errWithNumericCode);
    await sleep(10);
    assert(result !== undefined && result.isError, "L: error delivered");
    assert(typeof result!.error?.code === "string", "L: error code is string");
    assert(result!.error?.code === "404", "L: numeric code stringified");
}

async function testM_errorStatusPreserved(): Promise<void> {
    // M. renderer error with status → PreviewError.status preserved
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("m");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 125);

    let result: PreviewResult | undefined;
    const handle = manager.request(req);
    handle.subscribe(r => { result = r; });
    const errWithStatus = Object.assign(new Error("s err"), { code: "HTTP_ERR", status: 503 });
    renderer.rejectAll(errWithStatus);
    await sleep(10);
    assert(result !== undefined && result.isError, "M: error delivered");
    assert(result!.error?.code === "HTTP_ERR", "M: code preserved");
    assert(result!.error?.message === "s err", "M: message preserved");
    assert(result!.error?.status === 503, "M: status preserved");
}

async function testNoSecondCallbackOnClearOrDispose(): Promise<void> {
    // clear()/dispose() cannot cause a second callback
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("n2cb");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 126);

    let count = 0;
    const handle = manager.request(req);
    handle.subscribe(() => { count++; });

    manager.clear();
    assert(count === 1, "Terminal callback fired once on clear()");

    // Subsequent subscribe or late resolve must not trigger a second callback
    handle.subscribe(() => { count++; });
    renderer.resolveAll();
    await sleep(10);
    assert(count === 1, "No second callback after clear()");
}

async function testN_deduplication(): Promise<void> {
    // N. identical concurrent requests → exactly one renderer invocation
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("n");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 13);

    const h1 = manager.request(req);
    const h2 = manager.request(req);
    const h3 = manager.request(req);
    let c1 = 0, c2 = 0, c3 = 0;
    h1.subscribe(() => { c1++; });
    h2.subscribe(() => { c2++; });
    h3.subscribe(() => { c3++; });

    assert(renderer.invocationCount === 1, "N: exactly one renderer invocation");
    renderer.resolveAll();
    await sleep(10);
    assert(c1 === 1 && c2 === 1 && c3 === 1, "N: all three subscribers notified");
    h1.unsubscribe(); h2.unsubscribe(); h3.unsubscribe();
}

async function testO_oneSubscriberLeaves(): Promise<void> {
    // O. one subscriber leaves → render continues for remaining subscriber
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("o");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 14);

    const h1 = manager.request(req);
    const h2 = manager.request(req);
    let r2: PreviewResult | null = null;
    h1.subscribe(() => {});
    h2.subscribe(r => { r2 = r; });
    h1.unsubscribe(); // h1 leaves

    assert(renderer.invocationCount === 1, "O: still one invocation");
    const inflight = (manager as any).inflight as Map<any, any>;
    assert(inflight.size === 1, "O: render still in flight for h2");

    renderer.resolveAll();
    await sleep(10);
    assert(r2 !== null && (r2 as PreviewResult).isSuccess, "O: h2 receives success");
    h2.unsubscribe();
}

async function testP_lastSubscriberAborts(): Promise<void> {
    // P. final subscriber leaves → renderer aborted
    const manager = new PreviewManager();
    const renderer = makeFakeRenderer("p");
    manager.registerRenderer(renderer);
    const req = makeRequest("d", "v", 15);

    const h1 = manager.request(req);
    const h2 = manager.request(req);
    h1.subscribe(() => {});
    h2.subscribe(() => {});
    h1.unsubscribe();
    h2.unsubscribe();

    assert(renderer.lastSignal?.aborted === true, "P: signal aborted after last subscriber leaves");
    const inflight = (manager as any).inflight as Map<any, any>;
    assert(inflight.size === 0, "P: inflight cleared");
}

async function testQ_cacheEvictionActiveSubscriber(): Promise<void> {
    // Q. cache eviction while active subscriber exists → resource not revoked
    const cache = new PreviewCache({ capacity: 1 });
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 16);
    const key = createPreviewKey(req);
    const res: PreviewResource = { type: "image-url", url: "blob:q", revoke: () => {} };
    let revoked = false;
    res.revoke = () => { revoked = true; };
    cache.set(key, res);

    const handle = manager.request(req);
    handle.subscribe(() => {});

    // Insert a different resource to evict the first key
    const req2 = makeRequest("d2", "v", 1);
    const key2 = createPreviewKey(req2);
    cache.set(key2, { type: "image-url", url: "blob:q2" });

    assert(!revoked, "Q: resource not revoked while manager retains it");
    handle.unsubscribe();
}

async function testR_releaseAfterEviction(): Promise<void> {
    // R. final subscriber release after eviction → resource revoked exactly once
    const cache = new PreviewCache({ capacity: 1 });
    const manager = new PreviewManager(cache);
    const req = makeRequest("d", "v", 17);
    const key = createPreviewKey(req);
    let revokeCount = 0;
    const res: PreviewResource = { type: "image-url", url: "blob:r", revoke: () => { revokeCount++; } };
    cache.set(key, res);

    const handle = manager.request(req);
    handle.subscribe(() => {});

    // evict by inserting another resource
    const req2 = makeRequest("d2", "v", 1);
    cache.set(createPreviewKey(req2), { type: "image-url", url: "blob:r2" });

    assert(revokeCount === 0, "R: not revoked while retained");
    handle.unsubscribe();
    assert(revokeCount === 1, "R: revoked exactly once after last subscriber release");
}

async function testS_staleResult(): Promise<void> {
    // S. stale old renderer result → not cached, not delivered to new subscriber
    // We need two separate renderer instances, each controlling their own pending promise.
    const manager = new PreviewManager();
    const renderer1 = makeFakeRenderer("s1");
    manager.registerRenderer(renderer1);
    const req = makeRequest("d", "v", 18);

    // h1 subscribes; then unsubscribes (cancels the inflight entry for renderer1's promise)
    let r1: PreviewResult | null = null;
    const h1 = manager.request(req);
    h1.subscribe(r => { r1 = r; });
    h1.unsubscribe(); // removes the inflight entry; renderer1's promise is now orphaned

    // Unregister renderer1 and register renderer2 so that h2 creates a new inflight with renderer2
    manager.unregisterRenderer("s1");
    const renderer2 = makeFakeRenderer("s2");
    manager.registerRenderer(renderer2);

    // New request for same key → new inflight entry (using renderer2)
    let r2: PreviewResult | null = null;
    const h2 = manager.request(req);
    h2.subscribe(r => { r2 = r; });

    // renderer1's (stale) promise resolves — should be completely ignored (different entry object)
    renderer1.resolveAll();
    await sleep(10);
    assert(r2 === null, "S: stale result not delivered to new subscriber");
    assert(manager.getCached(req) === undefined, "S: stale result not cached");

    // renderer2 resolves — new entry should deliver
    renderer2.resolveAll();
    await sleep(10);
    assert(r2 !== null && (r2 as PreviewResult).isSuccess, "S: new renderer result delivered");
    h2.unsubscribe();
}

async function testCapabilitySelection(): Promise<void> {
    // Renderer capability selection: client/server/auto
    const manager = new PreviewManager();
    const clientRenderer = makeFakeRenderer("cr", true, { client: true, server: false });
    const serverRenderer = makeFakeRenderer("sr", true, { client: false, server: true });
    manager.registerRenderer(clientRenderer);
    manager.registerRenderer(serverRenderer);

    const selClient = (manager as any)._selectRenderer(makeRequest("d", "v", 1, "client"));
    assert(selClient?.id === "cr", "Cap: client renderer selected for client pref");

    const selServer = (manager as any)._selectRenderer(makeRequest("d", "v", 1, "server"));
    assert(selServer?.id === "sr", "Cap: server renderer selected for server pref");

    const selAuto = (manager as any)._selectRenderer(makeRequest("d", "v", 1, "auto"));
    assert(selAuto !== undefined, "Cap: some renderer selected for auto");
}

// ─── runner ──────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ["A: cache hit + no subscribe", testA_cacheHitNoSubscribe],
        ["B: cache hit + subscribe → retain", testB_cacheHitSubscribe],
        ["C: cache hit + unsubscribe → release", testC_cacheHitUnsubscribe],
        ["D: unsubscribe before subscribe → zero callback", testD_cacheHitUnsubscribeBeforeSubscribe],
        ["E: subscribe twice → second ignored", testE_subscribeTwice],
        ["F: unsubscribe twice → one release", testF_unsubscribeTwice],
        ["G: no callback after unsubscribe", testG_noCallbackAfterUnsubscribe],
        ["H: clear() cancels + manager reusable", testH_clearCancelsAndManagerReusable],
        ["I: dispose() releases + blocks further requests", testI_disposeWithActiveSubscriber],
        ["J: sync renderer throw → PreviewError", testJ_rendererSyncThrow],
        ["K: rejected promise → PreviewError + no cache", testK_rendererRejectedPromise],
        ["L: numeric error code → string", testL_numericErrorCode],
        ["M: error status preserved", testM_errorStatusPreserved],
        ["N: deduplication → one invocation", testN_deduplication],
        ["O: one subscriber leaves → render continues", testO_oneSubscriberLeaves],
        ["P: last subscriber leaves → renderer aborted", testP_lastSubscriberAborts],
        ["Q: eviction + active subscriber → not revoked", testQ_cacheEvictionActiveSubscriber],
        ["R: release after eviction → revoked once", testR_releaseAfterEviction],
        ["S: stale result → not cached, not delivered", testS_staleResult],
        ["Cap: renderer capability selection", testCapabilitySelection],
        ["NoSecondCallback: clear()/dispose() no second callback", testNoSecondCallbackOnClearOrDispose],
    ];

    let passed = 0;
    let failed = 0;
    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (e: any) {
            console.error(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => { console.error(e); process.exit(1); });
