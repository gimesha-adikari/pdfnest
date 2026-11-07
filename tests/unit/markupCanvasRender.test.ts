import assert from "node:assert/strict";
import { renderPdfPageToCanvas } from "../../lib/pdf/renderPdfPage";

function fixture(render: () => { promise: Promise<void>; cancel: () => void }, width = 100, height = 100) {
    let allocatedWidth = 0;
    let renderCalls = 0;
    let cancelled = 0;
    const page = {
        getViewport: () => ({ width, height }),
        render: () => {
            renderCalls += 1;
            const task = render();
            return { promise: task.promise, cancel: () => { cancelled += 1; task.cancel(); } };
        },
        cleanup() {},
    };
    const document = { getPage: async () => page };
    const canvas = {
        get width() { return allocatedWidth; },
        set width(value: number) { allocatedWidth = value; },
        set height(_value: number) {},
        clientWidth: 100,
        clientHeight: 100,
        getContext: () => ({}),
    };
    return { document, canvas, renderCalls: () => renderCalls, cancelled: () => cancelled, allocatedWidth: () => allocatedWidth };
}

async function main() {
    const resolved = fixture(() => ({ promise: Promise.resolve(), cancel() {} }));
    const result = await renderPdfPageToCanvas(resolved.document, 1, resolved.canvas as unknown as HTMLCanvasElement, { timeoutMs: 20 });
    assert.equal(result.pageWidth, 100);
    assert.equal(resolved.renderCalls(), 1);

    const hung = fixture(() => ({ promise: new Promise<void>(() => {}), cancel() {} }));
    await assert.rejects(
        renderPdfPageToCanvas(hung.document, 1, hung.canvas as unknown as HTMLCanvasElement, { timeoutMs: 5 }),
        /timed out/i,
    );
    assert.equal(hung.cancelled(), 1, "a stuck page render must be cancelled after its deadline");

    const oversized = fixture(() => ({ promise: Promise.resolve(), cancel() {} }), 5000, 100);
    await assert.rejects(
        renderPdfPageToCanvas(oversized.document, 1, oversized.canvas as unknown as HTMLCanvasElement, { timeoutMs: 20 }),
        /raster limits/i,
    );
    assert.equal(oversized.renderCalls(), 0, "oversized canvas dimensions must be rejected before native allocation");
    assert.equal(oversized.allocatedWidth(), 0);
    console.log("Legacy PDF canvas render deadlines and geometry admission passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
