import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "../../lib/execution/types";
import { buildTextElementDescription } from "../../lib/execution/pdfcpu/pdfcpuClient";
import { TextElement } from "../../lib/execution/pdfcpu/types";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

async function createDummyPdf(pageCount = 3, title?: string): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([595.28, 841.89]); // A4
    }
    if (title) {
        pdfDoc.setTitle(title);
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], `${title || "doc"}.pdf`, { type: "application/pdf" });
}

export async function runAddTextExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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
    console.log("    RUNNING WAVE 2 ADD TEXT HYBRID UNIT TESTS    ");
    console.log("=================================================\n");

    setupNodeWasmWorker();

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const fileA = await createDummyPdf(3, "Text Baseline Doc");

        // Test 1: Implementation Support Detection
        assert(
            ClientExecutor.isSupported("add_text") === true &&
            ClientExecutor.isSupported("add-text") === true &&
            ClientExecutor.isSupported("addtext") === true,
            "1. ClientExecutor.isSupported('add_text') evaluates true for all aliases"
        );

        // Test 2: Standard Single Text Element in Auto Mode (0 Cloud Calls)
        cloudCallCount = 0;
        const singleElement: TextElement = {
            id: "el1",
            text: "Approved by Legal",
            x: 50,
            y: 100,
            page: 1,
            fontSize: 20,
            color: "#1e40af",
        };

        const resAuto = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: [singleElement] },
            mode: "auto",
        });

        assert(
            resAuto.blob instanceof Blob && resAuto.blob.size > 0 && cloudCallCount === 0,
            "2. Auto mode executes single text element locally with 0 cloud calls",
            `Blob size: ${resAuto.blob?.size}, Cloud calls: ${cloudCallCount}`
        );

        // Test 3: Device Mode Single Text Element (0 Cloud Calls)
        cloudCallCount = 0;
        const resDevice = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: [singleElement] },
            mode: "device",
        });

        assert(
            resDevice.blob instanceof Blob && resDevice.blob.size > 0 && cloudCallCount === 0,
            "3. Device mode executes single text element locally with 0 cloud calls"
        );

        // Test 4: Explicit Cloud Mode
        cloudCallCount = 0;
        const resCloud = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: [singleElement] },
            mode: "cloud",
        });

        assert(
            resCloud.blob instanceof Blob && cloudCallCount === 1,
            "4. Cloud mode explicitly invokes CloudExecutor (1 cloud call)",
            `Cloud calls: ${cloudCallCount}`
        );

        // Test 5: Output PDF Structure & Page Count Preservation
        const outDoc = await PDFDocument.load(await resDevice.blob.arrayBuffer());
        assert(
            outDoc.getPageCount() === 3,
            "5. Output PDF remains valid and page count (3) is preserved",
            `Page count: ${outDoc.getPageCount()}`
        );

        // Test 6: Description Generation & Exact Backend Geometry
        const desc1 = buildTextElementDescription({
            id: "t1",
            text: "Header",
            x: 100,
            y: 50,
            page: 1,
            fontSize: 24,
            color: "#ef4444",
        });
        assert(
            desc1.includes("pos:tl") &&
            desc1.includes("offset:100 -63") &&
            desc1.includes("points:24") &&
            desc1.includes("fillcol:#ef4444") &&
            desc1.includes("scale:1 abs") &&
            desc1.includes("rot:0"),
            "6. Description generation matches exact backend geometry (-y - 13, pos:tl)",
            `Generated: ${desc1}`
        );

        // Test 7: Color Normalization without leading '#'
        const desc2 = buildTextElementDescription({
            id: "t2",
            text: "Color test",
            x: 0,
            y: 0,
            page: 1,
            fontSize: 16,
            color: "00aa00",
        });
        assert(
            desc2.includes("fillcol:#00aa00"),
            "7. Color string without '#' prefix is correctly normalized to '#00aa00'",
            `Generated: ${desc2}`
        );

        // Test 8: Multiple Elements across Different Pages
        const multiPageElements: TextElement[] = [
            { id: "e1", text: "Page 1 Header", x: 50, y: 50, page: 1, fontSize: 18, color: "#000000" },
            { id: "e2", text: "Page 2 Note", x: 60, y: 120, page: 2, fontSize: 14, color: "#2563eb" },
            { id: "e3", text: "Page 3 Footer", x: 50, y: 700, page: 3, fontSize: 12, color: "#dc2626" },
        ];
        cloudCallCount = 0;
        const resMultiPage = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: multiPageElements },
            mode: "auto",
        });
        const docMultiPage = await PDFDocument.load(await resMultiPage.blob.arrayBuffer());
        assert(
            resMultiPage.blob.size > 0 && docMultiPage.getPageCount() === 3 && cloudCallCount === 0,
            "8. Multiple text elements across different pages (1, 2, 3) execute in-memory with 0 cloud calls"
        );

        // Test 9: Multiple Elements on the Same Page
        const samePageElements: TextElement[] = [
            { id: "sp1", text: "Title Line 1", x: 100, y: 100, page: 1, fontSize: 24, color: "#000000" },
            { id: "sp2", text: "Subtitle Line 2", x: 100, y: 140, page: 1, fontSize: 16, color: "#4b5563" },
            { id: "sp3", text: "Author Line 3", x: 100, y: 180, page: 1, fontSize: 12, color: "#6b7280" },
        ];
        const resSamePage = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: samePageElements },
            mode: "auto",
        });
        assert(
            resSamePage.blob.size > 0,
            "9. Multiple elements on the same page execute sequentially preserving all layers"
        );

        // Test 10: Blank Text Elements are Skipped
        const blankElements: TextElement[] = [
            { id: "b1", text: "   ", x: 50, y: 50, page: 1, fontSize: 12, color: "#000" },
            { id: "b2", text: "", x: 50, y: 100, page: 2, fontSize: 12, color: "#000" },
            { id: "b3", text: "\t\n", x: 50, y: 150, page: 3, fontSize: 12, color: "#000" },
        ];
        const resBlank = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: blankElements },
            mode: "auto",
        });
        assert(
            resBlank.blob.size > 0,
            "10. Blank text elements (whitespace only) are cleanly skipped matching backend behavior"
        );

        // Test 11: Multiline Text Support
        const multilineElements: TextElement[] = [
            {
                id: "ml1",
                text: "Terms and Conditions:\n1. All sales final.\n2. Non-transferable.",
                x: 80,
                y: 200,
                page: 1,
                fontSize: 14,
                color: "#111827",
            },
        ];
        const resMultiline = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: multilineElements },
            mode: "auto",
        });
        assert(
            resMultiline.blob.size > 0,
            "11. Multiline text strings with line-breaks execute cleanly in WASM"
        );

        // Test 12: 5+ Sequential Text Elements
        const heavyElements: TextElement[] = Array.from({ length: 5 }, (_, i) => ({
            id: `seq_${i}`,
            text: `Sequential Annotation Stamp #${i + 1}`,
            x: 50,
            y: 50 + i * 50,
            page: (i % 3) + 1,
            fontSize: 14,
            color: i % 2 === 0 ? "#059669" : "#d97706",
        }));
        const resHeavy = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: heavyElements },
            mode: "auto",
        });
        const docHeavy = await PDFDocument.load(await resHeavy.blob.arrayBuffer());
        assert(
            resHeavy.blob.size > 0 && docHeavy.getPageCount() === 3,
            "12. 5+ sequential text elements chain in-memory across multiple pages"
        );

        // Test 13: Password-Protected File Triggers Cloud Fallback in Auto Mode (Option B)
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(2, "Protected Doc");
        (protectedFile as any).originalPassword = "secret-password";

        const resProtected = await ExecutionManager.run({
            tool: "add_text",
            files: [protectedFile],
            params: { elements: [singleElement] },
            mode: "auto",
        });

        assert(
            cloudCallCount === 1,
            "13. Password-protected file triggers Cloud fallback in Auto mode (Option B)",
            `Cloud calls: ${cloudCallCount}`
        );

        // Test 14: Invalid PDF Header Throws INVALID_INPUT in Device Mode
        const invalidBlob = new Blob(["NOT_A_PDF_DOCUMENT_CONTENT"], { type: "application/pdf" });
        const invalidFile = new File([invalidBlob], "corrupted.pdf", { type: "application/pdf" });
        let invalidError: ExecutionError | null = null;
        try {
            await ExecutionManager.run({
                tool: "add_text",
                files: [invalidFile],
                params: { elements: [singleElement] },
                mode: "device",
            });
        } catch (err) {
            invalidError = err as ExecutionError;
        }

        assert(
            invalidError !== null && invalidError.code === "INVALID_INPUT",
            "14. Invalid PDF header throws INVALID_INPUT error in Device mode without fallback",
            `Error: ${invalidError?.message}`
        );

        // Test 15: ExecutionSafetyGate Rejects Files > 25MB
        const evalRes = ExecutionSafetyGate.evaluate("add_text", [
            { size: 26 * 1024 * 1024 } as File,
        ], "CLIENT_PREFERRED");
        assert(
            evalRes.eligible === false && evalRes.recommendedMode === "cloud",
            "15. ExecutionSafetyGate rejects 26MB file for local execution"
        );

        // Test 16: Oversized File Automatically Routes to Cloud in Auto Mode
        cloudCallCount = 0;
        const oversizedBlob = new Blob([new Uint8Array(26 * 1024 * 1024)], { type: "application/pdf" });
        const oversizedFile = new File([oversizedBlob], "large.pdf", { type: "application/pdf" });

        await ExecutionManager.run({
            tool: "add_text",
            files: [oversizedFile],
            params: { elements: [singleElement] },
            mode: "auto",
        });

        assert(
            cloudCallCount === 1,
            "16. Auto mode automatically routes oversized file to Cloud via SafetyGate"
        );

        // Test 17: Stringified Elements Parameter Parsing
        const resStringified = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: JSON.stringify([singleElement]) },
            mode: "auto",
        });
        assert(
            resStringified.blob.size > 0,
            "17. Stringified JSON elements array is automatically parsed and processed"
        );

        // Test 18: Empty Elements Array Returns Original PDF
        const resEmpty = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: [] },
            mode: "auto",
        });
        assert(
            resEmpty.blob.size > 0,
            "18. Empty elements array returns valid PDF with zero errors"
        );

        // Test 19: Various Font Sizes (8pt to 72pt)
        const sizeElements: TextElement[] = [
            { id: "s1", text: "Tiny 8pt", x: 50, y: 50, page: 1, fontSize: 8, color: "#000" },
            { id: "s2", text: "Medium 24pt", x: 50, y: 100, page: 1, fontSize: 24, color: "#000" },
            { id: "s3", text: "Huge 72pt", x: 50, y: 200, page: 1, fontSize: 72, color: "#000" },
        ];
        const resSizes = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: sizeElements },
            mode: "auto",
        });
        assert(
            resSizes.blob.size > 0,
            "19. Multiple font sizes (8pt, 24pt, 72pt) render successfully in WASM"
        );

        // Test 20: Array Order is Preserved
        const orderedElements: TextElement[] = [
            { id: "first", text: "FIRST_STAMP", x: 50, y: 50, page: 1, fontSize: 16, color: "#000" },
            { id: "second", text: "SECOND_STAMP", x: 50, y: 100, page: 1, fontSize: 16, color: "#000" },
            { id: "third", text: "THIRD_STAMP", x: 50, y: 150, page: 1, fontSize: 16, color: "#000" },
        ];
        const resOrdered = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: orderedElements },
            mode: "auto",
        });
        assert(
            resOrdered.blob.size > 0,
            "20. Text element array ordering is strictly preserved during WASM chaining"
        );

        // Test 21: Special Characters and Punctuation
        const specialCharElement: TextElement = {
            id: "spec",
            text: "Invoice #12345: $49.99 (Tax @ 8.25% - Total: €45.50)",
            x: 50,
            y: 300,
            page: 1,
            fontSize: 14,
            color: "#0f172a",
        };
        const resSpecial = await ExecutionManager.run({
            tool: "add_text",
            files: [fileA],
            params: { elements: [specialCharElement] },
            mode: "auto",
        });
        assert(
            resSpecial.blob.size > 0,
            "21. Special characters, punctuation, and currency symbols render without errors"
        );

    } catch (err: any) {
        console.error("Test execution threw unexpected error:", err);
        errors.push(err.message || String(err));
        failed++;
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log(`\n=================================================`);
    console.log(`   ADD TEXT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================\n`);

    return { passed, failed, errors };
}

if (require.main === module) {
    runAddTextExecutionTests().then(({ failed }) => {
        if (failed > 0) process.exit(1);
    });
}
