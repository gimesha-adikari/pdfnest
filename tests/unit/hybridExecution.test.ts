import { degrees, PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { isClientExecutionEnabled } from "../../lib/execution/flags";
import { ExecutionError } from "../../lib/execution/types";

// Helper function to create dummy PDF file
async function createDummyPdf(pageCount = 3, initialRotation = 0): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.addPage([600, 400]);
        if (initialRotation > 0) {
            page.setRotation(degrees(initialRotation));
        }
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], "test-document.pdf", { type: "application/pdf" });
}

export async function runHybridExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    async function assert(condition: boolean, testName: string, detail?: string) {
        if (condition) {
            passed++;
            console.log(`✓ [PASS] ${testName}`);
        } else {
            failed++;
            const msg = `✗ [FAIL] ${testName}${detail ? `: ${detail}` : ""}`;
            console.error(msg);
            errors.push(msg);
        }
    }

    console.log("=================================================");
    console.log("   RUNNING HYBRID EXECUTION & ROTATE PILOT TESTS ");
    console.log("=================================================\n");

    // Enable feature flags for testing
    process.env.NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED = "true";
    process.env.NEXT_PUBLIC_TOOL_ROTATE_CLIENT = "true";

    // Mock CloudExecutor to track calls without real network requests
    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        // Test 1: Feature Flag Helper
        assert(
            isClientExecutionEnabled("rotate") === true,
            "1. Feature flag isClientExecutionEnabled('rotate') evaluates true when env flags enabled"
        );

        // Test 2: Safety Gate - Normal File
        const normalFile = await createDummyPdf(3);
        const safetyEval = ExecutionSafetyGate.evaluate("rotate", [normalFile], "CLIENT_PREFERRED");
        assert(
            safetyEval.eligible === true && safetyEval.recommendedMode === "client",
            "2. ExecutionSafetyGate approves 3-page 10KB PDF for client execution"
        );

        // Test 3: Auto Mode + Normal PDF -> Client Execution (Zero Cloud calls)
        cloudCallCount = 0;
        const res3 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res3.executionMode === "client" && res3.fallbackOccurred === false && cloudCallCount === 0,
            "3. Auto mode executes client-side for normal PDF with 0 cloud calls"
        );

        // Test 4: Device Mode + Normal PDF -> Client Execution
        cloudCallCount = 0;
        const res4 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "2": 180 } },
            mode: "device",
        });
        assert(
            res4.executionMode === "client" && res4.fallbackOccurred === false && cloudCallCount === 0,
            "4. Device mode executes client-side with 0 cloud calls"
        );

        // Test 5: Cloud Mode -> Forces Cloud Execution
        cloudCallCount = 0;
        const res5 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "cloud",
        });
        assert(
            res5.executionMode === "cloud" && cloudCallCount === 1,
            "5. Cloud mode explicitly invokes CloudExecutor (1 cloud call)"
        );

        // Test 6: Cumulative Relative Rotation (90 + 90 = 180)
        const initial90Doc = await createDummyPdf(1, 90);
        const rotatedBlob = await ClientExecutor.execute({
            tool: "rotate",
            files: [initial90Doc],
            params: { rotations: { "1": 90 } },
            mode: "client" as any,
        });
        const reloadedDoc = await PDFDocument.load(await rotatedBlob.arrayBuffer());
        const finalAngle = reloadedDoc.getPages()[0].getRotation().angle;
        assert(
            finalAngle === 180,
            "6. ClientExecutor calculates relative rotation correctly (90° initial + 90° added = 180°)"
        );

        // Test 7: Invalid PDF Header -> Rejection without Cloud Call
        cloudCallCount = 0;
        const invalidFile = new File([new TextEncoder().encode("NOT A PDF FILE")], "invalid.pdf", { type: "application/pdf" });
        let caughtError: ExecutionError | null = null;
        try {
            await ExecutionManager.run({
                tool: "rotate",
                files: [invalidFile],
                params: { rotations: { "1": 90 } },
                mode: "auto",
            });
        } catch (err: any) {
            caughtError = err;
        }
        assert(
            caughtError !== null && caughtError.code === "INVALID_INPUT" && cloudCallCount === 0,
            "7. Invalid PDF header throws INVALID_INPUT error and does NOT trigger Cloud fallback"
        );

        // Test 8: Password-Protected PDF -> Option B Routes to Cloud for Server Relock Pipeline
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(1);
        (protectedFile as any).originalPassword = "secret123";
        const res8 = await ExecutionManager.run({
            tool: "rotate",
            files: [protectedFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res8.executionMode === "cloud" && cloudCallCount === 1,
            "8. Password-protected file automatically routes to Cloud (Option B) to preserve server relock pipeline"
        );

        // Test 9: Safety Gate Rejection on Oversized File
        const hugeFile = new File([new Uint8Array(30 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
        const hugeSafety = ExecutionSafetyGate.evaluate("rotate", [hugeFile], "CLIENT_PREFERRED");
        assert(
            hugeSafety.eligible === false && hugeSafety.recommendedMode === "cloud",
            "9. ExecutionSafetyGate rejects 30MB file for local client execution"
        );

        // Test 10: Auto Mode + Oversized File -> Routes to Cloud
        cloudCallCount = 0;
        const res10 = await ExecutionManager.run({
            tool: "rotate",
            files: [hugeFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res10.executionMode === "cloud" && cloudCallCount === 1,
            "10. Auto mode automatically routes 30MB oversized file to Cloud"
        );

        // Test 11: Feature Flag Global Override -> Forces Cloud
        process.env.NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED = "false";
        cloudCallCount = 0;
        const res11 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res11.executionMode === "cloud" && cloudCallCount === 1,
            "11. Setting NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED=false forces Cloud execution"
        );
        process.env.NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED = "true"; // Restore

        // Test 12: Tool-Specific Flag Override -> Forces Cloud
        process.env.NEXT_PUBLIC_TOOL_ROTATE_CLIENT = "false";
        cloudCallCount = 0;
        const res12 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res12.executionMode === "cloud" && cloudCallCount === 1,
            "12. Setting NEXT_PUBLIC_TOOL_ROTATE_CLIENT=false forces Cloud execution for Rotate"
        );
        process.env.NEXT_PUBLIC_TOOL_ROTATE_CLIENT = "true"; // Restore
    } finally {
        // Restore CloudExecutor
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log(`\n=================================================`);
    console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================\n`);

    return { passed, failed, errors };
}
