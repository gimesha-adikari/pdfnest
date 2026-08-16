import assert from "assert";
import { PDFDocument, degrees } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import {
    executeMarkup,
    groupWordsByLine,
    hexToRgb,
    ExtractedWord,
} from "@/lib/execution/markup/markupClient";

async function runMarkupUnitTests() {
    console.log("=================================================");
    console.log("    RUNNING MARKUP SUITE (WAVE 7) UNIT TESTS     ");
    console.log("=================================================");

    // Helper: Create a sample text PDF in memory
    async function createTestPdf(pages = 2, width = 600, height = 800, rotation = 0): Promise<File> {
        const doc = await PDFDocument.create();
        for (let i = 0; i < pages; i++) {
            const page = doc.addPage([width, height]);
            if (rotation !== 0) {
                page.setRotation(degrees(rotation));
            }
            page.drawText(`Page ${i + 1} Title Header`, { x: 50, y: height - 60, size: 14 });
            page.drawText(`This is line 1 for markup testing.`, { x: 50, y: height - 100, size: 11 });
            page.drawText(`This is line 2 for multi-line snapping testing.`, { x: 50, y: height - 120, size: 11 });
            page.drawText(`Column 1 Content`, { x: 50, y: height - 160, size: 10 });
            page.drawText(`Column 2 Content`, { x: 350, y: height - 160, size: 10 });
        }
        const bytes = await doc.save();
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new File([arrayBuf], "test-document.pdf", { type: "application/pdf" });
    }

    // -------------------------------------------------------------
    // TEST 1: ClientExecutor.isSupported for Highlight, Underline, Strikeout
    // -------------------------------------------------------------
    const markupAliases = [
        "highlight",
        "highlight_pdf",
        "highlight-pdf",
        "underline",
        "underline_pdf",
        "underline-pdf",
        "strikeout",
        "strikeout_pdf",
        "strikeout-pdf",
        "strike_pdf",
        "strike-pdf",
        "strikethrough",
        "strikethrough_pdf",
        "strikethrough-pdf",
    ];
    for (const alias of markupAliases) {
        assert.strictEqual(
            ClientExecutor.isSupported(alias),
            true,
            `ClientExecutor.isSupported('${alias}') must be true`
        );
    }
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all Wave 7 tool aliases");

    // -------------------------------------------------------------
    // TEST 2: Color Parsing (hexToRgb)
    // -------------------------------------------------------------
    const yellow = hexToRgb("#FFFF00");
    assert.strictEqual(yellow.red, 1.0);
    assert.strictEqual(yellow.green, 1.0);
    assert.strictEqual(yellow.blue, 0.0);

    const blue = hexToRgb("#0000FF");
    assert.strictEqual(blue.red, 0.0);
    assert.strictEqual(blue.green, 0.0);
    assert.strictEqual(blue.blue, 1.0);

    const custom = hexToRgb("#80FF40");
    assert.ok(Math.abs(custom.red - 0.502) < 0.01);
    assert.strictEqual(custom.green, 1.0);
    assert.ok(Math.abs(custom.blue - 0.251) < 0.01);

    const fallback = hexToRgb("invalid");
    assert.strictEqual(fallback.red, 1.0);
    assert.strictEqual(fallback.green, 1.0);
    assert.strictEqual(fallback.blue, 0.0);
    console.log("✓ [PASS] 2. hexToRgb converts valid and fallback hex colors accurately");

    // -------------------------------------------------------------
    // TEST 3: Word Grouping Algorithm (groupWordsByLine)
    // -------------------------------------------------------------
    const sampleWords: ExtractedWord[] = [
        { text: "Word1", x0: 50, y0: 100, x1: 90, y1: 112 },
        { text: "Word2", x0: 95, y0: 100, x1: 135, y1: 112 },
        { text: "Word3", x0: 140, y0: 101, x1: 180, y1: 113 },
        // Line 2
        { text: "Line2A", x0: 50, y0: 120, x1: 95, y1: 132 },
        { text: "Line2B", x0: 100, y0: 120, x1: 145, y1: 132 },
        // Column 2 on Line 2 (separated by gap > 10.0)
        { text: "Col2", x0: 350, y0: 120, x1: 390, y1: 132 },
    ];

    const lines = groupWordsByLine(sampleWords);
    assert.strictEqual(lines.length, 3, "Should group into Line 1, Line 2 Col 1, and Line 2 Col 2");

    // Line 1: x0 = 50, x1 = 180
    assert.strictEqual(lines[0].x0, 50);
    assert.strictEqual(lines[0].x1, 180);
    assert.strictEqual(lines[0].items.length, 3);

    // Line 2 Col 1: x0 = 50, x1 = 145
    assert.strictEqual(lines[1].x0, 50);
    assert.strictEqual(lines[1].x1, 145);
    assert.strictEqual(lines[1].items.length, 2);

    // Line 2 Col 2: x0 = 350, x1 = 390
    assert.strictEqual(lines[2].x0, 350);
    assert.strictEqual(lines[2].x1, 390);
    console.log("✓ [PASS] 3. groupWordsByLine groups lines and maintains multi-column separation");

    // -------------------------------------------------------------
    // TEST 4: Direct Client Execution — Highlight PDF
    // -------------------------------------------------------------
    const testFile1 = await createTestPdf(2, 600, 800);
    const highlightBlob = await executeMarkup(testFile1, {
        action: "highlight",
        boxes: [
            { id: "h1", page: 1, x: 45, y: 50, width: 350, height: 25, color: "#FFFF00" },
            { id: "h2", page: 2, x: 45, y: 90, width: 300, height: 25, color: "#00FF00" },
        ],
        mode: "smart",
    });

    assert.ok(highlightBlob.size > 0, "Highlight Blob must not be empty");
    const highlightDoc = await PDFDocument.load(await highlightBlob.arrayBuffer());
    assert.strictEqual(highlightDoc.getPageCount(), 2);
    console.log("✓ [PASS] 4. executeMarkup produces valid multi-page highlighted PDF");

    // -------------------------------------------------------------
    // TEST 5: Direct Client Execution — Underline PDF
    // -------------------------------------------------------------
    const testFile2 = await createTestPdf(1, 600, 800);
    const underlineBlob = await executeMarkup(testFile2, {
        action: "underline",
        boxes: [
            { id: "u1", page: 1, x: 48, y: 50, width: 320, height: 20, color: "#0000FF" },
        ],
        mode: "smart",
    });

    assert.ok(underlineBlob.size > 0, "Underline Blob must not be empty");
    const underlineDoc = await PDFDocument.load(await underlineBlob.arrayBuffer());
    assert.strictEqual(underlineDoc.getPageCount(), 1);
    console.log("✓ [PASS] 5. executeMarkup produces valid underlined PDF");

    // -------------------------------------------------------------
    // TEST 6: Direct Client Execution — Strikeout PDF
    // -------------------------------------------------------------
    const testFile3 = await createTestPdf(1, 600, 800);
    const strikeBlob = await executeMarkup(testFile3, {
        action: "strikeout",
        boxes: [
            { id: "s1", page: 1, x: 48, y: 95, width: 280, height: 20, color: "#FF0000" },
        ],
        mode: "smart",
    });

    assert.ok(strikeBlob.size > 0, "Strikeout Blob must not be empty");
    const strikeDoc = await PDFDocument.load(await strikeBlob.arrayBuffer());
    assert.strictEqual(strikeDoc.getPageCount(), 1);
    console.log("✓ [PASS] 6. executeMarkup produces valid struckout PDF");

    // -------------------------------------------------------------
    // TEST 7: Rotated Page Markup Execution (90°, 180°, 270°)
    // -------------------------------------------------------------
    for (const rot of [90, 180, 270]) {
        const rotFile = await createTestPdf(1, 600, 800, rot);
        const rotBlob = await executeMarkup(rotFile, {
            action: "highlight",
            boxes: [
                { id: `rot_${rot}`, page: 1, x: 50, y: 50, width: 200, height: 30, color: "#FFFF00" },
            ],
            mode: "manual",
        });
        const rotDoc = await PDFDocument.load(await rotBlob.arrayBuffer());
        assert.strictEqual(rotDoc.getPage(0).getRotation().angle, rot);
    }
    console.log("✓ [PASS] 7. executeMarkup handles rotated pages (90°, 180°, 270°) accurately");

    // -------------------------------------------------------------
    // TEST 8: ExecutionManager Integration and Output Naming
    // -------------------------------------------------------------
    const testFile4 = await createTestPdf(1, 600, 800);
    const execResult = await ExecutionManager.run({
        tool: "highlight-pdf",
        files: [testFile4],
        params: {
            boxes: [{ id: "m1", page: 1, x: 50, y: 50, width: 200, height: 30, color: "#FFFF00" }],
            mode: "smart",
        },
        mode: "device",
    });

    assert.strictEqual(execResult.executionMode, "client");
    assert.strictEqual(execResult.fallbackOccurred, false);
    assert.strictEqual(execResult.fileName, "test-document-highlighted.pdf");
    assert.ok(execResult.blob.size > 0);
    console.log("✓ [PASS] 8. ExecutionManager routes markup tools locally and generates proper output file names");

    // -------------------------------------------------------------
    // TEST 9: ExecutionSafetyGate Validation
    // -------------------------------------------------------------
    const safety1 = ExecutionSafetyGate.evaluate("highlight", [testFile4], "CLIENT_PREFERRED");
    assert.strictEqual(safety1.eligible, true);
    assert.strictEqual(safety1.recommendedMode, "client");
    console.log("✓ [PASS] 9. ExecutionSafetyGate approves markup tools for client-side execution");

    console.log("\n=================================================");
    console.log("  ALL WAVE 7 ANNOTATION SUITE TESTS PASSED (9/9) ");
    console.log("=================================================\n");
}

// Auto-run if invoked directly
runMarkupUnitTests().catch((err) => {
    console.error("Markup unit test failure:", err);
    process.exit(1);
});
