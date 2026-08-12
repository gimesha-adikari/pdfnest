// pdfnest/tests/unit/clientPdfRenderer.test.ts

import { ClientPdfRenderer } from "../../lib/preview/ClientPdfRenderer";
import { PreviewRequest } from "../../lib/preview/types";

function assert(condition: boolean, msg: string): void {
    if (!condition) throw new Error(`FAIL: ${msg}`);
}

function makeMockFile(name = "test.pdf"): File {
    const blob = new Blob(["%PDF-1.4 mock content"], { type: "application/pdf" });
    return new File([blob], name, { type: "application/pdf" });
}

function makeMockPdfJs(options: {
    failGetDoc?: boolean;
    failGetPage?: boolean;
    failRender?: boolean;
    pageWidth?: number;
    pageHeight?: number;
    delay?: number;
} = {}) {
    const pageWidth = options.pageWidth ?? 600;
    const pageHeight = options.pageHeight ?? 800;

    let destroyedDoc = false;
    let cancelledRender = false;
    let requestedPageNum = -1;
    let passedScale = -1;

    const mockPdfDoc = {
        getPage: async (pageNum: number) => {
            requestedPageNum = pageNum;
            if (options.failGetPage) {
                throw new Error("getPage failed");
            }
            return {
                getViewport: ({ scale }: { scale: number }) => {
                    passedScale = scale;
                    return {
                        width: pageWidth * scale,
                        height: pageHeight * scale,
                    };
                },
                render: ({ canvasContext, viewport }: any) => {
                    let onCancel: (() => void) | undefined;
                    const promise = new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(() => {
                            if (options.failRender) {
                                reject(new Error("render failed"));
                            } else {
                                resolve();
                            }
                        }, options.delay ?? 5);

                        onCancel = () => {
                            clearTimeout(timer);
                            cancelledRender = true;
                            const err = new Error("RenderingCancelledException");
                            (err as any).name = "RenderingCancelledException";
                            reject(err);
                        };
                    });

                    return {
                        promise,
                        cancel: () => onCancel?.(),
                    };
                },
            };
        },
        destroy: () => {
            destroyedDoc = true;
        },
    };

    const mockLib = {
        getDocument: (_params: any) => {
            if (options.failGetDoc) {
                return {
                    promise: Promise.reject(new Error("getDocument failed")),
                    destroy: () => {},
                };
            }
            return {
                promise: Promise.resolve(mockPdfDoc),
                destroy: () => { destroyedDoc = true; },
            };
        },
    };

    return {
        mockLib,
        getTracker: () => ({
            destroyedDoc,
            cancelledRender,
            requestedPageNum,
            passedScale,
        }),
    };
}

// Mock URL tracking
const createObjectURLCalls: Blob[] = [];
const revokeObjectURLCalls: string[] = [];

(globalThis as any).URL = {
    createObjectURL: (blob: Blob) => {
        createObjectURLCalls.push(blob);
        return `blob:mock-client-url/${createObjectURLCalls.length}`;
    },
    revokeObjectURL: (url: string) => {
        revokeObjectURLCalls.push(url);
    },
};

async function test1_identityAndCapabilities(): Promise<void> {
    const renderer = new ClientPdfRenderer();
    assert(renderer.id === "client-pdfjs", "1: identity must be client-pdfjs");
    assert(renderer.capabilities.client === true, "1: capabilities.client must be true");
    assert(renderer.capabilities.server === false, "1: capabilities.server must be false");
}

async function test2_canRender(): Promise<void> {
    const renderer = new ClientPdfRenderer();
    const reqWithFile: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 5, file: makeMockFile() },
        page: 1,
    };
    const reqWithoutFile: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 5 },
        page: 1,
    };
    assert(renderer.canRender(reqWithFile) === true, "2: canRender with file returns true");
    assert(renderer.canRender(reqWithoutFile) === false, "2: canRender without file returns false");
}

async function test3_missingFileThrows(): Promise<void> {
    const renderer = new ClientPdfRenderer();
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 5 },
        page: 1,
    };
    let threw = false;
    try {
        await renderer.render(req, new AbortController().signal);
    } catch (e: any) {
        threw = true;
        assert(e.message.includes("requires request.document.file"), "3: error message mentions missing file");
    }
    assert(threw, "3: render without file throws error");
}

async function test4_pageNumberAndScale(): Promise<void> {
    const initialCreateCount = createObjectURLCalls.length;
    const { mockLib, getTracker } = makeMockPdfJs({ pageWidth: 500, pageHeight: 700 });
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 4,
        scale: 2.0,
    };

    const resource = await renderer.render(req, new AbortController().signal);
    const tracker = getTracker();

    assert(tracker.requestedPageNum === 4, "4: page number 4 passed to getPage");
    assert(tracker.passedScale === 2.0, "4: explicit scale 2.0 respected");
    assert(resource.type === "image-url", "4: resource type is image-url");
    assert(typeof resource.url === "string" && resource.url.length > 0, "4: resource.url is a valid non-empty string");
    assert(createObjectURLCalls.length === initialCreateCount + 1, "4: URL.createObjectURL called with Blob");
    assert(resource.width === 1000, "4: width calculated from scale (500 * 2)");
    assert(resource.height === 1400, "4: height calculated from scale (700 * 2)");
    assert(resource.renderedBy === "client-pdfjs", "4: renderedBy is client-pdfjs");
    assert(tracker.destroyedDoc === true, "4: PDF.js document destroyed after render");
}

async function test5_derivedScaleFromWidthHeight(): Promise<void> {
    const { mockLib } = makeMockPdfJs({ pageWidth: 400, pageHeight: 800 });
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 1,
        width: 800, // scale should become 800 / 400 = 2.0
    };

    const resource = await renderer.render(req, new AbortController().signal);
    assert(resource.width === 800, "5: width derived correctly");
    assert(resource.height === 1600, "5: height scaled proportionally");
}

async function test6_abortSignalCancellation(): Promise<void> {
    const { mockLib, getTracker } = makeMockPdfJs({ delay: 50 });
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 1,
    };

    const controller = new AbortController();
    const promise = renderer.render(req, controller.signal);
    setTimeout(() => controller.abort(), 10);

    let threwAbort = false;
    try {
        await promise;
    } catch (e: any) {
        if (e.name === "AbortError") {
            threwAbort = true;
        }
    }

    const tracker = getTracker();
    assert(threwAbort, "6: render cancellation throws AbortError");
    assert(tracker.cancelledRender === true, "6: renderTask.cancel() was called");
    assert(tracker.destroyedDoc === true, "6: pdfDoc was destroyed on abort");
}

async function test7_pdfJsErrorPropagation(): Promise<void> {
    const { mockLib } = makeMockPdfJs({ failGetPage: true });
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 1,
    };

    let threw = false;
    try {
        await renderer.render(req, new AbortController().signal);
    } catch (e: any) {
        threw = true;
        assert(e.message === "getPage failed", "7: PDF.js error propagated");
    }
    assert(threw, "7: error propagated when getPage fails");
}

async function test8_revokeBehavior(): Promise<void> {
    const initialRevokeCount = revokeObjectURLCalls.length;
    const { mockLib } = makeMockPdfJs();
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 1,
    };

    const resource = await renderer.render(req, new AbortController().signal);
    assert(typeof resource.revoke === "function", "8: revoke callback exists");

    const targetUrl = resource.url;
    resource.revoke!();
    assert(revokeObjectURLCalls.length === initialRevokeCount + 1, "8: URL.revokeObjectURL called exactly once");
    assert(revokeObjectURLCalls[revokeObjectURLCalls.length - 1] === targetUrl, "8: revoked correct URL");
    assert(resource.canvas?.width === 0, "8: canvas width reset to 0 on revoke");
    assert(resource.canvas?.height === 0, "8: canvas height reset to 0 on revoke");

    // Idempotency check
    resource.revoke!();
    assert(revokeObjectURLCalls.length === initialRevokeCount + 1, "8: second revoke call does nothing (idempotent)");
}

async function test9_blobConversionFailure(): Promise<void> {
    const { mockLib } = makeMockPdfJs();
    const renderer = new ClientPdfRenderer({ pdfjsLoader: async () => mockLib });
    // Override _canvasToBlob to simulate a conversion failure
    (renderer as any)._canvasToBlob = async () => {
        throw new Error("Canvas toBlob conversion failed: produced null");
    };

    const req: PreviewRequest = {
        document: { id: "doc1", version: "v1", pageCount: 10, file: makeMockFile() },
        page: 1,
    };

    let threw = false;
    const initialCreateCount = createObjectURLCalls.length;
    try {
        await renderer.render(req, new AbortController().signal);
    } catch (e: any) {
        threw = true;
        assert(e.message.includes("produced null"), "9: blob conversion failure error propagated");
    }
    assert(threw, "9: rendering rejects cleanly when blob conversion fails");
    assert(createObjectURLCalls.length === initialCreateCount, "9: URL.createObjectURL is not called if blob conversion fails");
}

async function runTests(): Promise<void> {
    const tests: Array<[string, () => Promise<void>]> = [
        ["1: identity & capabilities", test1_identityAndCapabilities],
        ["2: canRender check", test2_canRender],
        ["3: missing file throws", test3_missingFileThrows],
        ["4: page number & scale", test4_pageNumberAndScale],
        ["5: derived scale from width", test5_derivedScaleFromWidthHeight],
        ["6: AbortSignal cancellation", test6_abortSignalCancellation],
        ["7: PDF.js error propagation", test7_pdfJsErrorPropagation],
        ["8: revoke behavior & idempotency", test8_revokeBehavior],
        ["9: blob conversion failure", test9_blobConversionFailure],
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

runTests().catch((e) => {
    console.error(e);
    process.exit(1);
});
