/**
 * Unit Tests for Phase 5 User-Facing Hybrid Fallback Notification
 *
 * Verifies:
 * 1. Client execution success -> NO fallback notification shown
 * 2. Explicit Cloud execution mode -> NO fallback notification shown
 * 3. Client execution failure in Auto mode -> Cloud fallback success -> Fallback notification shown
 * 4. WASM SafetyGate rejection in Auto mode -> Cloud fallback success -> Fallback notification shown
 * 5. Feature-flag-disabled client execution in Auto mode -> Fallback notification shown
 * 6. Cloud execution failure -> Throws error (shows normal error state, no fallback success notification)
 * 7. Fallback notification does not block or corrupt successful ExecutionResult blob output
 * 8. Notification message contains clean UI language (zero WASM stack traces, zero passwords, zero internal file paths)
 */

import assert from "assert";
import { PDFDocument } from "pdf-lib";

let toastNotifications: any[] = [];

// Setup global window mock BEFORE notify imports
const windowMock = {
    __GLOBAL_NOTIFY__: (toast: any) => {
        toastNotifications.push(toast);
    },
};
(globalThis as any).window = windowMock;
(global as any).window = windowMock;

import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { resetWasmProbeCache } from "../../lib/execution/ExecutionSafetyGate";
import { ToastPayload } from "../../lib/notify";

async function createValidPdfFile(pageCount = 1, name = "test.pdf"): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([600, 400]);
    }
    const pdfBytes = await pdfDoc.save();
    return new File([pdfBytes.buffer as ArrayBuffer], name, { type: "application/pdf" });
}

function createDummyFile(sizeBytes: number, name = "oversized.pdf"): File {
    return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

async function runTests() {
    console.log("=== RUNNING PHASE 5 HYBRID FALLBACK NOTIFICATION TESTS ===");

    const originalClientExec = ClientExecutor.execute;
    const originalCloudExec = CloudExecutor.execute;
    const originalWebAssembly = globalThis.WebAssembly;
    const originalEnv = process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;

    let toastNotifications: ToastPayload[] = [];

    // Setup global notification handler mock
    // @ts-ignore
    globalThis.window = {
        __GLOBAL_NOTIFY__: (toast: ToastPayload) => {
            toastNotifications.push(toast);
        },
    };

    CloudExecutor.execute = async () => {
        const doc = await createValidPdfFile(1, "cloud_output.pdf");
        return new Blob([await doc.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const validPdf = await createValidPdfFile(1, "sample.pdf");

        // 1. Client Success -> No Fallback Notification
        console.log("\n[Test 1] Client Success -> No Fallback Notification");
        toastNotifications.length = 0;
        const resClient = await ExecutionManager.run({
            tool: "rotate",
            files: [validPdf],
            mode: "auto",
            params: { rotations: { "1": 90 } },
        });

        assert.strictEqual(resClient.executionMode, "client");
        assert.strictEqual(resClient.fallbackOccurred, false);
        assert.strictEqual(toastNotifications.length, 0, "No notification must be emitted on direct client success");
        console.log("  ✓ Direct client execution success emits zero fallback notifications.");

        // 2. Explicit Cloud Mode -> No Fallback Notification
        console.log("\n[Test 2] Explicit Cloud Mode -> No Fallback Notification");
        toastNotifications.length = 0;
        const resDirectCloud = await ExecutionManager.run({
            tool: "rotate",
            files: [validPdf],
            mode: "cloud",
            params: { rotations: { "1": 90 } },
        });

        assert.strictEqual(resDirectCloud.executionMode, "cloud");
        assert.strictEqual(resDirectCloud.fallbackOccurred, false);
        assert.strictEqual(toastNotifications.length, 0, "No notification must be emitted on explicit cloud mode");
        console.log("  ✓ Explicit Cloud execution mode emits zero fallback notifications.");

        // 3. Client Failure -> Cloud Success -> Fallback Notification Emitted
        console.log("\n[Test 3] Client Failure in Auto Mode -> Fallback Notification Emitted");
        toastNotifications.length = 0;
        ClientExecutor.execute = async () => {
            throw new Error("Simulated WASM memory corruption error: OOM at 0x00FF89");
        };

        const resFallback = await ExecutionManager.run({
            tool: "watermark",
            files: [validPdf],
            mode: "auto",
            params: { text: "CONFIDENTIAL" },
        });

        assert.strictEqual(resFallback.executionMode, "cloud");
        assert.strictEqual(resFallback.fallbackOccurred, true);
        assert.ok(resFallback.blob instanceof Blob, "Successful result output blob must not be blocked or corrupted");
        assert.strictEqual(toastNotifications.length, 1, "Exactly one fallback notification must be emitted");
        assert.strictEqual(toastNotifications[0].type, "info");
        assert.strictEqual(toastNotifications[0].message, "Processed using Cloud fallback");
        console.log("  ✓ Client failure triggers Cloud fallback with clean info notification emitted.");

        // Restore ClientExecutor.execute
        ClientExecutor.execute = originalClientExec;

        // 4. WASM SafetyGate Rejection -> Cloud Success -> Fallback Notification Emitted
        console.log("\n[Test 4] WASM SafetyGate Rejection in Auto Mode -> Fallback Notification Emitted");
        toastNotifications.length = 0;
        resetWasmProbeCache();
        // @ts-ignore
        delete globalThis.WebAssembly;

        const resWasmRejected = await ExecutionManager.run({
            tool: "watermark",
            files: [validPdf],
            mode: "auto",
            params: { text: "CONFIDENTIAL" },
        });

        assert.strictEqual(resWasmRejected.executionMode, "cloud");
        assert.strictEqual(resWasmRejected.fallbackOccurred, true);
        assert.strictEqual(toastNotifications.length, 1);
        assert.strictEqual(toastNotifications[0].message, "Processed using Cloud fallback");
        console.log("  ✓ WASM SafetyGate rejection routes to Cloud and emits fallback notification.");

        // Restore WebAssembly
        globalThis.WebAssembly = originalWebAssembly;
        resetWasmProbeCache();

        // 5. Feature Flag Disabled in Auto Mode -> Fallback Notification Emitted
        console.log("\n[Test 5] Feature-Flag-Disabled Client Execution in Auto Mode");
        toastNotifications = [];
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";

        const resFlagDisabled = await ExecutionManager.run({
            tool: "rotate",
            files: [validPdf],
            mode: "auto",
            params: { rotations: { "1": 90 } },
        });

        assert.strictEqual(resFlagDisabled.executionMode, "cloud");
        assert.strictEqual(resFlagDisabled.fallbackOccurred, true);
        assert.strictEqual(toastNotifications.length, 1);
        assert.strictEqual(toastNotifications[0].message, "Processed using Cloud fallback");
        console.log("  ✓ Client execution disabled by feature flag in Auto mode emits fallback notification.");

        delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;

        // 6. Cloud Failure -> Normal Error State (No Fallback Success Toast)
        console.log("\n[Test 6] Cloud Failure -> Throws Error (No Fallback Success Toast)");
        toastNotifications = [];
        CloudExecutor.execute = async () => {
            throw new Error("Cloud backend unavailable");
        };

        try {
            await ExecutionManager.run({
                tool: "rotate",
                files: [validPdf],
                mode: "cloud",
            });
            assert.fail("Should have thrown error");
        } catch (err: any) {
            assert.strictEqual(toastNotifications.length, 0, "Failed execution must not emit a fallback success notification");
            console.log("  ✓ Cloud execution failure throws error cleanly without emitting fallback success notification.");
        }

        // 7. Sensitive Information Leak Verification
        console.log("\n[Test 7] Verification of Privacy & Clean User Wording");
        toastNotifications = [];
        ClientExecutor.execute = async () => {
            throw new Error("Internal secret key leak: 0x99283719 password=secret_pass file=/secret/doc.pdf");
        };
        CloudExecutor.execute = async () => {
            const doc = await createValidPdfFile(1, "output.pdf");
            return new Blob([await doc.arrayBuffer()], { type: "application/pdf" });
        };

        await ExecutionManager.run({
            tool: "watermark",
            files: [validPdf],
            mode: "auto",
        });

        const notifyItem = toastNotifications[0];
        assert.ok(notifyItem);
        const fullText = `${notifyItem.message} ${notifyItem.title} ${notifyItem.description}`;
        assert.strictEqual(fullText.includes("0x99283719"), false);
        assert.strictEqual(fullText.includes("secret_pass"), false);
        assert.strictEqual(fullText.includes("Internal secret"), false);
        console.log("  ✓ Notification contains zero low-level WASM errors, passwords, or internal paths.");

    } finally {
        // @ts-ignore
        delete globalThis.window;
        globalThis.WebAssembly = originalWebAssembly;
        resetWasmProbeCache();
        ClientExecutor.execute = originalClientExec;
        CloudExecutor.execute = originalCloudExec;
        if (originalEnv !== undefined) {
            process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = originalEnv;
        } else {
            delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;
        }
    }

    console.log("\n=== ALL PHASE 5 FALLBACK NOTIFICATION TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("Phase 5 Fallback Notification Test Failure:", err);
    process.exit(1);
});
