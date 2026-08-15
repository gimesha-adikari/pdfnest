import assert from "assert";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "@/lib/execution/types";

export async function runPdfToImagesExecutionTests() {
    console.log("=================================================");
    console.log("   RUNNING PDF TO IMAGES HYBRID UNIT TESTS       ");
    console.log("=================================================");

    // Helper: Create sample valid multi-page PDF
    async function createTestPdf(pages = 3, width = 600, height = 800): Promise<File> {
        const doc = await PDFDocument.create();
        for (let i = 0; i < pages; i++) {
            const page = doc.addPage([width, height]);
            page.drawText(`Page ${i + 1} Content`, { x: 50, y: height - 100 });
        }
        const bytes = await doc.save();
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new File([arrayBuf], "sample-document.pdf", { type: "application/pdf" });
    }

    // 1. ClientExecutor.isSupported
    assert.strictEqual(ClientExecutor.isSupported("pdf_to_images"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf-to-images"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf_to_img"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf-to-img"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf_to_jpg"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf-to-jpg"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf_to_png"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf-to-png"), true);
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all 8 aliases");

    // 2. JPEG conversion produces valid ZIP with 3-digit zero-padded names
    const testFile1 = await createTestPdf(3);
    const blob1 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile1],
        params: { imageType: "jpg" },
        mode: "device",
    });
    assert.strictEqual(blob1.type, "application/zip");
    const zipBytes1 = new Uint8Array(await blob1.arrayBuffer());
    const unzipped1 = unzipSync(zipBytes1);
    const fileKeys1 = Object.keys(unzipped1).sort();
    assert.deepStrictEqual(fileKeys1, ["page-001.jpg", "page-002.jpg", "page-003.jpg"]);
    console.log("✓ [PASS] 2. JPEG conversion produces valid ZIP containing page-001.jpg, page-002.jpg, page-003.jpg");

    // 3. PNG conversion produces valid ZIP with page-001.png
    const testFile2 = await createTestPdf(2);
    const blob2 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile2],
        params: { imageType: "png" },
        mode: "device",
    });
    const unzipped2 = unzipSync(new Uint8Array(await blob2.arrayBuffer()));
    const fileKeys2 = Object.keys(unzipped2).sort();
    assert.deepStrictEqual(fileKeys2, ["page-001.png", "page-002.png"]);
    console.log("✓ [PASS] 3. PNG conversion produces valid ZIP containing page-001.png, page-002.png");

    // 4. Grayscale PNG conversion
    const testFile3 = await createTestPdf(1);
    const blob3 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile3],
        params: { imageType: "pnggray" },
        mode: "device",
    });
    const unzipped3 = unzipSync(new Uint8Array(await blob3.arrayBuffer()));
    assert.ok(unzipped3["page-001.png"] !== undefined);
    console.log("✓ [PASS] 4. Grayscale PNG produces valid ZIP containing page-001.png");

    // 5. Monochrome PNG conversion
    const testFile4 = await createTestPdf(1);
    const blob4 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile4],
        params: { imageType: "pngmono" },
        mode: "device",
    });
    const unzipped4 = unzipSync(new Uint8Array(await blob4.arrayBuffer()));
    assert.ok(unzipped4["page-001.png"] !== undefined);
    console.log("✓ [PASS] 5. Monochrome PNG produces valid ZIP containing page-001.png");

    // 6. 5-page document produces 5 distinct entries
    const testFile5 = await createTestPdf(5);
    const blob5 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile5],
        params: { imageType: "jpg" },
        mode: "device",
    });
    const unzipped5 = unzipSync(new Uint8Array(await blob5.arrayBuffer()));
    assert.strictEqual(Object.keys(unzipped5).length, 5);
    assert.deepStrictEqual(Object.keys(unzipped5).sort(), [
        "page-001.jpg",
        "page-002.jpg",
        "page-003.jpg",
        "page-004.jpg",
        "page-005.jpg",
    ]);
    console.log("✓ [PASS] 6. 5-page PDF produces exactly 5 sequentially numbered images in flat ZIP");

    // 7. Auto mode executes locally with 0 cloud calls on safe input
    let cloudCalled = false;
    const origCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        cloudCalled = true;
        return new Blob(["mock-cloud-zip"], { type: "application/zip" });
    };

    try {
        const autoFile = await createTestPdf(1);
        const autoResult = await ExecutionManager.run({
            tool: "pdf_to_images",
            files: [autoFile],
            params: { imageType: "jpg" },
            mode: "auto",
        });
        assert.strictEqual(cloudCalled, false, "Auto mode must not call CloudExecutor for safe PDF");
        assert.strictEqual(autoResult.executionMode, "client");
        assert.strictEqual(autoResult.fallbackOccurred, false);
        console.log("✓ [PASS] 7. Auto mode executes 100% locally with 0 cloud calls");

        // 8. Device mode executes locally with 0 cloud calls
        cloudCalled = false;
        const devResult = await ExecutionManager.run({
            tool: "pdf_to_images",
            files: [autoFile],
            params: { imageType: "png" },
            mode: "device",
        });
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        assert.strictEqual(devResult.executionMode, "client");
        console.log("✓ [PASS] 8. Device mode executes 100% locally with 0 cloud calls");

        // 9. Explicit Cloud mode invokes CloudExecutor
        cloudCalled = false;
        const cloudResult = await ExecutionManager.run({
            tool: "pdf_to_images",
            files: [autoFile],
            params: { imageType: "jpg" },
            mode: "cloud",
        });
        assert.strictEqual(cloudCalled, true, "Cloud mode must call CloudExecutor");
        assert.strictEqual(cloudResult.executionMode, "cloud");
        console.log("✓ [PASS] 9. Explicit Cloud mode invokes CloudExecutor");

        // 10. Password-protected file triggers Cloud fallback in Auto mode (Option B)
        cloudCalled = false;
        const encDoc = await PDFDocument.create();
        encDoc.addPage([600, 800]);
        const encBytes = await encDoc.save();
        const encFile = new File([encBytes.buffer.slice(encBytes.byteOffset, encBytes.byteOffset + encBytes.byteLength) as ArrayBuffer], "enc.pdf", { type: "application/pdf" });
        (encFile as any).originalPassword = "secret_pass_123";

        const encResult = await ExecutionManager.run({
            tool: "pdf_to_images",
            files: [encFile],
            params: { imageType: "jpg" },
            mode: "auto",
            password: "secret_pass_123",
        });
        assert.strictEqual(cloudCalled, true, "Encrypted file must trigger Cloud fallback");
        assert.strictEqual(encResult.executionMode, "cloud");
        assert.strictEqual(encResult.fallbackOccurred, true);
        console.log("✓ [PASS] 10. Password-protected file triggers Cloud fallback in Auto mode (Option B)");

        // 11. Password-protected file in Device mode routes to Cloud relock pipeline
        cloudCalled = false;
        const devEncResult = await ExecutionManager.run({
            tool: "pdf_to_images",
            files: [encFile],
            params: { imageType: "jpg" },
            mode: "device",
            password: "secret_pass_123",
        });
        assert.strictEqual(cloudCalled, true, "Encrypted file in Device mode must route to Cloud relock");
        assert.strictEqual(devEncResult.executionMode, "cloud");
        assert.strictEqual(devEncResult.fallbackOccurred, true);
        console.log("✓ [PASS] 11. Password-protected file in Device mode routes to Cloud relock pipeline");
    } finally {
        CloudExecutor.execute = origCloudExec;
    }

    // 12. Invalid PDF header throws INVALID_INPUT error
    const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.pdf", { type: "application/pdf" });
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_images",
            files: [corruptFile],
            params: { imageType: "jpg" },
            mode: "device",
        });
        assert.fail("Should have thrown error on corrupt header");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 12. Invalid PDF header throws INVALID_INPUT error without Cloud fallback");
    }

    // 13. ExecutionSafetyGate rejects 26MB file for local execution
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("pdf_to_images", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed client safety gate");
    console.log("✓ [PASS] 13. ExecutionSafetyGate rejects 26MB file for local execution");

    // 14. Magic ZIP header signature verification
    const testFile6 = await createTestPdf(1);
    const blob6 = await ClientExecutor.execute({
        tool: "pdf_to_images",
        files: [testFile6],
        params: { imageType: "jpg" },
        mode: "device",
    });
    const zipBytes6 = new Uint8Array(await blob6.arrayBuffer());
    assert.strictEqual(zipBytes6[0], 0x50); // 'P'
    assert.strictEqual(zipBytes6[1], 0x4b); // 'K'
    assert.strictEqual(zipBytes6[2], 0x03);
    assert.strictEqual(zipBytes6[3], 0x04);
    console.log("✓ [PASS] 14. Output ZIP starts with standard PK\x03\x04 signature");

    // 15. Empty files array throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_images",
            files: [],
            params: { imageType: "jpg" },
            mode: "device",
        });
        assert.fail("Should have thrown error on empty files");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 15. Empty files array throws INVALID_INPUT error");
    }

    console.log("\n=================================================");
    console.log(" PDF TO IMAGES TEST SUMMARY: 15 PASSED, 0 FAILED ");
    console.log("=================================================\n");
}
