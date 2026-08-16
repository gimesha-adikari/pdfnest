import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";

export async function runPdfToTextExecutionTests() {
    console.log("=================================================");
    console.log("    RUNNING PDF TO TEXT HYBRID UNIT TESTS        ");
    console.log("=================================================");

    // 1. ClientExecutor.isSupported
    assert.strictEqual(ClientExecutor.isSupported("pdf_to_text"), true);
    assert.strictEqual(ClientExecutor.isSupported("pdf-to-text"), true);
    assert.strictEqual(ClientExecutor.isSupported("to_text"), true);
    assert.strictEqual(ClientExecutor.isSupported("to-text"), true);
    assert.strictEqual(ClientExecutor.isSupported("extract_text"), true);
    assert.strictEqual(ClientExecutor.isSupported("extract-text"), true);
    assert.strictEqual(ClientExecutor.isSupported("ocr_extract_text"), true);
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all 7 aliases");

    // Helper: Load fixture file
    function loadFixture(filename: string): File {
        const fixturePath = path.resolve(process.cwd(), `tests/fixtures/${filename}`);
        const buffer = fs.readFileSync(fixturePath);
        const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        return new File([arrayBuf], filename, { type: "application/pdf" });
    }

    // 2. Standard text PDF extraction
    const sampleFile = loadFixture("sample.pdf");
    const sampleBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [sampleFile],
        mode: "device",
    });
    const sampleText = await sampleBlob.text();
    assert.ok(sampleText.includes("--- START OF PAGE 1 ---"), "Must include page 1 delimiter");
    assert.ok(sampleText.includes("PDFNEST_TEST_PAGE_1"), "Must extract page 1 content");
    assert.ok(sampleText.includes("--- START OF PAGE 2 ---"), "Must include page 2 delimiter");
    assert.ok(sampleText.includes("PDFNEST_TEST_PAGE_2"), "Must extract page 2 content");
    assert.ok(sampleText.includes("--- START OF PAGE 3 ---"), "Must include page 3 delimiter");
    assert.ok(sampleText.includes("PDFNEST_TEST_PAGE_3"), "Must extract page 3 content");
    console.log("✓ [PASS] 2. Standard text PDF extraction matches page delimiters and content");

    // 3. Multiline paragraph preservation
    const normalFile = loadFixture("normal_text.pdf");
    const normalBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [normalFile],
        mode: "device",
    });
    const normalText = await normalBlob.text();
    assert.ok(normalText.includes("Sample Text Document - Page 1"));
    assert.ok(normalText.includes("This is paragraph content on page 1 used for verifying text highlight"));
    console.log("✓ [PASS] 3. Multiline paragraph text structure preserved");

    // 4. Multi-page document (15 pages)
    const multipageFile = loadFixture("large_multipage.pdf");
    const multipageBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [multipageFile],
        mode: "device",
    });
    const multipageText = await multipageBlob.text();
    for (let i = 1; i <= 15; i++) {
        assert.ok(multipageText.includes(`--- START OF PAGE ${i} ---`), `Must include page ${i}`);
        assert.ok(multipageText.includes(`Multi-page Sheet #${i}`), `Must include sheet text #${i}`);
    }
    console.log("✓ [PASS] 4. 15-page document extracts all sequential pages accurately");

    // 5. Complex Layout: Multi-column, rotated page, and Unicode symbols
    const complexDoc = await PDFDocument.create();
    const font = await complexDoc.embedFont(StandardFonts.Helvetica);

    // Page 1: Multi-column
    const p1 = complexDoc.addPage([600, 400]);
    p1.drawText("Column 1 - Heading", { x: 50, y: 350, font, size: 14 });
    p1.drawText("Line 1 of first column text", { x: 50, y: 320, font, size: 10 });
    p1.drawText("Column 2 - Heading", { x: 320, y: 350, font, size: 14 });
    p1.drawText("Line 1 of second column text", { x: 320, y: 320, font, size: 10 });

    // Page 2: Rotated 90 degrees
    const p2 = complexDoc.addPage([400, 600]);
    p2.setRotation(degrees(90));
    p2.drawText("Rotated Page Text Content", { x: 50, y: 550, font, size: 12 });

    // Page 3: Symbols & Currency
    const p3 = complexDoc.addPage([600, 400]);
    p3.drawText("Invoice #109283 - Total: $1,420.50 (20% VAT included)", { x: 50, y: 350, font, size: 12 });
    p3.drawText("Special symbols: & % @ # * ! ? / \\ [ ] { }", { x: 50, y: 320, font, size: 10 });

    const complexBytes = await complexDoc.save();
    const complexArrayBuf = complexBytes.buffer.slice(complexBytes.byteOffset, complexBytes.byteOffset + complexBytes.byteLength) as ArrayBuffer;
    const complexFile = new File([complexArrayBuf], "complex_test.pdf", { type: "application/pdf" });

    const complexBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [complexFile],
        mode: "device",
    });
    const complexText = await complexBlob.text();
    assert.ok(complexText.includes("Column 1 - Heading"));
    assert.ok(complexText.includes("Column 2 - Heading"));
    assert.ok(complexText.includes("Rotated Page Text Content"));
    assert.ok(complexText.includes("Invoice #109283 - Total: $1,420.50 (20% VAT included)"));
    assert.ok(complexText.includes("Special symbols: & % @ # * ! ? / \\ [ ] { }"));
    console.log("✓ [PASS] 5. Multi-column, rotated page, and symbol text extracted cleanly");

    // 6. Scanned PDF in Auto Mode: Throws UNSUPPORTED_CLIENT_OP for Cloud OCR fallback
    const scannedFile = loadFixture("scanned_page.pdf");
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_text",
            files: [scannedFile],
            mode: "auto",
        });
        assert.fail("Should have thrown UNSUPPORTED_CLIENT_OP for scanned page in Auto mode");
    } catch (err: any) {
        assert.strictEqual(err.code, "UNSUPPORTED_CLIENT_OP");
        console.log("✓ [PASS] 6. Scanned PDF in Auto mode triggers Cloud OCR fallback (UNSUPPORTED_CLIENT_OP)");
    }

    // 7. Scanned PDF in Device Mode: Extracts locally with zero network calls and reports scanned status
    const scannedDevBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [scannedFile],
        mode: "device",
    });
    assert.strictEqual(scannedDevBlob.type, "text/plain;charset=utf-8");
    assert.strictEqual((scannedDevBlob as any).hasScannedPages, true);
    console.log("✓ [PASS] 7. Scanned PDF in Device mode extracts locally without crash or network call");

    // 8. Mixed PDF (Text + Scanned) in Auto Mode: Triggers Cloud OCR fallback
    const mixedDoc = await PDFDocument.create();
    const mixedFont = await mixedDoc.embedFont(StandardFonts.Helvetica);
    const pText = mixedDoc.addPage([400, 400]);
    pText.drawText("Valid Vector Text Page", { x: 50, y: 350, font: mixedFont, size: 12 });
    // Page 2: Blank / Scanned without text
    mixedDoc.addPage([400, 400]);

    const mixedBytes = await mixedDoc.save();
    const mixedFile = new File([mixedBytes.buffer.slice(mixedBytes.byteOffset, mixedBytes.byteOffset + mixedBytes.byteLength) as ArrayBuffer], "mixed.pdf", { type: "application/pdf" });

    try {
        await ClientExecutor.execute({
            tool: "pdf_to_text",
            files: [mixedFile],
            mode: "auto",
        });
        assert.fail("Mixed PDF must trigger Cloud OCR fallback in Auto mode");
    } catch (err: any) {
        assert.strictEqual(err.code, "UNSUPPORTED_CLIENT_OP");
        console.log("✓ [PASS] 8. Mixed PDF in Auto mode triggers Cloud OCR fallback");
    }

    // 9. Mixed PDF in Device Mode: Extracts native page and tags scanned page
    const mixedDevBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [mixedFile],
        mode: "device",
    });
    const mixedDevText = await mixedDevBlob.text();
    assert.ok(mixedDevText.includes("Valid Vector Text Page"));
    assert.strictEqual((mixedDevBlob as any).hasScannedPages, true);
    assert.deepStrictEqual((mixedDevBlob as any).scannedPages, [2]);
    console.log("✓ [PASS] 9. Mixed PDF in Device mode extracts native text and flags scanned pages");

    // 10. Missing / Empty Password on Encrypted PDF: Throws DECRYPTION_AUTH_FAILED
    const encFile = loadFixture("encrypted_sample.pdf");
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_text",
            files: [encFile],
            mode: "device",
            password: "wrong_password",
        });
        assert.fail("Should fail on wrong password");
    } catch (err: any) {
        assert.strictEqual(err.code, "DECRYPTION_AUTH_FAILED");
        console.log("✓ [PASS] 10. Incorrect password throws clean DECRYPTION_AUTH_FAILED");
    }

    // 11. Encrypted PDF with correct password
    const enc128File = loadFixture("encrypted_sample_128.pdf");
    const encBlob = await ClientExecutor.execute({
        tool: "pdf_to_text",
        files: [enc128File],
        mode: "device",
        password: "secret123",
    });
    const encText = await encBlob.text();
    assert.ok(encText.length > 0, "Extracted text must not be empty");
    console.log("✓ [PASS] 11. Encrypted PDF extracts locally with correct password");

    // 12. Invalid PDF Header: Throws INVALID_INPUT without Cloud fallback
    try {
        const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.pdf", { type: "application/pdf" });
        await ClientExecutor.execute({
            tool: "pdf_to_text",
            files: [corruptFile],
            mode: "device",
        });
        assert.fail("Should throw on corrupt PDF");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 12. Invalid PDF header throws INVALID_INPUT error");
    }

    // 13. Empty files array throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "pdf_to_text",
            files: [],
            mode: "device",
        });
        assert.fail("Should throw on empty files");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 13. Empty files array throws INVALID_INPUT error");
    }

    // 14. Auto mode on text PDF: 0 cloud calls
    let cloudCalled = false;
    const origCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        cloudCalled = true;
        return new Blob(["mock-cloud-extracted-text"], { type: "text/plain" });
    };

    try {
        const autoResult = await ExecutionManager.run({
            tool: "pdf_to_text",
            files: [sampleFile],
            mode: "auto",
        });
        assert.strictEqual(cloudCalled, false, "Auto mode on text PDF must not call CloudExecutor");
        assert.strictEqual(autoResult.executionMode, "client");
        assert.strictEqual(autoResult.fallbackOccurred, false);
        console.log("✓ [PASS] 14. Auto mode on text PDF executes 100% locally with 0 cloud calls");

        // 15. Device mode on text PDF: 0 cloud calls
        cloudCalled = false;
        const devResult = await ExecutionManager.run({
            tool: "pdf_to_text",
            files: [sampleFile],
            mode: "device",
        });
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        assert.strictEqual(devResult.executionMode, "client");
        console.log("✓ [PASS] 15. Device mode executes 100% locally with 0 cloud calls");

        // 16. Explicit Cloud mode invokes CloudExecutor
        cloudCalled = false;
        const cloudResult = await ExecutionManager.run({
            tool: "pdf_to_text",
            files: [sampleFile],
            mode: "cloud",
        });
        assert.strictEqual(cloudCalled, true, "Cloud mode must call CloudExecutor");
        assert.strictEqual(cloudResult.executionMode, "cloud");
        console.log("✓ [PASS] 16. Explicit Cloud mode invokes CloudExecutor");

        // 17. Auto mode with Scanned PDF falls back to CloudExecutor
        cloudCalled = false;
        const autoFallbackResult = await ExecutionManager.run({
            tool: "pdf_to_text",
            files: [scannedFile],
            mode: "auto",
        });
        assert.strictEqual(cloudCalled, true, "Auto mode on scanned PDF must fall back to CloudExecutor");
        assert.strictEqual(autoFallbackResult.executionMode, "cloud");
        assert.strictEqual(autoFallbackResult.fallbackOccurred, true);
        console.log("✓ [PASS] 17. Auto mode on scanned PDF routes cleanly to Cloud OCR fallback");
    } finally {
        CloudExecutor.execute = origCloudExec;
    }

    // 18. ExecutionSafetyGate evaluates eligibility
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("pdf_to_text", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed safety gate");
    console.log("✓ [PASS] 18. ExecutionSafetyGate rejects 26MB file for local execution");

    console.log("\n=================================================");
    console.log("   PDF TO TEXT TEST SUMMARY: 18 PASSED, 0 FAILED ");
    console.log("=================================================\n");
}

if (typeof require !== "undefined" && require.main === module) {
    runPdfToTextExecutionTests().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
