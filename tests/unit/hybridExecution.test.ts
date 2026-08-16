import { degrees, PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "../../lib/execution/types";

async function createDummyPdf(pageCount = 3): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([600, 400]);
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], "sample.pdf", { type: "application/pdf" });
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

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        // Test 1: Implementation Support Check
        assert(
            ClientExecutor.isSupported("rotate") === true,
            "1. ClientExecutor.isSupported('rotate') evaluates true based on code implementation"
        );

        // Test 2: Safety Gate - Normal File
        const normalFile = await createDummyPdf(3);
        const safetyEval = ExecutionSafetyGate.evaluate("rotate", [normalFile], "CLIENT_PREFERRED");
        assert(
            safetyEval.eligible === true && safetyEval.recommendedMode === "client",
            "2. ExecutionSafetyGate approves 3-page 10KB PDF for client execution"
        );

        // Test 3: Auto Mode -> Client Execution (Normal File)
        cloudCallCount = 0;
        const res3 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res3.executionMode === "client" && cloudCallCount === 0 && res3.fallbackOccurred === false,
            "3. Auto mode executes client-side for normal PDF with 0 cloud calls"
        );

        // Test 4: Device Mode -> Client Execution (Normal File)
        cloudCallCount = 0;
        const res4 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "device",
        });
        assert(
            res4.executionMode === "client" && cloudCallCount === 0 && res4.fallbackOccurred === false,
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

        // Test 6: ClientExecutor Logic Verification (Rotate Page 1 by 90deg)
        cloudCallCount = 0;
        const res6 = await ExecutionManager.run({
            tool: "rotate",
            files: [normalFile],
            params: { rotations: { "1": 90 } },
            mode: "device",
        });
        const rotatedDoc = await PDFDocument.load(await res6.blob.arrayBuffer());
        const page1Rot = rotatedDoc.getPage(0).getRotation().angle;
        assert(
            page1Rot === 90,
            `6. ClientExecutor calculates relative rotation correctly (output angle: ${page1Rot}°)`
        );

        // Test 7: Invalid PDF Header -> Throws INVALID_INPUT (No Cloud Fallback)
        cloudCallCount = 0;
        const badFile = new File([new Blob(["NOT_A_PDF_HEADER"])], "bad.pdf", { type: "application/pdf" });
        let caughtErr: ExecutionError | null = null;
        try {
            await ExecutionManager.run({
                tool: "rotate",
                files: [badFile],
                params: { rotations: { "1": 90 } },
                mode: "auto",
            });
        } catch (err: any) {
            caughtErr = err;
        }
        assert(
            caughtErr !== null && caughtErr.code === "INVALID_INPUT" && cloudCallCount === 0,
            "7. Invalid PDF header throws INVALID_INPUT error and does NOT trigger Cloud fallback"
        );

        // Test 8: Password-Protected File -> Option B Cloud Fallback
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(3);
        (protectedFile as any).originalPassword = "secretPassword123";
        const res8 = await ExecutionManager.run({
            tool: "rotate",
            files: [protectedFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res8.executionMode === "cloud" && cloudCallCount === 1 && res8.fallbackOccurred === true,
            "8. Password-protected file automatically routes to Cloud (Option B) to preserve server relock pipeline"
        );

        // Test 9: Safety Gate Rejection - Oversized File (30MB)
        const bigFile = new File([new ArrayBuffer(30 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
        const safetyEvalBig = ExecutionSafetyGate.evaluate("rotate", [bigFile], "CLIENT_PREFERRED");
        assert(
            safetyEvalBig.eligible === false,
            "9. ExecutionSafetyGate rejects 30MB file for local client execution"
        );

        // Test 10: Auto Mode + Oversized File -> Auto Cloud Routing
        cloudCallCount = 0;
        const res10 = await ExecutionManager.run({
            tool: "rotate",
            files: [bigFile],
            params: { rotations: { "1": 90 } },
            mode: "auto",
        });
        assert(
            res10.executionMode === "cloud" && cloudCallCount === 1,
            "10. Auto mode automatically routes 30MB oversized file to Cloud"
        );

        // Test 11: Unimplemented Client Tool -> Automatically Routes to Cloud
        cloudCallCount = 0;
        const res11 = await ExecutionManager.run({
            tool: "word_to_pdf",
            files: [normalFile],
            params: {},
            mode: "auto",
        });
        assert(
            res11.executionMode === "cloud" && cloudCallCount === 1,
            "11. Unimplemented client tool ('word_to_pdf') automatically routes to Cloud"
        );
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log(`\n=================================================`);
    console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================\n`);

    return { passed, failed, errors };
}
