import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { executeCompressPdf } from "@/lib/execution/optimize/compressClient";
import { ExecutionError } from "@/lib/execution/types";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { OFFLINE_TOOL_COUNT, CLIENT_CAPABLE_TOOL_COUNT, NAV_TOOLS_FALLBACK } from "@/lib/toolsData";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

export async function runCompressExecutionTests() {
    setupNodeWasmWorker();
    console.log("=================================================");
    console.log("     RUNNING COMPRESS PDF HYBRID UNIT TESTS      ");
    console.log("=================================================");

    function loadFixtureFile(name: string): File {
        const fixturePath = path.resolve(process.cwd(), "tests/fixtures", name);
        const buffer = fs.readFileSync(fixturePath);
        const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        return new File([arrayBuf], name, { type: "application/pdf" });
    }

    // 1. Capability registry check
    assert.strictEqual(OFFLINE_TOOL_COUNT, 19, "OFFLINE_TOOL_COUNT must be 19");
    assert.strictEqual(CLIENT_CAPABLE_TOOL_COUNT, 19, "CLIENT_CAPABLE_TOOL_COUNT must be 19");

    const compressTool = NAV_TOOLS_FALLBACK.find((t) => t.href === "/compress-pdf");
    assert.ok(compressTool, "Compress PDF tool must be registered in NAV_TOOLS_FALLBACK");
    assert.strictEqual(compressTool?.toolPolicy, "CLIENT_PREFERRED");
    assert.strictEqual(compressTool?.capability?.clientExecutable, true);
    assert.strictEqual(compressTool?.capability?.workspaceOffline, true);
    assert.strictEqual(compressTool?.capability?.requiresBackend, false);
    console.log("✓ [PASS] 1. Capability registry exports 19 offline-capable tools with CLIENT_PREFERRED Compress PDF");

    // 2. ClientExecutor.isSupported aliases
    assert.strictEqual(ClientExecutor.isSupported("compress"), true);
    assert.strictEqual(ClientExecutor.isSupported("compress_pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("compress-pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("optimize"), true);
    assert.strictEqual(ClientExecutor.isSupported("optimize_pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("optimize-pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("optimize_compress"), true);
    console.log("✓ [PASS] 2. ClientExecutor recognizes all 7 compress/optimize aliases");

    // 3. LOW compression level (lossless structural optimization)
    const fileSample = loadFixtureFile("sample.pdf");
    const lowBlob = await executeCompressPdf(fileSample, { level: "low" }, undefined, "auto");
    assert.strictEqual(lowBlob.type, "application/pdf");
    const lowBuf = await lowBlob.arrayBuffer();
    const lowDoc = await PDFDocument.load(lowBuf);
    assert.strictEqual(lowDoc.getPageCount(), 3);
    console.log("✓ [PASS] 3. LOW level performs lossless structural optimization and preserves page count");

    // 4. Zero Size Expansion Invariant
    assert.strictEqual(lowBlob.size, fileSample.size, "Output size must not exceed original size");
    assert.strictEqual((lowBlob as any).zeroExpansionApplied, true);
    assert.strictEqual((lowBlob as any).reductionPercent, 0);
    console.log("✓ [PASS] 4. Zero Size Expansion safely returns original bytes when optimization yields no reduction");

    // 5. MEDIUM compression level on vector document
    const fileNormal = loadFixtureFile("normal_text.pdf");
    const medBlob = await executeCompressPdf(fileNormal, { level: "medium" }, undefined, "auto");
    assert.strictEqual(medBlob.type, "application/pdf");
    assert.ok(medBlob.size <= fileNormal.size);
    const medBuf = await medBlob.arrayBuffer();
    const medDoc = await PDFDocument.load(medBuf);
    assert.strictEqual(medDoc.getPageCount(), 3);
    console.log("✓ [PASS] 5. MEDIUM level executes locally on vector text documents");

    // 6. HIGH compression level in Auto mode (routes to Cloud)
    let autoHighRouted = false;
    try {
        await executeCompressPdf(fileSample, { level: "high" }, undefined, "auto");
    } catch (err: any) {
        if (err.code === "UNSUPPORTED_CLIENT_OP" || String(err).includes("72 DPI")) {
            autoHighRouted = true;
        }
    }
    assert.strictEqual(autoHighRouted, true, "HIGH level in Auto mode must route to Cloud");
    console.log("✓ [PASS] 6. HIGH level in Auto mode throws UNSUPPORTED_CLIENT_OP to engage Cloud downsampling");

    // 7. HIGH compression level in Device mode (local structural with limitation notice)
    const devHighBlob = await executeCompressPdf(fileSample, { level: "high" }, undefined, "device");
    assert.strictEqual(devHighBlob.type, "application/pdf");
    assert.strictEqual((devHighBlob as any).compressionLevel, "high");
    console.log("✓ [PASS] 7. HIGH level in Device mode performs local structural optimization without crashing");

    // 8. Encrypted PDF with correct password
    const encFile128 = loadFixtureFile("encrypted_sample_128.pdf");
    const encBlob = await executeCompressPdf(encFile128, { level: "low" }, "secret123", "device");
    assert.strictEqual(encBlob.type, "application/pdf");
    assert.ok(encBlob.size > 0);
    console.log("✓ [PASS] 8. Encrypted PDF with valid password optimizes successfully");

    // 9. Encrypted PDF with invalid password
    let authFailed = false;
    try {
        await executeCompressPdf(encFile128, { level: "low" }, "wrong_pw", "device");
    } catch (err: any) {
        if (err.code === "DECRYPTION_AUTH_FAILED" || String(err).toLowerCase().includes("password")) {
            authFailed = true;
        }
    }
    assert.strictEqual(authFailed, true, "Invalid password must throw DECRYPTION_AUTH_FAILED");
    console.log("✓ [PASS] 9. Encrypted PDF with invalid password throws normalized auth failure");

    // 10. Cancellation via AbortSignal
    const cancelController = new AbortController();
    cancelController.abort();
    let cancelled = false;
    try {
        await executeCompressPdf(fileNormal, { level: "medium" }, undefined, "device", cancelController.signal);
    } catch (err: any) {
        if (err.code === "USER_CANCELLATION" || String(err).toLowerCase().includes("cancel")) {
            cancelled = true;
        }
    }
    assert.strictEqual(cancelled, true, "Cancelled signal must throw USER_CANCELLATION");
    console.log("✓ [PASS] 10. Cancellation via AbortSignal aborts execution immediately");

    // 11. ClientExecutor.execute dispatching
    const clientExecBlob = await ClientExecutor.execute({
        tool: "compress",
        files: [fileSample],
        params: { level: "low" },
        mode: "device",
    });
    assert.strictEqual(clientExecBlob.type, "application/pdf");
    assert.strictEqual(clientExecBlob.size, fileSample.size);
    console.log("✓ [PASS] 11. ClientExecutor.execute dispatches compress successfully");

    console.log("=================================================");
    console.log("     ALL COMPRESS PDF UNIT TESTS PASSED (11/11)  ");
    console.log("=================================================\n");
}

if (require.main === module) {
    runCompressExecutionTests().catch((err) => {
        console.error("Test failed:", err);
        process.exit(1);
    });
}
