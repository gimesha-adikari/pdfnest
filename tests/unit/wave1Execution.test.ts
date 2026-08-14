import { degrees, PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { isClientExecutionEnabled } from "../../lib/execution/flags";
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

export async function runWave1ExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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
    console.log("   RUNNING WAVE 1 HYBRID EXECUTION UNIT TESTS     ");
    console.log("=================================================\n");

    // Enable feature flags for Wave 1 testing
    process.env.NEXT_PUBLIC_HYBRID_PROCESSING_ENABLED = "true";
    process.env.NEXT_PUBLIC_TOOL_SPLIT_CLIENT = "true";
    process.env.NEXT_PUBLIC_TOOL_DELETE_CLIENT = "true";
    process.env.NEXT_PUBLIC_TOOL_REORDER_CLIENT = "true";
    process.env.NEXT_PUBLIC_TOOL_INSERT_BLANK_CLIENT = "true";
    process.env.NEXT_PUBLIC_TOOL_DUPLICATE_CLIENT = "true";
    process.env.NEXT_PUBLIC_TOOL_UPDATE_METADATA_CLIENT = "true";

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const samplePdf = await createDummyPdf(3);

        // Test 1: Feature Flag Helper for Wave 1 tools
        assert(
            isClientExecutionEnabled("split") && isClientExecutionEnabled("delete_pages"),
            "1. Feature flags for Wave 1 tools (split, delete_pages) evaluate true when env enabled"
        );

        // Test 2: Split PDF (Extract Pages 1-2 from 3-page PDF)
        cloudCallCount = 0;
        const resSplit = await ExecutionManager.run({
            tool: "split",
            files: [samplePdf],
            params: { pages: "1-2" },
            mode: "auto",
        });
        const docSplit = await PDFDocument.load(await resSplit.blob.arrayBuffer());
        assert(
            resSplit.executionMode === "client" && docSplit.getPageCount() === 2 && cloudCallCount === 0,
            "2. Split PDF extracts pages 1-2 locally with 0 cloud calls (output: 2 pages)"
        );

        // Test 3: Delete Pages (Delete Page 2 from 3-page PDF)
        cloudCallCount = 0;
        const resDelete = await ExecutionManager.run({
            tool: "delete",
            files: [samplePdf],
            params: { pages: "2" },
            mode: "auto",
        });
        const docDelete = await PDFDocument.load(await resDelete.blob.arrayBuffer());
        assert(
            resDelete.executionMode === "client" && docDelete.getPageCount() === 2 && cloudCallCount === 0,
            "3. Delete Pages removes page 2 locally with 0 cloud calls (output: 2 pages)"
        );

        // Test 4: Reorder Pages (Sequence "3, 1, 2")
        cloudCallCount = 0;
        const resReorder = await ExecutionManager.run({
            tool: "reorder",
            files: [samplePdf],
            params: { sequence: "3, 1, 2" },
            mode: "auto",
        });
        const docReorder = await PDFDocument.load(await resReorder.blob.arrayBuffer());
        assert(
            resReorder.executionMode === "client" && docReorder.getPageCount() === 3 && cloudCallCount === 0,
            "4. Reorder Pages re-sequences pages locally with 0 cloud calls (output: 3 pages)"
        );

        // Test 5: Insert Blank Page (Insert 1 blank page)
        cloudCallCount = 0;
        const resInsert = await ExecutionManager.run({
            tool: "insert_blank",
            files: [samplePdf],
            params: { page: 2 },
            mode: "auto",
        });
        const docInsert = await PDFDocument.load(await resInsert.blob.arrayBuffer());
        assert(
            resInsert.executionMode === "client" && docInsert.getPageCount() === 4 && cloudCallCount === 0,
            "5. Insert Blank Page adds a page locally with 0 cloud calls (output: 4 pages)"
        );

        // Test 6: Duplicate Pages (Duplicate page 1)
        cloudCallCount = 0;
        const resDup = await ExecutionManager.run({
            tool: "duplicate",
            files: [samplePdf],
            params: { page: "1" },
            mode: "auto",
        });
        const docDup = await PDFDocument.load(await resDup.blob.arrayBuffer());
        assert(
            resDup.executionMode === "client" && docDup.getPageCount() === 4 && cloudCallCount === 0,
            "6. Duplicate Pages clones target page locally with 0 cloud calls (output: 4 pages)"
        );

        // Test 7: Update Metadata (Set Title & Author)
        cloudCallCount = 0;
        const resMeta = await ExecutionManager.run({
            tool: "update_metadata",
            files: [samplePdf],
            params: { metadata: { title: "New Document Title", author: "Jane Doe" } },
            mode: "auto",
        });
        const docMeta = await PDFDocument.load(await resMeta.blob.arrayBuffer());
        assert(
            resMeta.executionMode === "client" &&
                docMeta.getTitle() === "New Document Title" &&
                docMeta.getAuthor() === "Jane Doe" &&
                cloudCallCount === 0,
            "7. Update Metadata writes document properties locally with 0 cloud calls"
        );

        // Test 8: Password-Protected PDF on Split -> Option B Cloud Route
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(3);
        (protectedFile as any).originalPassword = "secretPass123";
        const resProtected = await ExecutionManager.run({
            tool: "split",
            files: [protectedFile],
            params: { pages: "1" },
            mode: "auto",
        });
        assert(
            resProtected.executionMode === "cloud" && cloudCallCount === 1,
            "8. Password-protected file on Split automatically routes to Cloud (Option B)"
        );

        // Test 9: Device Mode + Delete All Pages Rejection
        let caughtErr: ExecutionError | null = null;
        try {
            await ExecutionManager.run({
                tool: "delete",
                files: [samplePdf],
                params: { pages: "1-3" },
                mode: "device",
            });
        } catch (err: any) {
            caughtErr = err;
        }
        assert(
            caughtErr !== null && caughtErr.code === "INVALID_INPUT",
            "9. Attempting to delete ALL pages throws INVALID_INPUT error in Device mode"
        );

        // Test 10: Tool Flag Disabled -> Cloud Execution
        process.env.NEXT_PUBLIC_TOOL_SPLIT_CLIENT = "false";
        cloudCallCount = 0;
        const resDisabled = await ExecutionManager.run({
            tool: "split",
            files: [samplePdf],
            params: { pages: "1" },
            mode: "auto",
        });
        assert(
            resDisabled.executionMode === "cloud" && cloudCallCount === 1,
            "10. Disabling NEXT_PUBLIC_TOOL_SPLIT_CLIENT=false forces Cloud execution"
        );
        process.env.NEXT_PUBLIC_TOOL_SPLIT_CLIENT = "true";
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log(`\n=================================================`);
    console.log(`   WAVE 1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================\n`);

    return { passed, failed, errors };
}
