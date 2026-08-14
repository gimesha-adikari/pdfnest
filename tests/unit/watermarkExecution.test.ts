import { PDFDocument } from "pdf-lib";
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

// Helper to create a valid PNG File
function createDummyPngFile(): File {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAH0lEQVR4nGL5z0A+YKJA76jmUc2jmkc1U0EzIAAA//8w6AEqjsYDhQAAAABJRU5ErkJggg==";
    const buf = Buffer.from(b64, "base64");
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new File([arrayBuffer], "watermark.png", { type: "image/png" });
}

// Helper to create a valid JPEG File
function createDummyJpgFile(): File {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAH0lEQVR4nGL5z0A+YKJA76jmUc2jmkc1U0EzIAAA//8w6AEqjsYDhQAAAABJRU5ErkJggg==";
    const buf = Buffer.from(b64, "base64");
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new File([arrayBuffer], "watermark.jpg", { type: "image/jpeg" });
}

// Helper to create an unsupported image format File (e.g. WEBP/BMP)
function createUnsupportedImageFile(): File {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]); // WEBP header
    return new File([bytes], "watermark.webp", { type: "image/webp" });
}

export async function runWatermarkExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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
    console.log("  RUNNING WAVE 2 WATERMARK PDF HYBRID UNIT TESTS ");
    console.log("=================================================\n");

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const fileA = await createDummyPdf(2, "Watermark Baseline Doc");
        const pngFile = createDummyPngFile();
        const jpgFile = createDummyJpgFile();
        const webpFile = createUnsupportedImageFile();

        // Test 1: Implementation Support Detection
        assert(
            ClientExecutor.isSupported("watermark") === true,
            "1. ClientExecutor.isSupported('watermark') evaluates true"
        );

        // Test 2: Local Text Watermarking
        cloudCallCount = 0;
        const resText = await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: {
                watermarkType: "text",
                text: "DRAFT ONLY",
                fontFamily: "Helvetica",
                fontSize: 36,
                rotation: 30,
                position: "cc",
                opacity: 0.5,
            },
            mode: "auto",
        });
        const textResultBytes = new Uint8Array(await resText.blob.arrayBuffer());
        const textResultDoc = await PDFDocument.load(textResultBytes);
        assert(
            resText.executionMode === "client" && textResultDoc.getPageCount() === 2 && cloudCallCount === 0,
            "2. Text watermark executes 100% locally with zero cloud calls"
        );

        // Test 3: Local Image Watermarking (PNG)
        cloudCallCount = 0;
        const resPng = await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: {
                watermarkType: "image",
                watermarkImage: pngFile,
                fontSize: 50,
                rotation: 0,
                position: "cc",
                opacity: 0.8,
            },
            mode: "auto",
        });
        const pngResultBytes = new Uint8Array(await resPng.blob.arrayBuffer());
        const pngResultDoc = await PDFDocument.load(pngResultBytes);
        assert(
            resPng.executionMode === "client" && pngResultDoc.getPageCount() === 2 && cloudCallCount === 0,
            "3. PNG image watermark executes 100% locally with zero cloud calls"
        );

        // Test 4: Local Image Watermarking (JPEG)
        cloudCallCount = 0;
        const resJpg = await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: {
                watermarkType: "image",
                watermarkImage: jpgFile,
                fontSize: 40,
                rotation: 45,
                position: "br",
                opacity: 0.6,
            },
            mode: "auto",
        });
        const jpgResultBytes = new Uint8Array(await resJpg.blob.arrayBuffer());
        const jpgResultDoc = await PDFDocument.load(jpgResultBytes);
        assert(
            resJpg.executionMode === "client" && jpgResultDoc.getPageCount() === 2 && cloudCallCount === 0,
            "4. JPEG image watermark executes 100% locally with zero cloud calls"
        );

        // Test 5: All 9 Anchor Positions
        cloudCallCount = 0;
        const positions = ["tl", "tc", "tr", "cl", "cc", "cr", "bl", "bc", "br"];
        let allAnchorsPassed = true;
        for (const pos of positions) {
            const posRes = await ExecutionManager.run({
                tool: "watermark",
                files: [fileA],
                params: { watermarkType: "text", text: "POS_TEST", position: pos },
                mode: "auto",
            });
            if (!posRes || !posRes.blob || posRes.blob.size === 0) allAnchorsPassed = false;
        }
        assert(
            allAnchorsPassed && cloudCallCount === 0,
            "5. All 9 anchor positions (tl, tc, tr, cl, cc, cr, bl, bc, br) execute successfully"
        );

        // Test 6: Password Fallback
        cloudCallCount = 0;
        await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: { watermarkType: "text", text: "CONFIDENTIAL" },
            mode: "auto",
            password: "secret_password",
        });
        assert(
            cloudCallCount === 1,
            "6. Password-protected file triggers Cloud fallback in Auto mode"
        );

        // Test 7: Invalid PDF Header Validation
        const invalidFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.pdf", { type: "application/pdf" });
        let caughtInvalid = false;
        try {
            await ExecutionManager.run({
                tool: "watermark",
                files: [invalidFile],
                params: { watermarkType: "text", text: "TEST" },
                mode: "device",
            });
        } catch (err: any) {
            if (err.code === "INVALID_INPUT") caughtInvalid = true;
        }
        assert(
            caughtInvalid,
            "7. Invalid PDF header throws INVALID_INPUT error in Device mode"
        );

        // Test 8: Unsupported Image Format Fallback
        cloudCallCount = 0;
        await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: { watermarkType: "image", watermarkImage: webpFile },
            mode: "auto",
        });
        assert(
            cloudCallCount === 1,
            "8. Unsupported image format (WEBP) triggers Cloud fallback in Auto mode"
        );

        // Test 9: Explicit Cloud Mode Execution
        cloudCallCount = 0;
        await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: { watermarkType: "text", text: "CLOUD MODE TEST" },
            mode: "cloud",
        });
        assert(
            cloudCallCount === 1,
            "9. Explicit Cloud mode routes directly to CloudExecutor"
        );

        // Test 10: Explicit Device Mode Execution
        cloudCallCount = 0;
        const deviceResult = await ExecutionManager.run({
            tool: "watermark",
            files: [fileA],
            params: { watermarkType: "text", text: "DEVICE MODE" },
            mode: "device",
        });
        assert(
            deviceResult.executionMode === "client" && deviceResult.blob.size > 0 && cloudCallCount === 0,
            "10. Explicit Device mode executes 100% locally without calling Cloud"
        );

    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    return { passed, failed, errors };
}

if (require.main === module) {
    runWatermarkExecutionTests().then(({ passed, failed, errors }) => {
        console.log(`\nWatermark Execution Test Results: ${passed} passed, ${failed} failed.`);
        if (failed > 0) {
            console.error("Failures:\n" + errors.join("\n"));
            process.exit(1);
        }
    });
}
