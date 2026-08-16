import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { executePdfToText } from "@/lib/execution/text/pdfToTextClient";
import { ExecutionError } from "@/lib/execution/types";

function loadFixture(filename: string): File {
    const fixturePath = path.resolve(process.cwd(), `tests/fixtures/${filename}`);
    const buffer = fs.readFileSync(fixturePath);
    const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return new File([arrayBuf], filename, { type: "application/pdf" });
}

async function createMultiPagePdf(pageCount: number): Promise<File> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= pageCount; i++) {
        const page = doc.addPage([400, 400]);
        page.drawText(`Page content line for page ${i}`, { x: 50, y: 350, font, size: 12 });
    }
    const bytes = await doc.save();
    const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new File([arrayBuf], "generated_multipage.pdf", { type: "application/pdf" });
}

async function runTests() {
    console.log("Running PDF to Text Cancellation Unit Tests...");

    // Test 1: Pre-aborted signal throws USER_CANCELLATION immediately before parsing
    {
        const sampleFile = loadFixture("sample.pdf");
        const abortController = new AbortController();
        abortController.abort();

        let threw = false;
        try {
            await executePdfToText(
                sampleFile,
                {},
                undefined,
                "device",
                abortController.signal
            );
        } catch (err: any) {
            threw = true;
            assert.ok(err instanceof ExecutionError, "Expected ExecutionError");
            assert.strictEqual(err.code, "USER_CANCELLATION");
        }
        assert.ok(threw, "Pre-aborted signal must throw USER_CANCELLATION");
        console.log("  PASS  Pre-aborted signal throws USER_CANCELLATION immediately");
    }

    // Test 2: ExecutionManager.run with pre-aborted signal
    {
        const sampleFile = loadFixture("sample.pdf");
        const abortController = new AbortController();
        abortController.abort();

        let threw = false;
        try {
            await ExecutionManager.run({
                tool: "pdf_to_text",
                files: [sampleFile],
                mode: "device",
                signal: abortController.signal,
            });
        } catch (err: any) {
            threw = true;
            assert.ok(err instanceof ExecutionError, "Expected ExecutionError");
            assert.strictEqual(err.code, "USER_CANCELLATION");
        }
        assert.ok(threw, "ExecutionManager.run must reject with USER_CANCELLATION on aborted signal");
        console.log("  PASS  ExecutionManager.run rejects with USER_CANCELLATION on pre-aborted signal");
    }

    // Test 3: Cancellation during multi-page extraction stops loop and does not emit further progress
    {
        const multiPageFile = await createMultiPagePdf(20);
        const abortController = new AbortController();
        const progressReports: number[] = [];

        let threw = false;
        try {
            await executePdfToText(
                multiPageFile,
                {},
                undefined,
                "device",
                abortController.signal,
                (progress) => {
                    progressReports.push(progress);
                    // Cancel as soon as we reach ~10-20%
                    if (progress >= 10) {
                        abortController.abort();
                    }
                }
            );
        } catch (err: any) {
            threw = true;
            assert.ok(err instanceof ExecutionError, "Expected ExecutionError");
            assert.strictEqual(err.code, "USER_CANCELLATION");
        }

        assert.ok(threw, "Cancellation during multi-page processing must throw USER_CANCELLATION");
        assert.ok(progressReports.length > 0, "Should have received initial progress");
        // Ensure progress stopped before 100%
        const lastProgress = progressReports[progressReports.length - 1];
        assert.ok(lastProgress < 100, `Progress should not reach 100% (was ${lastProgress}%)`);
        console.log(`  PASS  Cancellation halts multi-page extraction at ${lastProgress}% without reaching 100%`);
    }

    // Test 4: Verify normal execution produces output and reaches 100% progress when not aborted
    {
        const sampleFile = loadFixture("sample.pdf");
        const progressReports: number[] = [];
        const abortController = new AbortController();

        const blob = await executePdfToText(
            sampleFile,
            {},
            undefined,
            "device",
            abortController.signal,
            (progress) => {
                progressReports.push(progress);
            }
        );

        assert.ok(blob instanceof Blob, "Expected valid output Blob");
        assert.ok(progressReports.length > 0, "Expected progress reports");
        assert.strictEqual(progressReports[progressReports.length - 1], 100, "Progress should reach 100%");
        const text = await blob.text();
        assert.ok(text.includes("--- START OF PAGE 1 ---"), "Expected valid extracted text");
        console.log("  PASS  Non-cancelled extraction completes with 100% progress and valid output");
    }

    console.log("\nAll PDF to Text Cancellation Unit Tests passed! ✓\n");
}

runTests().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
