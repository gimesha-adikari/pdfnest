import assert from "node:assert/strict";
import { awaitRasterStage, RasterStageTimeoutError, validateRasterGeometry } from "../../lib/execution/images/rasterLifecycle";

async function main() {
    let cancelled = 0;
    await assert.rejects(
        Promise.race([
            awaitRasterStage(new Promise<void>(() => {}), "page render", {
                timeoutMs: 5,
                onCancel: () => { cancelled += 1; },
            }),
            new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("stage did not time out")), 25)),
        ]),
        (error: unknown) => error instanceof RasterStageTimeoutError && error.stage === "page render",
    );
    assert.equal(cancelled, 1, "a hung render must be cancelled when its deadline expires");

    const controller = new AbortController();
    let abortCleanup = 0;
    const pending = awaitRasterStage(new Promise<void>(() => {}), "canvas encoding", {
        timeoutMs: 1000,
        signal: controller.signal,
        onCancel: () => { abortCleanup += 1; },
    });
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
    assert.equal(abortCleanup, 1, "user cancellation must release the active raster stage");

    assert.equal(await awaitRasterStage(Promise.resolve("ready"), "zip", { timeoutMs: 100 }), "ready");
    assert.equal(validateRasterGeometry(1700, 2200, 16_000_000), 3_740_000);
    assert.throws(() => validateRasterGeometry(0, 2200, 16_000_000), /invalid/i);
    assert.throws(() => validateRasterGeometry(5000, 100, 16_000_000), /limit/i);
    assert.throws(() => validateRasterGeometry(2000, 2200, 3_000_000), /limit/i);
    console.log("Raster lifecycle deadlines and cancellation passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
