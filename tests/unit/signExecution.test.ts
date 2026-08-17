import assert from "assert";
import { PDFDocument, degrees } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import { executeSignPdf, SignPdfParams } from "@/lib/execution/sign/signClient";

async function runSignUnitTests() {
    console.log("=================================================");
    console.log("     RUNNING SIGN PDF (WAVE 8) UNIT TESTS        ");
    console.log("=================================================");

    // Helper: Create a sample 100x50 transparent PNG in base64
    const SAMPLE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAQUlEQVR4nO3RsREAIAgDQHD/nXEEKdDG/zpFLokAAAAAAAAAAABgUvajVfdq/CKPe68XNehzCAAAAAAAAAAAwKwNL9QCBj9twPIAAAAASUVORK5CYII=";
    const samplePngBytes = Buffer.from(SAMPLE_PNG_BASE64, "base64");
    const samplePngDataUrl = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;

    // Helper: Create a sample test PDF
    async function createTestPdf(pages = 2, width = 600, height = 800, rotation = 0): Promise<File> {
        const doc = await PDFDocument.create();
        for (let i = 0; i < pages; i++) {
            const page = doc.addPage([width, height]);
            if (rotation !== 0) {
                page.setRotation(degrees(rotation));
            }
            page.drawText(`Page ${i + 1} Contract Document`, { x: 50, y: height - 60, size: 16 });
            page.drawText(`Signature Line: ____________________`, { x: 50, y: 150, size: 12 });
        }
        const bytes = await doc.save();
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new File([arrayBuf], "contract-test.pdf", { type: "application/pdf" });
    }

    // -------------------------------------------------------------
    // TEST 1: ClientExecutor.isSupported for Sign PDF aliases
    // -------------------------------------------------------------
    const signAliases = ["sign", "sign_pdf", "sign-pdf"];
    for (const alias of signAliases) {
        assert.strictEqual(
            ClientExecutor.isSupported(alias),
            true,
            `ClientExecutor.isSupported('${alias}') must be true`
        );
    }
    console.log("✓ TEST 1: ClientExecutor.isSupported handles all sign aliases.");

    // -------------------------------------------------------------
    // TEST 2: Single-page signature placement with PNG Blob
    // -------------------------------------------------------------
    const testPdf1 = await createTestPdf(1);
    const sigBlob = new Blob([samplePngBytes], { type: "image/png" });
    const params1: SignPdfParams = {
        signature: sigBlob,
        stamps: [{ page: 1, x: 50, y: 650, width: 150, height: 50 }],
    };

    const outBlob1 = await executeSignPdf(testPdf1, params1);
    assert.ok(outBlob1 instanceof Blob, "executeSignPdf must return a Blob");
    assert.strictEqual(outBlob1.type, "application/pdf");

    const outDoc1 = await PDFDocument.load(await outBlob1.arrayBuffer());
    assert.strictEqual(outDoc1.getPageCount(), 1, "Page count must remain 1");
    console.log("✓ TEST 2: Single-page signature placement with PNG Blob succeeded.");

    // -------------------------------------------------------------
    // TEST 3: Base64 data URL signature input
    // -------------------------------------------------------------
    const testPdf2 = await createTestPdf(1);
    const params2: SignPdfParams = {
        signature: samplePngDataUrl,
        stamps: [{ page: 1, x: 100, y: 700, width: 120, height: 40 }],
    };
    const outBlob2 = await executeSignPdf(testPdf2, params2);
    const outDoc2 = await PDFDocument.load(await outBlob2.arrayBuffer());
    assert.strictEqual(outDoc2.getPageCount(), 1);
    console.log("✓ TEST 3: Base64 data URL signature parsing succeeded.");

    // -------------------------------------------------------------
    // TEST 4: Multi-page and multi-stamp signing
    // -------------------------------------------------------------
    const testPdf3 = await createTestPdf(3);
    const params3: SignPdfParams = {
        signature: sigBlob,
        stamps: [
            { page: 1, x: 50, y: 650, width: 150, height: 50 },
            { page: 1, x: 300, y: 650, width: 150, height: 50 }, // 2 signatures on page 1
            { page: 3, x: 50, y: 650, width: 150, height: 50 },  // 1 signature on page 3
        ],
    };
    const outBlob3 = await executeSignPdf(testPdf3, params3);
    const outDoc3 = await PDFDocument.load(await outBlob3.arrayBuffer());
    assert.strictEqual(outDoc3.getPageCount(), 3, "Page count must remain 3");
    console.log("✓ TEST 4: Multi-page and multi-stamp placement succeeded.");

    // -------------------------------------------------------------
    // TEST 5: Rotation invariance (0, 90, 180, 270 degrees)
    // -------------------------------------------------------------
    for (const rot of [0, 90, 180, 270]) {
        const rotatedPdf = await createTestPdf(1, 600, 800, rot);
        const rotParams: SignPdfParams = {
            signature: sigBlob,
            stamps: [{ page: 1, x: 50, y: 100, width: 150, height: 50 }],
        };
        const rotOut = await executeSignPdf(rotatedPdf, rotParams);
        const rotDoc = await PDFDocument.load(await rotOut.arrayBuffer());
        assert.strictEqual(rotDoc.getPage(0).getRotation().angle, rot);
    }
    console.log("✓ TEST 5: Rotation invariance across 0°, 90°, 180°, 270° verified.");

    // -------------------------------------------------------------
    // TEST 6: ExecutionManager end-to-end device execution
    // -------------------------------------------------------------
    const testPdf4 = await createTestPdf(2);
    const execResult = await ExecutionManager.run({
        tool: "sign",
        files: [testPdf4],
        mode: "device",
        params: {
            signature: sigBlob,
            stamps: [{ page: 2, x: 50, y: 500, width: 140, height: 45 }],
        },
    });

    assert.ok(execResult.blob instanceof Blob, "ExecutionResult must contain blob");
    assert.strictEqual(execResult.fileName, "signed_contract-test.pdf");
    console.log("✓ TEST 6: ExecutionManager device execution returned correct output filename.");

    // -------------------------------------------------------------
    // TEST 7: Invalid input & edge case handling
    // -------------------------------------------------------------
    const testPdf5 = await createTestPdf(1);

    // Empty signature
    await assert.rejects(
        () => executeSignPdf(testPdf5, { signature: "", stamps: [{ page: 1, x: 0, y: 0, width: 10, height: 10 }] }),
        /Missing signature image asset/
    );

    // Empty stamps
    await assert.rejects(
        () => executeSignPdf(testPdf5, { signature: sigBlob, stamps: [] }),
        /At least one signature stamp placement is required/
    );

    // Missing PDF header
    const badFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "bad.pdf", { type: "application/pdf" });
    await assert.rejects(
        () => executeSignPdf(badFile, { signature: sigBlob, stamps: [{ page: 1, x: 0, y: 0, width: 10, height: 10 }] }),
        /missing %PDF- header/
    );

    console.log("✓ TEST 7: Error handling for empty signatures, empty stamps, and bad headers passed.");

    console.log("\n=================================================");
    console.log("    ALL SIGN PDF UNIT TESTS PASSED (7/7)        ");
    console.log("=================================================\n");
}

runSignUnitTests().catch((err) => {
    console.error("Sign unit test failure:", err);
    process.exit(1);
});
