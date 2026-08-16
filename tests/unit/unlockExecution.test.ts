import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { CloudExecutor } from "@/lib/execution/CloudExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "@/lib/execution/ExecutionSafetyGate";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

export async function runUnlockExecutionTests() {
    setupNodeWasmWorker();
    console.log("=================================================");
    console.log("     RUNNING UNLOCK PDF HYBRID UNIT TESTS        ");
    console.log("=================================================");

    // 1. ClientExecutor.isSupported
    assert.strictEqual(ClientExecutor.isSupported("unlock"), true);
    assert.strictEqual(ClientExecutor.isSupported("unlock_pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("unlock-pdf"), true);
    assert.strictEqual(ClientExecutor.isSupported("security_unlock"), true);
    assert.strictEqual(ClientExecutor.isSupported("decrypt"), true);
    console.log("✓ [PASS] 1. ClientExecutor.isSupported evaluates true for all 5 aliases");

    // Helper: Load encrypted PDF fixture
    function loadEncryptedFixture(fileName = "encrypted_sample.pdf", password = "secret123"): File {
        const fixturePath = path.resolve(process.cwd(), "tests/fixtures", fileName);
        const buffer = fs.readFileSync(fixturePath);
        const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        const file = new File([arrayBuf], fileName, { type: "application/pdf" });
        (file as any).originalPassword = password;
        return file;
    }

    // 2. Successful local decryption in Device mode (AES-256)
    const encFile256 = loadEncryptedFixture("encrypted_sample.pdf", "secret123");
    const decryptedBlob = await ClientExecutor.execute({
        tool: "unlock",
        files: [encFile256],
        params: { password: "secret123" },
        mode: "device",
        password: "secret123",
    });

    assert.strictEqual(decryptedBlob.type, "application/pdf");
    const decArrayBuf = await decryptedBlob.arrayBuffer();
    const decBytes = new Uint8Array(decArrayBuf);
    assert.strictEqual(String.fromCharCode(...decBytes.slice(0, 5)), "%PDF-");
    console.log("✓ [PASS] 2. Successful local decryption in Device mode produces valid %PDF- output");

    // 3. Output PDF can be parsed by pdf-lib without encryption errors
    const parsedDecryptedDoc = await PDFDocument.load(decArrayBuf);
    assert.ok(parsedDecryptedDoc.getPageCount() >= 1);
    console.log("✓ [PASS] 3. Decrypted PDF opens in pdf-lib cleanly with /Encrypt removed");

    // 4. Successful decryption of AES-128 fixture
    const encFile128 = loadEncryptedFixture("encrypted_sample_128.pdf", "secret123");
    const dec128Blob = await ClientExecutor.execute({
        tool: "unlock",
        files: [encFile128],
        params: { password: "secret123" },
        mode: "device",
        password: "secret123",
    });
    const dec128Doc = await PDFDocument.load(await dec128Blob.arrayBuffer());
    assert.ok(dec128Doc.getPageCount() >= 1);
    console.log("✓ [PASS] 4. Successful decryption of AES-128 encrypted fixture");

    // 5. Decryption with Owner Password
    const ownerDecBlob = await ClientExecutor.execute({
        tool: "unlock",
        files: [encFile256],
        params: { password: "owner123" },
        mode: "device",
        password: "owner123",
    });
    const ownerDoc = await PDFDocument.load(await ownerDecBlob.arrayBuffer());
    assert.ok(ownerDoc.getPageCount() >= 1);
    console.log("✓ [PASS] 5. Successful decryption using Owner Password");

    // 6. Wrong password triggers DECRYPTION_AUTH_FAILED
    try {
        await ClientExecutor.execute({
            tool: "unlock",
            files: [encFile256],
            params: { password: "wrong_password_xyz" },
            mode: "device",
            password: "wrong_password_xyz",
        });
        assert.fail("Should have thrown error on wrong password");
    } catch (err: any) {
        assert.strictEqual(err.code, "DECRYPTION_AUTH_FAILED");
        console.log("✓ [PASS] 6. Wrong password cleanly returns DECRYPTION_AUTH_FAILED");
    }

    // 7. Missing password throws INVALID_INPUT
    try {
        const noPassFile = new File([decBytes], "test.pdf", { type: "application/pdf" });
        await ClientExecutor.execute({
            tool: "unlock",
            files: [noPassFile],
            params: { password: "" },
            mode: "device",
            password: "",
        });
        assert.fail("Should have thrown error on empty password");
    } catch (err: any) {
        assert.strictEqual(err.code, "INVALID_INPUT");
        console.log("✓ [PASS] 7. Missing password throws INVALID_INPUT error");
    }

    // 8. Invalid PDF header throws INVALID_INPUT
    try {
        const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.pdf", { type: "application/pdf" });
        await ClientExecutor.execute({
            tool: "unlock",
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

    // 9. Auto mode executes locally with 0 cloud calls on safe input
    let cloudCalled = false;
    const origCloudExec = CloudExecutor.execute;
    CloudExecutor.execute = async () => {
        cloudCalled = true;
        return new Blob(["mock-cloud-unlocked-pdf"], { type: "application/pdf" });
    };

    try {
        const autoFile = loadEncryptedFixture("encrypted_sample.pdf", "secret123");
        const autoResult = await ExecutionManager.run({
            tool: "unlock",
            files: [autoFile],
            params: { password: "secret123" },
            mode: "auto",
            password: "secret123",
        });

        assert.strictEqual(cloudCalled, false, "Auto mode must not call CloudExecutor on safe input");
        assert.strictEqual(autoResult.executionMode, "client");
        assert.strictEqual(autoResult.fallbackOccurred, false);
        console.log("✓ [PASS] 9. Auto mode executes 100% locally with 0 cloud calls");

        // 10. Device mode executes locally with 0 cloud calls
        cloudCalled = false;
        const devResult = await ExecutionManager.run({
            tool: "unlock",
            files: [autoFile],
            params: { password: "secret123" },
            mode: "device",
            password: "secret123",
        });
        assert.strictEqual(cloudCalled, false, "Device mode must not call CloudExecutor");
        assert.strictEqual(devResult.executionMode, "client");
        console.log("✓ [PASS] 10. Device mode executes 100% locally with 0 cloud calls");

        // 11. Explicit Cloud mode invokes CloudExecutor
        cloudCalled = false;
        const cloudResult = await ExecutionManager.run({
            tool: "unlock",
            files: [autoFile],
            params: { password: "secret123" },
            mode: "cloud",
            password: "secret123",
        });
        assert.strictEqual(cloudCalled, true, "Cloud mode must call CloudExecutor");
        assert.strictEqual(cloudResult.executionMode, "cloud");
        console.log("✓ [PASS] 11. Explicit Cloud mode invokes CloudExecutor");

        // 12. Wrong password in Auto mode does NOT trigger cloud fallback
        cloudCalled = false;
        try {
            await ExecutionManager.run({
                tool: "unlock",
                files: [autoFile],
                params: { password: "wrong_password_test" },
                mode: "auto",
                password: "wrong_password_test",
            });
        } catch (err: any) {
            assert.strictEqual(cloudCalled, false, "Wrong password must fail directly without Cloud fallback");
            console.log("✓ [PASS] 12. Wrong password in Auto mode does NOT fall back to Cloud");
        }
    } finally {
        CloudExecutor.execute = origCloudExec;
    }

    // 13. ExecutionSafetyGate rejects 26MB file for local execution
    const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyEval = ExecutionSafetyGate.evaluate("unlock", [largeFile], "CLIENT_PREFERRED");
    assert.strictEqual(safetyEval.eligible, false, "26MB file must exceed client safety gate");
    console.log("✓ [PASS] 13. ExecutionSafetyGate rejects 26MB file for local execution");

    // 14. Empty files array throws INVALID_INPUT
    try {
        await ClientExecutor.execute({
            tool: "unlock",
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
    console.log("   UNLOCK PDF TEST SUMMARY: 14 PASSED, 0 FAILED  ");
    console.log("=================================================\n");
}
