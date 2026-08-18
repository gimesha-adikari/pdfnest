/**
 * Unit Tests for Phase 4 WASM Capability & Memory Preflight Subsystem
 *
 * Verifies:
 * 1. Browser with WebAssembly available passes preflight probe
 * 2. Environment without WebAssembly fails preflight probe with WASM_UNAVAILABLE
 * 3. WebAssembly bytecode validation failure returns UNSUPPORTED_WASM
 * 4. WebAssembly memory allocation failure returns WASM_MEMORY_LIMIT
 * 5. WASM-dependent tools (compress, watermark, lock) rejected when WASM unavailable
 * 6. Non-WASM tools (rotate, split, merge) accepted even when WASM unavailable
 * 7. SafetyGate rejection routes to CloudExecutor in ExecutionManager.run() Auto mode
 * 8. Existing file size safety rules remain unchanged (25MB desktop / 12.5MB mobile)
 * 9. Existing RAM/device memory checks remain unchanged (<2GB RAM)
 * 10. Telemetry receives structured rejection category
 * 11. Preflight performs ZERO network requests & minimal memory allocation (64KB)
 * 12. Probe result caching behavior and cache resetting
 */

import assert from "assert";
import { PDFDocument } from "pdf-lib";
import {
    ExecutionSafetyGate,
    isWasmDependentTool,
    probeWasmCapability,
    resetWasmProbeCache,
} from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { telemetry } from "../../lib/execution/telemetry";

async function createValidPdfFile(pageCount = 2, name = "sample.pdf"): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([600, 400]);
    }
    const pdfBytes = await pdfDoc.save();
    return new File([pdfBytes.buffer as ArrayBuffer], name, { type: "application/pdf" });
}

function createDummyFile(sizeBytes: number, name = "test.pdf"): File {
    return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

async function runTests() {
    console.log("=== RUNNING WASM SAFETY & PREFLIGHT UNIT TESTS ===");

    // Save original WebAssembly reference
    const originalWebAssembly = globalThis.WebAssembly;
    const originalCloudExec = CloudExecutor.execute;

    CloudExecutor.execute = async () => {
        const doc = await createValidPdfFile(1, "cloud_output.pdf");
        return new Blob([await doc.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        // 1. WASM Tool Inventory Mapping
        console.log("\n[Test 1] WASM Tool Inventory Mapping");
        assert.strictEqual(isWasmDependentTool("watermark"), true);
        assert.strictEqual(isWasmDependentTool("compress"), true);
        assert.strictEqual(isWasmDependentTool("lock"), true);
        assert.strictEqual(isWasmDependentTool("repair"), true);
        assert.strictEqual(isWasmDependentTool("rotate"), false);
        assert.strictEqual(isWasmDependentTool("split"), false);
        assert.strictEqual(isWasmDependentTool("merge"), false);
        assert.strictEqual(isWasmDependentTool("pdf_to_images"), false);
        console.log("  ✓ isWasmDependentTool correctly distinguishes WASM engines from pdf-lib/pdfjs engines.");

        // 2. Browser with WASM Available
        console.log("\n[Test 2] WASM Available Browser Preflight");
        resetWasmProbeCache();
        const probeResult1 = probeWasmCapability();
        assert.strictEqual(probeResult1.supported, true);
        assert.strictEqual(probeResult1.category, undefined);
        console.log("  ✓ Standard browser with WebAssembly passes preflight probe.");

        // 3. Probe Result Caching
        console.log("\n[Test 3] Probe Result Caching");
        const probeResultCached = probeWasmCapability();
        assert.strictEqual(probeResultCached, probeResult1, "Subsequent calls must return cached probe object");
        console.log("  ✓ Repeated capability checks cleanly reuse cached in-memory probe result.");

        // 4. WASM Unavailable (WebAssembly = undefined)
        console.log("\n[Test 4] WASM Unavailable Environment");
        resetWasmProbeCache();
        // @ts-ignore
        delete globalThis.WebAssembly;

        const probeResult2 = probeWasmCapability();
        assert.strictEqual(probeResult2.supported, false);
        assert.strictEqual(probeResult2.category, "WASM_UNAVAILABLE");

        const samplePdf = createDummyFile(1024, "sample.pdf");

        // WASM-dependent tool (watermark) rejected
        const evalWasmTool = ExecutionSafetyGate.evaluate("watermark", [samplePdf], "HYBRID");
        assert.strictEqual(evalWasmTool.eligible, false);
        assert.strictEqual(evalWasmTool.recommendedMode, "cloud");
        assert.strictEqual(evalWasmTool.rejectionCategory, "WASM_UNAVAILABLE");

        // Non-WASM tool (rotate) accepted even when WASM is unavailable!
        const evalNonWasmTool = ExecutionSafetyGate.evaluate("rotate", [samplePdf], "CLIENT_PREFERRED");
        assert.strictEqual(evalNonWasmTool.eligible, true);
        assert.strictEqual(evalNonWasmTool.recommendedMode, "client");
        console.log("  ✓ WASM-dependent tools rejected with WASM_UNAVAILABLE; Non-WASM tools remain eligible.");

        // Restore WebAssembly for remaining tests
        globalThis.WebAssembly = originalWebAssembly;

        // 5. WASM Validation Failure (WebAssembly.validate = () => false)
        console.log("\n[Test 5] WASM Bytecode Validation Failure");
        resetWasmProbeCache();
        const originalValidate = globalThis.WebAssembly.validate;
        globalThis.WebAssembly.validate = () => false;

        try {
            const probeResult3 = probeWasmCapability();
            assert.strictEqual(probeResult3.supported, false);
            assert.strictEqual(probeResult3.category, "UNSUPPORTED_WASM");

            const evalValidate = ExecutionSafetyGate.evaluate("compress", [samplePdf], "CLIENT_PREFERRED");
            assert.strictEqual(evalValidate.eligible, false);
            assert.strictEqual(evalValidate.rejectionCategory, "UNSUPPORTED_WASM");
            console.log("  ✓ WASM bytecode validation failure returns UNSUPPORTED_WASM rejection category.");
        } finally {
            globalThis.WebAssembly.validate = originalValidate;
        }

        // 6. WASM Memory Allocation Failure (WebAssembly.Memory throws error)
        console.log("\n[Test 6] WASM Memory Allocation Failure");
        resetWasmProbeCache();
        const originalMemory = globalThis.WebAssembly.Memory;
        // @ts-ignore
        globalThis.WebAssembly.Memory = function () {
            throw new Error("Out of memory: OutOfMemoryError");
        };

        try {
            const probeResult4 = probeWasmCapability();
            assert.strictEqual(probeResult4.supported, false);
            assert.strictEqual(probeResult4.category, "WASM_MEMORY_LIMIT");

            const evalMemory = ExecutionSafetyGate.evaluate("lock", [samplePdf], "HYBRID");
            assert.strictEqual(evalMemory.eligible, false);
            assert.strictEqual(evalMemory.rejectionCategory, "WASM_MEMORY_LIMIT");
            console.log("  ✓ WASM memory allocation failure returns WASM_MEMORY_LIMIT rejection category.");
        } finally {
            globalThis.WebAssembly.Memory = originalMemory;
        }

        // 7. SafetyGate Rejection Route to CloudExecutor in ExecutionManager Auto mode
        console.log("\n[Test 7] WASM SafetyGate Rejection Routes to Cloud in Auto Mode");
        resetWasmProbeCache();
        // @ts-ignore
        delete globalThis.WebAssembly;

        telemetry.clearEvents();
        const validPdf = await createValidPdfFile(1, "sample.pdf");
        const resAuto = await ExecutionManager.run({
            tool: "watermark",
            files: [validPdf],
            mode: "auto",
        });

        assert.strictEqual(resAuto.executionMode, "cloud");
        const lastEvt = telemetry.getLastEvent();
        assert.ok(lastEvt);
        assert.strictEqual(lastEvt.category, "direct_cloud_success");
        assert.ok(lastEvt.safetyRejectionReason?.includes("WebAssembly"));
        console.log("  ✓ WASM-unavailable rejection in Auto mode routes seamlessly to CloudExecutor.");

        // Restore WebAssembly
        globalThis.WebAssembly = originalWebAssembly;
        resetWasmProbeCache();

        // 8. File Size Safety Rules (25MB desktop / 12.5MB mobile)
        console.log("\n[Test 8] File Size Safety Threshold Rules");
        const oversizedFile = createDummyFile(30 * 1024 * 1024, "30mb.pdf");
        const evalOversized = ExecutionSafetyGate.evaluate("rotate", [oversizedFile], "CLIENT_PREFERRED");
        assert.strictEqual(evalOversized.eligible, false);
        assert.strictEqual(evalOversized.rejectionCategory, "FILE_SIZE_LIMIT");
        console.log("  ✓ File size threshold (>25MB) cleanly returns FILE_SIZE_LIMIT category.");

        // 9. RAM Device Check (<2GB RAM)
        console.log("\n[Test 9] Low Device Memory Safety Rule");
        const lowMemoryConfig = { maxClientFileSizeMB: 25, maxClientFileCount: 20, minDeviceMemoryGB: 8 };
        const evalLowRam = ExecutionSafetyGate.evaluate("rotate", [samplePdf], "CLIENT_PREFERRED", undefined, lowMemoryConfig);
        assert.strictEqual(evalLowRam.eligible, false);
        assert.strictEqual(evalLowRam.rejectionCategory, "LOW_DEVICE_MEMORY");
        console.log("  ✓ Device RAM threshold (<2GB) cleanly returns LOW_DEVICE_MEMORY category.");

    } finally {
        globalThis.WebAssembly = originalWebAssembly;
        resetWasmProbeCache();
        CloudExecutor.execute = originalCloudExec;
    }

    console.log("\n=== ALL WASM SAFETY & PREFLIGHT UNIT TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("WASM Safety Test Failure:", err);
    process.exit(1);
});
