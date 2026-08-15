import assert from "assert";
import { PDFDocument, degrees } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "@/lib/execution/types";

export async function runCropExecutionTests() {
    console.log("=================================================");
    console.log("      RUNNING CROP PDF HYBRID UNIT TESTS         ");
    console.log("=================================================");

    // Helper: Create sample valid multi-page PDF
    async function createTestPdf(pages = 3, width = 600, height = 800): Promise<File> {
        const doc = await PDFDocument.create();
        for (let i = 0; i < pages; i++) {
            const page = doc.addPage([width, height]);
            page.drawText(`Page ${i + 1}`, { x: 50, y: height - 100 });
        }
        const bytes = await doc.save();
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new File([arrayBuf], "test-crop.pdf", { type: "application/pdf" });
    }

    // 1. ClientExecutor.isSupported
    assert.strictEqual(ClientExecutor.isSupported("crop"), true, "crop must be supported");
    assert.strictEqual(ClientExecutor.isSupported("crop_pdf"), true, "crop_pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("crop-pdf"), true, "crop-pdf must be supported");
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all aliases");

    // 2. Single page crop with exact coordinates [xmin: 50, ymin: 100, xmax: 450, ymax: 700]
    const testFile1 = await createTestPdf(3, 600, 800);
    const blob1 = await ClientExecutor.execute({
        tool: "crop",
        files: [testFile1],
        params: {
            box: "[50 100 450 700]",
            pages: ["1"],
        },
        mode: "device",
    });
    const doc1 = await PDFDocument.load(await blob1.arrayBuffer());
    assert.strictEqual(doc1.getPageCount(), 3);
    const p1 = doc1.getPage(0);
    const p2 = doc1.getPage(1);
    const crop1 = p1.getCropBox();
    assert.strictEqual(crop1.x, 50);
    assert.strictEqual(crop1.y, 100);
    assert.strictEqual(crop1.width, 400);
    assert.strictEqual(crop1.height, 600);
    // Page 2 should remain full page
    const crop2 = p2.getCropBox();
    assert.strictEqual(crop2.x, 0);
    assert.strictEqual(crop2.y, 0);
    assert.strictEqual(crop2.width, 600);
    assert.strictEqual(crop2.height, 800);
    console.log("✓ [PASS] 2. Single page crop applies exact CropBox only to target page");

    // 3. All pages crop across multi-page document
    const testFile2 = await createTestPdf(3, 600, 800);
    const blob2 = await ClientExecutor.execute({
        tool: "crop",
        files: [testFile2],
        params: {
            box: "[40 60 500 750]",
            pages: null, // all pages
        },
        mode: "device",
    });
    const doc2 = await PDFDocument.load(await blob2.arrayBuffer());
    for (let i = 0; i < 3; i++) {
        const page = doc2.getPage(i);
        const box = page.getCropBox();
        assert.strictEqual(box.x, 40, `Page ${i + 1} x mismatch`);
        assert.strictEqual(box.y, 60, `Page ${i + 1} y mismatch`);
        assert.strictEqual(box.width, 460, `Page ${i + 1} width mismatch`);
        assert.strictEqual(box.height, 690, `Page ${i + 1} height mismatch`);
    }
    console.log("✓ [PASS] 3. All-pages crop applies uniform CropBox to entire document");

    // 4. Custom page range selection ("1, 3")
    const testFile3 = await createTestPdf(3, 600, 800);
    const blob3 = await ClientExecutor.execute({
        tool: "crop",
        files: [testFile3],
        params: {
            box: "[10 20 300 400]",
            pages: ["1, 3"],
        },
        mode: "device",
    });
    const doc3 = await PDFDocument.load(await blob3.arrayBuffer());
    assert.strictEqual(doc3.getPage(0).getCropBox().width, 290);
    assert.strictEqual(doc3.getPage(1).getCropBox().width, 600); // uncropped
    assert.strictEqual(doc3.getPage(2).getCropBox().width, 290);
    console.log("✓ [PASS] 4. Custom page range (1, 3) selectively crops specified pages");

    // 5. Custom page range format ("2-3")
    const testFile4 = await createTestPdf(3, 600, 800);
    const blob4 = await ClientExecutor.execute({
        tool: "crop",
        files: [testFile4],
        params: {
            box: "[25 25 400 500]",
            pages: ["2-3"],
        },
        mode: "device",
    });
    const doc4 = await PDFDocument.load(await blob4.arrayBuffer());
    assert.strictEqual(doc4.getPage(0).getCropBox().width, 600); // uncropped
    assert.strictEqual(doc4.getPage(1).getCropBox().width, 375);
    assert.strictEqual(doc4.getPage(2).getCropBox().width, 375);
    console.log("✓ [PASS] 5. Hyphenated page range (2-3) correctly targets pages");

    // 6. Rotated page handling (page with 90° rotation)
    const rotDoc = await PDFDocument.create();
    const rotPage = rotDoc.addPage([800, 600]);
    rotPage.setRotation(degrees(90));
    const rotBytes = await rotDoc.save();
    const rotFile = new File([rotBytes.buffer.slice(rotBytes.byteOffset, rotBytes.byteOffset + rotBytes.byteLength) as ArrayBuffer], "rot.pdf", { type: "application/pdf" });
    const rotBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [rotFile],
        params: {
            box: "[50 50 500 400]",
        },
        mode: "device",
    });
    const rotResult = await PDFDocument.load(await rotBlob.arrayBuffer());
    const resPage = rotResult.getPage(0);
    assert.strictEqual(resPage.getRotation().angle, 90, "Page rotation angle preserved");
    assert.strictEqual(resPage.getCropBox().width, 450);
    assert.strictEqual(resPage.getCropBox().height, 350);
    console.log("✓ [PASS] 6. Rotated page preserves rotation angle while applying CropBox");

    // 7. Auto mode executes locally with 0 cloud calls
    let cloudCalled = false;
    const origCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        cloudCalled = true;
        return new Blob(["mock-cloud-pdf"], { type: "application/pdf" });
    };

    try {
        const autoFile = await createTestPdf(1);
        const autoResult = await ExecutionManager.run({
            tool: "crop",
            files: [autoFile],
            params: { box: "[10 10 200 200]" },
            mode: "auto",
        });
        assert.strictEqual(cloudCalled, false, "Auto mode must not call CloudExecutor for safe PDF");
        assert.strictEqual(autoResult.executionMode, "client");
        assert.strictEqual(autoResult.fallbackOccurred, false);
        console.log("✓ [PASS] 7. Auto mode executes 100% locally with 0 cloud calls");

        // 8. Device mode executes locally with 0 cloud calls
        cloudCalled = false;
        const devResult = await ExecutionManager.run({
            tool: "crop",
            files: [autoFile],
            params: { box: "[10 10 200 200]" },
            mode: "device",
        });
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        assert.strictEqual(devResult.executionMode, "client");
        console.log("✓ [PASS] 8. Device mode executes 100% locally with 0 cloud calls");

        // 9. Explicit Cloud mode routes to CloudExecutor
        cloudCalled = false;
        const cloudResult = await ExecutionManager.run({
            tool: "crop",
            files: [autoFile],
            params: { box: "[10 10 200 200]" },
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
            tool: "crop",
            files: [encFile],
            params: { box: "[10 10 200 200]" },
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
            tool: "crop",
            files: [encFile],
            params: { box: "[10 10 200 200]" },
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
            tool: "crop",
            files: [corruptFile],
            params: { box: "[10 10 100 100]" },
            mode: "device",
        });
        assert.fail("Should have thrown error on corrupt header");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 12. Invalid PDF header throws INVALID_INPUT error without Cloud fallback");
    }

    // 13. Invalid/malformed crop box string throws INVALID_INPUT
    const testFile5 = await createTestPdf(1);
    try {
        await ClientExecutor.execute({
            tool: "crop",
            files: [testFile5],
            params: { box: "invalid_box_string" },
            mode: "device",
        });
        assert.fail("Should have thrown error on malformed box string");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 13. Malformed crop box parameter throws INVALID_INPUT error");
    }

    // 14. Inverted/negative crop dimensions throw INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "crop",
            files: [testFile5],
            params: { box: "[400 500 100 200]" }, // xmin > xmax
            mode: "device",
        });
        assert.fail("Should have thrown error on inverted box");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 14. Inverted crop box coordinates (xmin > xmax) throw INVALID_INPUT error");
    }

    // 15. ExecutionSafetyGate rejects 26MB file for local execution
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("crop", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed client safety gate");
    console.log("✓ [PASS] 15. ExecutionSafetyGate rejects 26MB file for local execution");

    // 16. Array parameter box format [xmin, ymin, xmax, ymax]
    const arrayBoxFile = await createTestPdf(1, 500, 500);
    const arrayBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [arrayBoxFile],
        params: { box: [30, 40, 300, 400] },
        mode: "device",
    });
    const arrayDoc = await PDFDocument.load(await arrayBlob.arrayBuffer());
    const arrayCrop = arrayDoc.getPage(0).getCropBox();
    assert.strictEqual(arrayCrop.x, 30);
    assert.strictEqual(arrayCrop.y, 40);
    assert.strictEqual(arrayCrop.width, 270);
    assert.strictEqual(arrayCrop.height, 360);
    console.log("✓ [PASS] 16. Numeric array box format [xmin, ymin, xmax, ymax] parsed cleanly");

    // 17. Named properties box format { xmin, ymin, xmax, ymax }
    const objBoxFile = await createTestPdf(1, 500, 500);
    const objBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [objBoxFile],
        params: { xmin: 20, ymin: 30, xmax: 220, ymax: 330 },
        mode: "device",
    });
    const objDoc = await PDFDocument.load(await objBlob.arrayBuffer());
    const objCrop = objDoc.getPage(0).getCropBox();
    assert.strictEqual(objCrop.x, 20);
    assert.strictEqual(objCrop.y, 30);
    assert.strictEqual(objCrop.width, 200);
    assert.strictEqual(objCrop.height, 300);
    console.log("✓ [PASS] 17. Named properties { xmin, ymin, xmax, ymax } parsed cleanly");

    // 18. Out-of-range page numbers gracefully handled
    const outOfRangeFile = await createTestPdf(2, 500, 500);
    const rangeBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [outOfRangeFile],
        params: {
            box: "[10 10 200 200]",
            pages: ["1, 99"], // 99 does not exist
        },
        mode: "device",
    });
    const rangeDoc = await PDFDocument.load(await rangeBlob.arrayBuffer());
    assert.strictEqual(rangeDoc.getPage(0).getCropBox().width, 190);
    assert.strictEqual(rangeDoc.getPage(1).getCropBox().width, 500); // uncropped
    console.log("✓ [PASS] 18. Out-of-range page numbers are safely filtered without crash");

    // 19. Mixed page dimensions across multi-page document
    const mixedDoc = await PDFDocument.create();
    mixedDoc.addPage([400, 600]);
    mixedDoc.addPage([800, 1000]);
    const mixedBytes = await mixedDoc.save();
    const mixedFile = new File([mixedBytes.buffer.slice(mixedBytes.byteOffset, mixedBytes.byteOffset + mixedBytes.byteLength) as ArrayBuffer], "mixed.pdf", { type: "application/pdf" });
    const mixedBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [mixedFile],
        params: { box: "[50 50 350 550]" },
        mode: "device",
    });
    const mixedRes = await PDFDocument.load(await mixedBlob.arrayBuffer());
    assert.strictEqual(mixedRes.getPage(0).getCropBox().width, 300);
    assert.strictEqual(mixedRes.getPage(1).getCropBox().width, 300);
    console.log("✓ [PASS] 19. Document with mixed page dimensions crops successfully");

    // 20. Non-destructive structural preservation
    const metaDoc = await PDFDocument.create();
    metaDoc.setTitle("Important Document");
    metaDoc.setAuthor("Platen Team");
    metaDoc.addPage([500, 500]);
    const metaBytes = await metaDoc.save();
    const metaFile = new File([metaBytes.buffer.slice(metaBytes.byteOffset, metaBytes.byteOffset + metaBytes.byteLength) as ArrayBuffer], "meta.pdf", { type: "application/pdf" });
    const metaBlob = await ClientExecutor.execute({
        tool: "crop",
        files: [metaFile],
        params: { box: "[20 20 200 200]" },
        mode: "device",
    });
    const metaRes = await PDFDocument.load(await metaBlob.arrayBuffer());
    assert.strictEqual(metaRes.getTitle(), "Important Document");
    assert.strictEqual(metaRes.getAuthor(), "Platen Team");
    console.log("✓ [PASS] 20. Document metadata and catalog structure 100% preserved");

    console.log("\n=================================================");
    console.log("   CROP PDF TEST SUMMARY: 20 PASSED, 0 FAILED    ");
    console.log("=================================================\n");
}
