// pdfnest/tests/unit/serverPdfRenderer.test.ts

import { strict as assert } from "assert";
import { ServerPdfRenderer } from "../../lib/preview/ServerPdfRenderer";
import { PreviewManager } from "../../lib/preview/PreviewManager";
import type { PreviewRequest } from "../../lib/preview/types";
import { getPdfInputPreparation, markPdfInputPreparation } from "../../lib/security/pdfInputPreparation";
import {
    authorizeRestoredStudioPreview,
    createRestoredStudioPreviewScope,
    revokeRestoredStudioPreview,
} from "../../lib/security/restoredStudioPreviewAuthorization";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeFile(name = "test.pdf", size = 1024): File {
    const blob = new Blob([new Uint8Array(size)], { type: "application/pdf" });
    return new File([blob], name, { type: "application/pdf", lastModified: 1000 });
}

function makeRequest(overrides: Partial<PreviewRequest> = {}): PreviewRequest {
    return {
        document: {
            id: "doc1",
            version: "v1",
            pageCount: 5,
            file: makeFile(),
        },
        page: 1,
        ...overrides,
    };
}

function liveSignal(): AbortSignal {
    return new AbortController().signal;
}

function abortedSignal(): AbortSignal {
    const c = new AbortController();
    c.abort();
    return c.signal;
}

function sessionResponse(sessionId = "sess-1", pageCount = 5): Response {
    return new Response(JSON.stringify({ session_id: sessionId, page_count: pageCount }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function pageResponse(bytes = new Uint8Array([0xff, 0xd8])): Response {
    return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
    });
}

function errorResponse(status: number, body: object): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/** Creates a mock fetch that returns responses from a factory sequence in order. */
function makeFetch(...factories: (() => Response)[]): typeof fetch {
    let index = 0;
    return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const factory = factories[index++];
        if (!factory) throw new Error("Unexpected extra fetch call");
        return factory();
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function test1_identityAndCapabilities(): Promise<void> {
    const r = new ServerPdfRenderer();
    assert.equal(r.id, "server-pymupdf");
    assert.equal(r.capabilities.client, false);
    assert.equal(r.capabilities.server, true);
}

async function test2_canRenderTrueWithFile(): Promise<void> {
    const r = new ServerPdfRenderer();
    assert.equal(r.canRender(makeRequest()), true);
}

async function test3_canRenderFalseWithoutFile(): Promise<void> {
    const r = new ServerPdfRenderer();
    const req = makeRequest();
    delete req.document.file;
    assert.equal(r.canRender(req), false);
}

async function test4_renderThrowsWhenFileAbsent(): Promise<void> {
    const r = new ServerPdfRenderer({ fetchImpl: makeFetch() });
    const req = makeRequest();
    delete req.document.file;
    let threw = false;
    try {
        await r.render(req, liveSignal());
    } catch (err) {
        threw = true;
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("requires request.document.file"));
    }
    assert.ok(threw, "render should have thrown");
}

async function test5_successfulRender(): Promise<void> {
    const fetch = makeFetch(
        () => sessionResponse("s1"),
        () => pageResponse(),
    );
    const r = new ServerPdfRenderer({ fetchImpl: fetch });
    const resource = await r.render(makeRequest(), liveSignal());
    assert.equal(resource.type, "image-url");
    assert.ok(typeof resource.url === "string" && resource.url.startsWith("blob:"));
    assert.equal(resource.renderedBy, "server-pymupdf");
    assert.equal(resource.metadata?.pageCount, 5);
    assert.equal(resource.metadata?.page, 1);
    assert.ok(typeof resource.revoke === "function");
}

async function test6_sessionReusedAcrossPages(): Promise<void> {
    let fetchCount = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        fetchCount++;
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            return sessionResponse("s-reuse");
        }
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });
    const req = makeRequest();

    await r.render(req, liveSignal());
    await r.render({ ...req, page: 2 }, liveSignal());

    // 1 session POST + 2 page GETs = 3 total
    assert.equal(fetchCount, 3, `Expected 3 fetch calls, got ${fetchCount}`);
}

async function test7_sessionExpiry404Retry(): Promise<void> {
    let sessionCreateCount = 0;
    let pageCallCount = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            sessionCreateCount++;
            return sessionResponse(`s${sessionCreateCount}`);
        }
        pageCallCount++;
        // First page call returns 404; second succeeds.
        if (pageCallCount === 1) {
            return errorResponse(404, { code: "SESSION_NOT_FOUND", message: "session not found" });
        }
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });
    const resource = await r.render(makeRequest(), liveSignal());
    assert.equal(resource.type, "image-url");
    assert.equal(sessionCreateCount, 2, `Expected 2 session creates, got ${sessionCreateCount}`);
    assert.equal(pageCallCount, 2, `Expected 2 page fetches, got ${pageCallCount}`);
}

async function test8_nonOkHttpErrorPropagates(): Promise<void> {
    const fetch = makeFetch(
        () => sessionResponse("s1"),
        () => errorResponse(500, { code: "INTERNAL", message: "worker crashed" }),
    );
    const r = new ServerPdfRenderer({ fetchImpl: fetch });
    let threw = false;
    try {
        await r.render(makeRequest(), liveSignal());
    } catch (err) {
        threw = true;
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("worker crashed"), `Got: ${(err as Error).message}`);
    }
    assert.ok(threw, "Expected error to be thrown");
}

async function test9_sessionCreationFailurePropagates(): Promise<void> {
    const fetch = makeFetch(
        () => errorResponse(400, { code: "MISSING_FILE", message: "file is required" }),
    );
    const r = new ServerPdfRenderer({ fetchImpl: fetch });
    let threw = false;
    try {
        await r.render(makeRequest(), liveSignal());
    } catch (err) {
        threw = true;
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("file is required"), `Got: ${(err as Error).message}`);
    }
    assert.ok(threw, "Expected error to be thrown");
}

async function test10_preAbortedSignalThrows(): Promise<void> {
    const r = new ServerPdfRenderer({ fetchImpl: makeFetch() });
    let threw = false;
    try {
        await r.render(makeRequest(), abortedSignal());
    } catch (err) {
        threw = true;
        assert.ok(err instanceof Error);
        assert.equal((err as { name: string }).name, "AbortError");
    }
    assert.ok(threw, "Expected AbortError to be thrown");
}

async function test11_revokeReleasesObjectUrl(): Promise<void> {
    let revoked: string | null = null;
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { revoked = url; originalRevoke(url); };

    try {
        const fetch = makeFetch(
            () => sessionResponse("s1"),
            () => pageResponse(),
        );
        const r = new ServerPdfRenderer({ fetchImpl: fetch });
        const resource = await r.render(makeRequest(), liveSignal());
        const url = resource.url!;
        resource.revoke!();
        assert.equal(revoked, url, "revoke() should call URL.revokeObjectURL with the resource URL");
    } finally {
        URL.revokeObjectURL = originalRevoke;
    }
}

async function test12_explicitScaleForwardedToUrl(): Promise<void> {
    let pageUrl = "";
    const fetchImpl: typeof fetch = async (input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            return sessionResponse("s1");
        }
        pageUrl = url;
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });
    await r.render(makeRequest({ scale: 1.5 }), liveSignal());
    assert.ok(pageUrl.includes("scale=1.5"), `Expected scale=1.5 in URL, got: ${pageUrl}`);
}

async function test13_defaultScale2UsedWhenAbsent(): Promise<void> {
    let pageUrl = "";
    const fetchImpl: typeof fetch = async (input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            return sessionResponse("s1");
        }
        pageUrl = url;
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });
    await r.render(makeRequest(), liveSignal());
    assert.ok(pageUrl.includes("scale=2"), `Expected scale=2 in URL, got: ${pageUrl}`);
}

async function test14_differentFileInvalidatesSession(): Promise<void> {
    let sessionCreateCount = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            sessionCreateCount++;
            return sessionResponse(`s${sessionCreateCount}`);
        }
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });

    await r.render(
        makeRequest({ document: { id: "d1", version: "v1", pageCount: 1, file: makeFile("a.pdf") } }),
        liveSignal(),
    );
    await r.render(
        makeRequest({ document: { id: "d2", version: "v1", pageCount: 1, file: makeFile("b.pdf") } }),
        liveSignal(),
    );

    assert.equal(sessionCreateCount, 2, `Expected 2 session creates, got ${sessionCreateCount}`);
}

// ---------------------------------------------------------------------------
// New tests: lifecycle fixes
// ---------------------------------------------------------------------------

async function test15_concurrentCancellationIndependence(): Promise<void> {
    // Verify that aborting caller A does not fail caller B when they share one session creation.
    let sessionCreateCount = 0;
    let resolveSession!: (r: Response) => void;
    const sessionGate = new Promise<Response>((res) => { resolveSession = res; });

    const fetchImpl: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("/session") && !url.includes("/page/")) {
            sessionCreateCount++;
            // Block until the test unblocks the session response.
            return sessionGate;
        }
        return pageResponse();
    };

    const r = new ServerPdfRenderer({ fetchImpl });
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const sharedRequest = makeRequest();

    let resourceA: unknown;
    let errorA: unknown;
    let resourceB: unknown;
    let errorB: unknown;

    // Start both renders before session creation completes.
    const promiseA = r.render(sharedRequest, controllerA.signal)
        .then((res) => { resourceA = res; })
        .catch((err) => { errorA = err; });

    const promiseB = r.render(sharedRequest, controllerB.signal)
        .then((res) => { resourceB = res; })
        .catch((err) => { errorB = err; });

    // Give both renders time to register with the shared promise.
    await new Promise((res) => setTimeout(res, 0));

    // Abort A — the shared session creation must continue for B.
    controllerA.abort();

    // Allow A's abort to propagate.
    await new Promise((res) => setTimeout(res, 0));

    // Only one session creation should have started.
    assert.equal(sessionCreateCount, 1, `Expected 1 session creation, got ${sessionCreateCount}`);

    // Unblock the shared session creation.
    resolveSession(sessionResponse("s-shared"));

    // Wait for both renders to settle.
    await Promise.all([promiseA, promiseB]);

    // A should have been cancelled.
    assert.ok(errorA instanceof Error, "A should have failed with an error");
    assert.equal((errorA as { name: string }).name, "AbortError", `A should be AbortError, got: ${(errorA as Error).name}`);
    assert.ok(resourceA === undefined, "A must not have received a successful resource");

    // B should have succeeded.
    assert.ok(errorB === undefined, `B should not have failed, got: ${errorB instanceof Error ? errorB.message : String(errorB)}`);
    assert.ok(resourceB !== null && resourceB !== undefined, "B must have received a resource");
    assert.equal((resourceB as { type: string }).type, "image-url", "B resource must be image-url");

    // Still only one session was created.
    assert.equal(sessionCreateCount, 1, `Expected 1 total session creation, got ${sessionCreateCount}`);
}

async function test16_idempotentRevoke(): Promise<void> {
    let revokeCount = 0;
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { revokeCount++; originalRevoke(url); };

    try {
        const fetch = makeFetch(
            () => sessionResponse("s1"),
            () => pageResponse(),
        );
        const r = new ServerPdfRenderer({ fetchImpl: fetch });
        const resource = await r.render(makeRequest(), liveSignal());

        resource.revoke!();
        resource.revoke!();
        resource.revoke!();

        assert.equal(revokeCount, 1, `URL.revokeObjectURL should be called exactly once, got ${revokeCount}`);
    } finally {
        URL.revokeObjectURL = originalRevoke;
    }
}

async function test17_previewSessionRecordsAttemptBeforeRequestAndKeepsItAfterFailure(): Promise<void> {
    const file = makeFile("legacy-studio-plain.pdf");
    markPdfInputPreparation(file, {
        sourceProtected: false,
        bytesState: "plain",
        preparedOn: "none",
        processingMode: "auto",
        cloudSubmissionInitiated: false,
    });

    const fetchImpl: typeof fetch = async () => {
        assert.equal(
            getPdfInputPreparation(file)?.cloudSubmissionInitiated,
            true,
            "the upload-start marker must be set at the submission boundary before fetch",
        );
        throw new TypeError("synthetic local request failure");
    };
    const r = new ServerPdfRenderer({ fetchImpl });

    await assert.rejects(
        () => r.render(
            makeRequest({ document: { id: "legacy-studio", version: "v1", pageCount: 1, file } }),
            liveSignal(),
        ),
        /synthetic local request failure/,
    );
    assert.equal(
        getPdfInputPreparation(file)?.cloudSubmissionInitiated,
        true,
        "a failed request keeps conservative attempted-transmission history",
    );
}

async function test18_restoredFileWithoutConsentCannotCreatePreviewSession(): Promise<void> {
    const file = makeFile("restored-project.pdf");
    createRestoredStudioPreviewScope([file]);
    let fetchCount = 0;
    const renderer = new ServerPdfRenderer({
        fetchImpl: async () => {
            fetchCount += 1;
            return sessionResponse("unexpected");
        },
    });

    await assert.rejects(
        () => renderer.render(
            makeRequest({ document: { id: "restored-project", version: "v1", pageCount: 1, file } }),
            liveSignal(),
        ),
        /explicit Cloud preview authorization/i,
    );
    assert.equal(fetchCount, 0, "an unauthorized restored File must not reach the session endpoint");
    assert.equal(getPdfInputPreparation(file)?.cloudSubmissionInitiated, undefined);
}

async function test19_authorizationAloneDoesNotMarkTransmissionButRequestFailureDoes(): Promise<void> {
    const file = makeFile("restored-project.pdf");
    const scope = createRestoredStudioPreviewScope([file]);
    authorizeRestoredStudioPreview(scope);
    assert.equal(getPdfInputPreparation(file)?.cloudSubmissionInitiated, undefined, "consent does not prove a request started");

    const renderer = new ServerPdfRenderer({
        fetchImpl: async () => {
            assert.equal(
                getPdfInputPreparation(file)?.cloudSubmissionInitiated,
                true,
                "request-start history is set immediately before fetch",
            );
            throw new TypeError("synthetic authorized preview failure");
        },
    });
    await assert.rejects(
        () => renderer.render(
            makeRequest({ document: { id: "restored-project", version: "v1", pageCount: 1, file } }),
            liveSignal(),
        ),
        /synthetic authorized preview failure/,
    );
    assert.equal(getPdfInputPreparation(file)?.cloudSubmissionInitiated, true);
}

async function test20_revokedRestoredFileCannotReuseAnExistingPreviewSession(): Promise<void> {
    const file = makeFile("restored-project.pdf");
    const scope = createRestoredStudioPreviewScope([file]);
    authorizeRestoredStudioPreview(scope);
    let fetchCount = 0;
    const renderer = new ServerPdfRenderer({
        fetchImpl: async (input) => {
            fetchCount += 1;
            return String(input).includes("/page/") ? pageResponse() : sessionResponse("authorized-session");
        },
    });
    const request = makeRequest({ document: { id: "restored-project", version: "v1", pageCount: 1, file } });

    await renderer.render(request, liveSignal());
    assert.equal(fetchCount, 2);
    revokeRestoredStudioPreview(scope);
    await assert.rejects(() => renderer.render(request, liveSignal()), /explicit Cloud preview authorization/i);
    assert.equal(fetchCount, 2, "revocation must be checked before cached session/page reuse");
}

async function test21_previewManagerCacheCannotBypassRevokedConsent(): Promise<void> {
    const file = makeFile("restored-project.pdf");
    const scope = createRestoredStudioPreviewScope([file]);
    authorizeRestoredStudioPreview(scope);
    let fetchCount = 0;
    const manager = new PreviewManager();
    manager.registerRenderer(new ServerPdfRenderer({
        fetchImpl: async (input) => {
            fetchCount += 1;
            return String(input).includes("/page/") ? pageResponse() : sessionResponse("manager-session");
        },
    }));
    const request: PreviewRequest = {
        document: { id: "restored-manager-test", version: "v1", pageCount: 1, file },
        page: 1,
        renderer: "server",
    };

    const first = manager.request(request);
    await new Promise<void>((resolve, reject) => {
        first.subscribe((result) => result.status === "success" ? resolve() : reject(new Error(result.error?.message)));
    });
    assert.equal(fetchCount, 2);

    revokeRestoredStudioPreview(scope);
    let secondError: string | undefined;
    const second = manager.request(request);
    second.subscribe((result) => { secondError = result.error?.message; });
    assert.match(secondError ?? "", /explicit Cloud preview authorization/i);
    assert.equal(fetchCount, 2, "a cached preview resource must not bypass revoked project authorization");
    manager.dispose();
}

async function test22_previewManagerCacheSeparatesDistinctFilesWithMatchingMetadata(): Promise<void> {
    const firstFile = makeFile("same.pdf");
    const secondFile = makeFile("same.pdf");
    let sessionCount = 0;
    let pageCount = 0;
    const manager = new PreviewManager();
    manager.registerRenderer(new ServerPdfRenderer({
        fetchImpl: async (input) => {
            if (String(input).endsWith("/api/conversion/preview/session")) {
                sessionCount += 1;
                return sessionResponse(`same-metadata-session-${sessionCount}`);
            }
            pageCount += 1;
            return pageResponse();
        },
    }));

    const makeRequestFor = (file: File): PreviewRequest => ({
        document: { id: "same-document-id", version: "same-version", pageCount: 1, file },
        page: 1,
        renderer: "server",
    });
    const render = (request: PreviewRequest) => new Promise<void>((resolve, reject) => {
        manager.request(request).subscribe((result) => {
            if (result.status === "error") reject(new Error(result.error?.message));
            if (result.status === "success") resolve();
        });
    });

    await render(makeRequestFor(firstFile));
    await render(makeRequestFor(secondFile));

    assert.equal(sessionCount, 2, "each distinct File object needs its own Cloud preview session");
    assert.equal(pageCount, 2, "each distinct File object must render instead of reusing a colliding cache entry");
    manager.dispose();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTests(): Promise<void> {
    const tests: [string, () => Promise<void>][] = [
        ["1: identity and capabilities", test1_identityAndCapabilities],
        ["2: canRender true with file", test2_canRenderTrueWithFile],
        ["3: canRender false without file", test3_canRenderFalseWithoutFile],
        ["4: render throws when file absent", test4_renderThrowsWhenFileAbsent],
        ["5: successful render returns image-url", test5_successfulRender],
        ["6: session reused across pages", test6_sessionReusedAcrossPages],
        ["7: 404 triggers session retry", test7_sessionExpiry404Retry],
        ["8: non-ok HTTP error propagates", test8_nonOkHttpErrorPropagates],
        ["9: session creation failure propagates", test9_sessionCreationFailurePropagates],
        ["10: pre-aborted signal throws AbortError", test10_preAbortedSignalThrows],
        ["11: revoke() releases Object URL", test11_revokeReleasesObjectUrl],
        ["12: explicit scale forwarded to URL", test12_explicitScaleForwardedToUrl],
        ["13: default scale 2.0 used when absent", test13_defaultScale2UsedWhenAbsent],
        ["14: different file invalidates session", test14_differentFileInvalidatesSession],
        ["15: concurrent cancellation does not affect peer caller", test15_concurrentCancellationIndependence],
        ["16: revoke() is idempotent", test16_idempotentRevoke],
        ["17: preview upload attempt is recorded and retained after failure", test17_previewSessionRecordsAttemptBeforeRequestAndKeepsItAfterFailure],
        ["18: restored preview without consent is rejected before network", test18_restoredFileWithoutConsentCannotCreatePreviewSession],
        ["19: consent is distinct from transmission and failure retains request history", test19_authorizationAloneDoesNotMarkTransmissionButRequestFailureDoes],
        ["20: revoked restored preview authorization blocks session reuse", test20_revokedRestoredFileCannotReuseAnExistingPreviewSession],
        ["21: preview manager cache cannot bypass revoked authorization", test21_previewManagerCacheCannotBypassRevokedConsent],
        ["22: preview cache separates File objects with matching metadata", test22_previewManagerCacheSeparatesDistinctFilesWithMatchingMetadata],
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
