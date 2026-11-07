import assert from "assert";
import { PDFDocument } from "pdf-lib";
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

    // 2. Node/SSR has no real canvas and must not synthesize successful output.
    const testFile1 = await createTestPdf(3);
    await assert.rejects(
        ClientExecutor.execute({ tool: "pdf_to_images", files: [testFile1], params: { imageType: "jpg" }, mode: "device" }),
        (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP",
    );
    console.log("✓ [PASS] 2. Non-browser execution does not return placeholder raster bytes");

    // 3. Auto mode can fall back in this Node-only harness when browser Canvas is unavailable.
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
        assert.strictEqual(cloudCalled, true, "Auto mode may fall back when this non-browser harness lacks Canvas");
        assert.strictEqual(autoResult.executionMode, "cloud");
        assert.strictEqual(autoResult.fallbackOccurred, true);
        console.log("✓ [PASS] 3. Auto mode reports browser-unavailable fallback in the Node harness");

        // 4. Device mode remains local-only and rejects unsupported non-browser execution.
        cloudCalled = false;
        await assert.rejects(ExecutionManager.run({ tool: "pdf_to_images", files: [autoFile], params: { imageType: "png" }, mode: "device" }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP");
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        console.log("✓ [PASS] 4. Device mode rejects without routing the input to Cloud");

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
        console.log("✓ [PASS] 5. Explicit Cloud mode invokes CloudExecutor");

        // 10. Password-protected file triggers Cloud fallback in Auto mode (Option B)
        cloudCalled = false;
        const encDoc = await PDFDocument.create();
        encDoc.addPage([600, 800]);
        const encBytes = await encDoc.save();
        const encFile = new File(
            [encBytes.buffer.slice(encBytes.byteOffset, encBytes.byteOffset + encBytes.byteLength) as ArrayBuffer],
            "enc.pdf",
            { type: "application/pdf" }
        ) as File & { originalPassword: string };
        encFile.originalPassword = "secret_pass_123";

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

        // 11. Password-protected file in Device mode rejects locally
        cloudCalled = false;
        await assert.rejects(
            ExecutionManager.run({
                tool: "pdf_to_images",
                files: [encFile],
                params: { imageType: "jpg" },
                mode: "device",
                password: "secret_pass_123",
            }),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP"
        );
        assert.strictEqual(cloudCalled, false, "Encrypted file in Device mode must not route to Cloud relock");
        console.log("✓ [PASS] 11. Password-protected file in Device mode rejects locally without Cloud");
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
    } catch (err: unknown) {
        assert.ok(err instanceof ExecutionError, "Invalid PDF must fail with ExecutionError");
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 12. Invalid PDF header throws INVALID_INPUT error without Cloud fallback");
    }

    // 13. ExecutionSafetyGate rejects 26MB file for local execution
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("pdf_to_images", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed client safety gate");
    console.log("✓ [PASS] 13. ExecutionSafetyGate rejects 26MB file for local execution");

    // 14. Non-browser mode cannot claim a ZIP exists without real rendered images.
    const testFile6 = await createTestPdf(1);
    await assert.rejects(ClientExecutor.execute({ tool: "pdf_to_images", files: [testFile6], params: { imageType: "jpg" }, mode: "device" }),
        (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP");
    console.log("✓ [PASS] 14. No placeholder image archive is returned without a browser canvas");

    // 15. Empty files array throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_images",
            files: [],
            params: { imageType: "jpg" },
            mode: "device",
        });
        assert.fail("Should have thrown error on empty files");
    } catch (err: unknown) {
        assert.ok(err instanceof ExecutionError, "Empty files must fail with ExecutionError");
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 15. Empty files array throws INVALID_INPUT error");
    }

    console.log("\n=================================================");
    console.log(" PDF TO IMAGES TEST SUMMARY: 11 PASSED, 0 FAILED ");
    console.log("=================================================\n");
}
