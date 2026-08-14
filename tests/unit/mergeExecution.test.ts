import { PDFDocument, PDFName } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "../../lib/execution/types";

async function createDummyPdf(pageCount = 2, title?: string): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([600, 400]);
    }
    if (title) {
        pdfDoc.setTitle(title);
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], `${title || "doc"}.pdf`, { type: "application/pdf" });
}

export async function runMergeExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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
    console.log("   RUNNING WAVE 2 MERGE PDF HYBRID UNIT TESTS    ");
    console.log("=================================================\n");

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const fileA = await createDummyPdf(2, "Primary Document A");
        const fileB = await createDummyPdf(3, "Secondary Document B");
        const fileC = await createDummyPdf(1, "Tertiary Document C");

        // Test 1: Implementation Support Detection
        assert(
            ClientExecutor.isSupported("merge") === true,
            "1. ClientExecutor.isSupported('merge') evaluates true"
        );

        // Test 2: Standard 2-PDF Merge locally
        cloudCallCount = 0;
        const res2 = await ExecutionManager.run({
            tool: "merge",
            files: [fileA, fileB],
            mode: "auto",
        });
        const doc2 = await PDFDocument.load(await res2.blob.arrayBuffer());
        assert(
            res2.executionMode === "client" && doc2.getPageCount() === 5 && cloudCallCount === 0,
            "2. Standard 2-PDF Merge combines pages locally with 0 cloud calls (output: 5 pages)"
        );

        // Test 3: Standard 3-PDF Merge locally
        cloudCallCount = 0;
        const res3 = await ExecutionManager.run({
            tool: "merge",
            files: [fileA, fileB, fileC],
            mode: "auto",
        });
        const doc3 = await PDFDocument.load(await res3.blob.arrayBuffer());
        assert(
            res3.executionMode === "client" && doc3.getPageCount() === 6 && cloudCallCount === 0,
            "3. Standard 3-PDF Merge combines pages locally with 0 cloud calls (output: 6 pages)"
        );

        // Test 4: Primary Document Metadata Preservation
        assert(
            doc3.getTitle() === "Primary Document A",
            "4. Merged document inherits Title from primary (first) input document"
        );

        // Test 5: Password-Protected Input -> Option B Cloud Route
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(2, "Protected");
        (protectedFile as any).originalPassword = "pass123Secret";
        const resProtected = await ExecutionManager.run({
            tool: "merge",
            files: [fileA, protectedFile],
            mode: "auto",
        });
        assert(
            resProtected.executionMode === "cloud" && cloudCallCount === 1,
            "5. Password-protected input automatically routes Merge to Cloud (Option B)"
        );

        // Test 6: PDF containing AcroForm -> Automatic Cloud Fallback
        cloudCallCount = 0;
        const formPdfDoc = await PDFDocument.create();
        formPdfDoc.addPage();
        const formDict = formPdfDoc.context.obj({ Fields: [] });
        formPdfDoc.catalog.set(PDFName.of("AcroForm"), formDict);
        const formBytes = await formPdfDoc.save();
        const formFile = new File([new Blob([formBytes.buffer as ArrayBuffer])], "form.pdf", { type: "application/pdf" });

        const resForm = await ExecutionManager.run({
            tool: "merge",
            files: [fileA, formFile],
            mode: "auto",
        });
        assert(
            resForm.executionMode === "cloud" && cloudCallCount === 1,
            "6. PDF containing AcroForm catalog structure automatically falls back to Cloud"
        );

        // Test 7: Invalid PDF Header -> Throws INVALID_INPUT Error
        cloudCallCount = 0;
        const badFile = new File([new Blob(["NOT_PDF_HEADER"])], "bad.pdf", { type: "application/pdf" });
        let caughtErr: ExecutionError | null = null;
        try {
            await ExecutionManager.run({
                tool: "merge",
                files: [fileA, badFile],
                mode: "auto",
            });
        } catch (err: any) {
            caughtErr = err;
        }
        assert(
            caughtErr !== null && caughtErr.code === "INVALID_INPUT" && cloudCallCount === 0,
            "7. Invalid PDF header throws INVALID_INPUT error without Cloud fallback"
        );

        // Test 8: Cloud Mode Explicit Invocation
        cloudCallCount = 0;
        const resCloud = await ExecutionManager.run({
            tool: "merge",
            files: [fileA, fileB],
            mode: "cloud",
        });
        assert(
            resCloud.executionMode === "cloud" && cloudCallCount === 1,
            "8. Explicit Cloud mode invokes CloudExecutor (1 cloud call)"
        );
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log(`\n=================================================`);
    console.log(`   MERGE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================\n`);

    return { passed, failed, errors };
}
