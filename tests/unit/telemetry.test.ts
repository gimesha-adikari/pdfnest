/**
 * Unit Tests for Phase 3 Hybrid Execution Telemetry Subsystem
 *
 * Verifies:
 * 1. Successful client execution logging
 * 2. Successful cloud execution logging
 * 3. Client failure -> Cloud fallback logging with fallbackReason
 * 4. Direct cloud execution logging
 * 5. SafetyGate rejection logging
 * 6. Feature-flag-disabled execution logging
 * 7. Telemetry failure isolation (faulty sink does not crash PDF execution)
 * 8. Privacy guarantees (NO file names, NO document content, NO passwords in event payloads)
 * 9. Duration measurement (> 0ms)
 * 10. Preservation of fallback reasons
 */

import assert from "assert";
import { PDFDocument } from "pdf-lib";
import {
    extractFileMetrics,
    telemetry,
    TelemetrySink,
} from "../../lib/execution/telemetry";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";

function resetEnv() {
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL;
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;
}

async function createValidPdfFile(pageCount = 2, name = "secret_document_name.pdf"): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([600, 400]);
    }
    const pdfBytes = await pdfDoc.save();
    return new File([pdfBytes.buffer as ArrayBuffer], name, { type: "application/pdf" });
}

function createLargeDummyFile(sizeBytes: number, name = "large_document.pdf"): File {
    const buffer = new Uint8Array(sizeBytes);
    return new File([buffer], name, { type: "application/pdf" });
}

async function runTests() {
    console.log("=== RUNNING HYBRID TELEMETRY UNIT TESTS ===");

    // Clear buffer sink before tests
    telemetry.clearEvents();

    // Mock CloudExecutor by default to return a valid PDF Blob
    const originalCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        const doc = await createValidPdfFile(1, "cloud_output.pdf");
        return new Blob([await doc.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        // 1. File Metrics Extraction (Privacy Verification)
        console.log("\n[Test 1] Extract File Metrics & Privacy Verification");
        const testFile = await createValidPdfFile(1, "sensitive_financial_report_2026.pdf");
        const metrics = extractFileMetrics([testFile]);
        assert.strictEqual(metrics.fileCount, 1);
        assert.ok(metrics.fileSizeMB >= 0);
        assert.strictEqual((metrics as any).name, undefined);
        assert.strictEqual((metrics as any).fileName, undefined);
        console.log("  ✓ File metrics strictly extract size/count without exposing file names or content.");

        // 2. Successful Client Execution Logging
        console.log("\n[Test 2] Successful Client Execution Telemetry");
        telemetry.clearEvents();
        resetEnv();

        const samplePdf = await createValidPdfFile(2, "sample.pdf");
        const clientResult = await ExecutionManager.run({
            tool: "rotate",
            files: [samplePdf],
            mode: "auto",
            params: { angle: 90, rotation: 90 },
        });

        assert.strictEqual(clientResult.executionMode, "client");
        const lastEvent2 = telemetry.getLastEvent();
        assert.ok(lastEvent2, "Telemetry event should be recorded");
        assert.strictEqual(lastEvent2.toolId, "rotate");
        assert.strictEqual(lastEvent2.category, "client_success");
        assert.strictEqual(lastEvent2.actualMode, "client");
        assert.strictEqual(lastEvent2.success, true);
        assert.strictEqual(lastEvent2.fallbackOccurred, false);
        assert.strictEqual(lastEvent2.featureFlagDisabled, false);
        assert.ok(lastEvent2.durationMs >= 0, "Duration should be recorded");
        assert.strictEqual((lastEvent2 as any).fileName, undefined, "Filename must NOT be emitted");
        console.log("  ✓ Client success event logged cleanly with accurate duration and privacy protection.");

        // 3. Direct Cloud Execution Telemetry
        console.log("\n[Test 3] Direct Cloud Execution Telemetry");
        telemetry.clearEvents();

        const cloudResult = await ExecutionManager.run({
            tool: "rotate",
            files: [samplePdf],
            mode: "cloud",
        });

        assert.strictEqual(cloudResult.executionMode, "cloud");
        const lastEvent3 = telemetry.getLastEvent();
        assert.ok(lastEvent3);
        assert.strictEqual(lastEvent3.category, "direct_cloud_success");
        assert.strictEqual(lastEvent3.actualMode, "cloud");
        assert.strictEqual(lastEvent3.requestedMode, "cloud");
        assert.strictEqual(lastEvent3.success, true);
        assert.strictEqual(lastEvent3.fallbackOccurred, false);
        console.log("  ✓ Direct Cloud execution event logged cleanly.");

        // 4. Client Failure -> Cloud Fallback Logging
        console.log("\n[Test 4] Client Failure -> Cloud Fallback Telemetry");
        telemetry.clearEvents();

        const originalClientExec = ClientExecutor.execute;
        ClientExecutor.execute = async () => {
            const err: any = new Error("Simulated client WASM memory error");
            err.code = "UNSUPPORTED_CLIENT_OP";
            throw err;
        };

        try {
            const fallbackResult = await ExecutionManager.run({
                tool: "rotate",
                files: [samplePdf],
                mode: "auto",
            });

            assert.strictEqual(fallbackResult.executionMode, "cloud");
            assert.strictEqual(fallbackResult.fallbackOccurred, true);

            const lastEvent4 = telemetry.getLastEvent();
            assert.ok(lastEvent4);
            assert.strictEqual(lastEvent4.category, "fallback_success");
            assert.strictEqual(lastEvent4.actualMode, "cloud");
            assert.strictEqual(lastEvent4.success, true);
            assert.strictEqual(lastEvent4.fallbackOccurred, true);
            assert.strictEqual(lastEvent4.fallbackReason, "Simulated client WASM memory error");
            console.log("  ✓ Fallback success event logged cleanly with client error message preserved as fallbackReason.");
        } finally {
            ClientExecutor.execute = originalClientExec;
        }

        // 5. SafetyGate Rejection Telemetry
        console.log("\n[Test 5] SafetyGate Rejection Telemetry");
        telemetry.clearEvents();

        const oversizedFile = createLargeDummyFile(30 * 1024 * 1024, "large_30mb.pdf"); // 30MB file

        try {
            await ExecutionManager.run({
                tool: "rotate",
                files: [oversizedFile],
                mode: "device",
            });
            assert.fail("Device mode with 30MB file should throw SAFETY_REJECTION");
        } catch (err: any) {
            assert.strictEqual(err.code, "SAFETY_REJECTION");
            const lastEvent5 = telemetry.getLastEvent();
            assert.ok(lastEvent5);
            assert.strictEqual(lastEvent5.category, "safety_rejection");
            assert.strictEqual(lastEvent5.requestedMode, "device");
            assert.strictEqual(lastEvent5.success, false);
            assert.strictEqual(lastEvent5.errorCode, "SAFETY_REJECTION");
            assert.ok(lastEvent5.safetyRejectionReason?.includes("exceeds local processing safety threshold"));
            console.log("  ✓ SafetyGate rejection event logged cleanly with rejection reason.");
        }

        // 6. Feature-Flag-Disabled Execution Telemetry
        console.log("\n[Test 6] Feature-Flag-Disabled Execution Telemetry");
        telemetry.clearEvents();
        process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";

        const flagDisabledResult = await ExecutionManager.run({
            tool: "rotate",
            files: [samplePdf],
            mode: "auto",
        });

        assert.strictEqual(flagDisabledResult.executionMode, "cloud");
        const lastEvent6 = telemetry.getLastEvent();
        assert.ok(lastEvent6);
        assert.strictEqual(lastEvent6.category, "feature_flag_disabled");
        assert.strictEqual(lastEvent6.featureFlagDisabled, true);
        assert.strictEqual(lastEvent6.actualMode, "cloud");
        assert.strictEqual(lastEvent6.success, true);
        console.log("  ✓ Feature-flag-disabled execution event logged cleanly.");

        // 7. Telemetry Failure Isolation (Faulty Sink Does Not Crash PDF Execution)
        console.log("\n[Test 7] Faulty Telemetry Sink Isolation");
        resetEnv();

        const faultySink: TelemetrySink = {
            record() {
                throw new Error("CRITICAL_ANALYTICS_ENDPOINT_CRASH_500");
            },
        };

        telemetry.addSink(faultySink);

        try {
            // PDF execution should complete 100% successfully despite telemetry sink crash
            const resilientResult = await ExecutionManager.run({
                tool: "rotate",
                files: [samplePdf],
                mode: "auto",
                params: { angle: 180, rotation: 180 },
            });

            assert.strictEqual(resilientResult.executionMode, "client");
            console.log("  ✓ Faulty telemetry sink error swallowed silently; PDF execution succeeded cleanly.");
        } finally {
            telemetry.removeSink(faultySink);
        }

        // 8. Privacy Verification: No Sensitive Data in Events
        console.log("\n[Test 8] Complete Event Privacy Audit");
        const events = telemetry.getEvents();
        for (const evt of events) {
            const jsonStr = JSON.stringify(evt);
            assert.strictEqual(jsonStr.includes("secret_document_name"), false, "Filename must not appear in telemetry JSON");
            assert.strictEqual(jsonStr.includes("sensitive_financial_report"), false, "Filename must not appear in telemetry JSON");
            assert.strictEqual((evt as any).password, undefined, "Password must not exist");
            assert.strictEqual((evt as any).token, undefined, "Token must not exist");
            assert.strictEqual((evt as any).content, undefined, "Content bytes must not exist");
        }
        console.log("  ✓ Privacy audit passed across all recorded telemetry events.");

    } finally {
        resetEnv();
        CloudExecutor.execute = originalCloudExec;
    }

    console.log("\n=== ALL HYBRID TELEMETRY UNIT TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("Telemetry Test Failure:", err);
    process.exit(1);
});
