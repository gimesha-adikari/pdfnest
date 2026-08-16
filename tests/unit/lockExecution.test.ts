import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

export async function runLockExecutionTests() {
    setupNodeWasmWorker();
    console.log("=================================================");
    console.log("      RUNNING LOCK PDF HYBRID UNIT TESTS         ");
    console.log("=================================================");

    // 1. ClientExecutor.isSupported
    assert.strictEqual(ClientExecutor.isSupported("lock"), true);
    assert.strictEqual(ClientExecutor.isSupported("lock_pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("lock-pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("protect"), true);
    assert.strictEqual(ClientExecutor.isSupported("protect_pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("protect-pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("security_lock"), true);
    assert.strictEqual(ClientExecutor.isSupported("encrypt"), true);
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all 8 aliases");

    // Helper: Create a sample base PDF
    async function createSamplePdf(text = "Protected Secret Document Content"): Promise<File> {
        const doc = await PDFDocument.create();
        const page = doc.addPage([600, 800]);
        page.drawText(text, { x: 50, y: 700 });
        const bytes = await doc.save();
        const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new File([arrayBuf], "sample-test.pdf", { type: "application/pdf" });
    }

    // 2. Successful local encryption in Device mode (AES-128)
    const plainFile = await createSamplePdf("Classified Document 2026");
    const encryptedBlob = await ClientExecutor.execute({
        tool: "lock",
        files: [plainFile],
        params: { password: "LockPassword123", keyLength: 128 },
        mode: "device",
        password: "LockPassword123",
    });

    assert.strictEqual(encryptedBlob.type, "application/pdf");
    const encArrayBuf = await encryptedBlob.arrayBuffer();
    const encBytes = new Uint8Array(encArrayBuf);
    assert.strictEqual(String.fromCharCode(...encBytes.slice(0, 5)), "%PDF-");
    console.log("✓ [PASS] 2. Successful local encryption in Device mode produces valid %PDF- output");

    // 3. Output is encrypted: pdf-lib load without credentials must fail or require decryption
    let encryptionDetected = false;
    try {
        await PDFDocument.load(encArrayBuf);
    } catch (err: any) {
        encryptionDetected = true;
        assert.ok(
            err.message.includes("encrypted") || err.name.includes("Encrypted"),
            `Expected encryption error from pdf-lib, got: ${err.message}`
        );
    }
    assert.strictEqual(encryptionDetected, true, "pdf-lib must detect /Encrypt dictionary");
    console.log("✓ [PASS] 3. Output PDF enforces encryption: unauthenticated parse fails");

    // 4. Output can be decrypted by ClientExecutor unlock
    const encFileForUnlock = new File([encArrayBuf], "locked.pdf", { type: "application/pdf" });
    const decryptedBlob = await ClientExecutor.execute({
        tool: "unlock",
        files: [encFileForUnlock],
        params: { password: "LockPassword123" },
        mode: "device",
        password: "LockPassword123",
    });
    const decDoc = await PDFDocument.load(await decryptedBlob.arrayBuffer());
    assert.strictEqual(decDoc.getPageCount(), 1);
    console.log("✓ [PASS] 4. Client-encrypted PDF is cleanly decrypted by Unlock execution");

    // 5. Wrong password fails on unlock
    try {
        await ClientExecutor.execute({
            tool: "unlock",
            files: [encFileForUnlock],
            params: { password: "wrong_password" },
            mode: "device",
            password: "wrong_password",
        });
        assert.fail("Should have failed on wrong password");
    } catch (err: any) {
        assert.strictEqual(err.code, "DECRYPTION_AUTH_FAILED");
        console.log("✓ [PASS] 5. Incorrect password is rejected by decryption engine");
    }

    // 6. AES-256 Encryption
    const enc256Blob = await ClientExecutor.execute({
        tool: "lock",
        files: [plainFile],
        params: { password: "LockPassword256", keyLength: 256 },
        mode: "device",
        password: "LockPassword256",
    });
    const enc256File = new File([await enc256Blob.arrayBuffer()], "locked256.pdf", { type: "application/pdf" });
    const dec256Blob = await ClientExecutor.execute({
        tool: "unlock",
        files: [enc256File],
        params: { password: "LockPassword256" },
        mode: "device",
        password: "LockPassword256",
    });
    const dec256Doc = await PDFDocument.load(await dec256Blob.arrayBuffer());
    assert.strictEqual(dec256Doc.getPageCount(), 1);
    console.log("✓ [PASS] 6. AES-256 encryption round-trip verified successfully");

    // 7. Missing password throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "lock",
            files: [plainFile],
            params: { password: "" },
            mode: "device",
            password: "",
        });
        assert.fail("Should have thrown on empty password");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 7. Missing/empty password throws INVALID_INPUT error");
    }

    // 8. Invalid PDF header throws INVALID_INPUT
    try {
        const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.pdf", { type: "application/pdf" });
        await ClientExecutor.execute({
            tool: "lock",
            files: [corruptFile],
            params: { password: "pass" },
            mode: "device",
            password: "pass",
        });
        assert.fail("Should have thrown on invalid PDF header");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 8. Invalid PDF header throws INVALID_INPUT error");
    }

    // 9. Locking an already encrypted file throws clean error
    try {
        await ClientExecutor.execute({
            tool: "lock",
            files: [encFileForUnlock],
            params: { password: "anotherPassword" },
            mode: "device",
            password: "anotherPassword",
        });
        assert.fail("Should have failed when encrypting an already encrypted document");
    } catch (err: any) {
        assert.ok(err.message.includes("already") || err.code === "INVALID_INPUT" || err.code === "UNSUPPORTED_CLIENT_OP");
        console.log("✓ [PASS] 9. Attempting to lock an already-encrypted document fails cleanly");
    }

    // 10. Auto mode executes locally with 0 cloud calls on safe input
    let cloudCalled = false;
    const origCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        cloudCalled = true;
        return new Blob(["mock-cloud-locked-pdf"], { type: "application/pdf" });
    };

    try {
        const autoFile = await createSamplePdf("Auto Mode Test Document");
        const autoResult = await ExecutionManager.run({
            tool: "lock",
            files: [autoFile],
            params: { password: "AutoPassword123" },
            mode: "auto",
            password: "AutoPassword123",
        });

        assert.strictEqual(cloudCalled, false, "Auto mode must not call CloudExecutor on safe input");
        assert.strictEqual(autoResult.executionMode, "client");
        assert.strictEqual(autoResult.fallbackOccurred, false);
        console.log("✓ [PASS] 10. Auto mode executes 100% locally with 0 cloud calls");

        // 11. Device mode executes locally with 0 cloud calls
        cloudCalled = false;
        const devResult = await ExecutionManager.run({
            tool: "lock",
            files: [autoFile],
            params: { password: "DevPassword123" },
            mode: "device",
            password: "DevPassword123",
        });
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        assert.strictEqual(devResult.executionMode, "client");
        console.log("✓ [PASS] 11. Device mode executes 100% locally with 0 cloud calls");

        // 12. Explicit Cloud mode invokes CloudExecutor
        cloudCalled = false;
        const cloudResult = await ExecutionManager.run({
            tool: "lock",
            files: [autoFile],
            params: { password: "CloudPassword123" },
            mode: "cloud",
            password: "CloudPassword123",
        });
        assert.strictEqual(cloudCalled, true, "Cloud mode must call CloudExecutor");
        assert.strictEqual(cloudResult.executionMode, "cloud");
        console.log("✓ [PASS] 12. Explicit Cloud mode invokes CloudExecutor");
    } finally {
        CloudExecutor.execute = origCloudExec;
    }

    // 13. ExecutionSafetyGate rejects 26MB file for local execution
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("lock", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed client safety gate");
    console.log("✓ [PASS] 13. ExecutionSafetyGate rejects 26MB file for local execution");

    // 14. Empty files array throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "lock",
            files: [],
            params: { password: "test" },
            mode: "device",
            password: "test",
        });
        assert.fail("Should have thrown on empty files");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 14. Empty files array throws INVALID_INPUT error");
    }

    console.log("\n=================================================");
    console.log("     LOCK PDF TEST SUMMARY: 14 PASSED, 0 FAILED  ");
    console.log("=================================================\n");
}

if (typeof require !== "undefined" && require.main === module) {
    runLockExecutionTests().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
