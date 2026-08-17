import assert from "assert";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "@/lib/execution/ClientExecutor";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { executePdfcpuWasmOptimize } from "@/lib/execution/pdfcpu/pdfcpuClient";
import { OFFLINE_TOOL_COUNT, CLIENT_CAPABLE_TOOL_COUNT, NAV_TOOLS_FALLBACK } from "@/lib/toolsData";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

async function runRepairUnitTests() {
    setupNodeWasmWorker();
    console.log("=================================================");
    console.log("     RUNNING REPAIR PDF (WAVE 8) UNIT TESTS      ");
    console.log("=================================================");

    function loadFixtureFile(name: string): File {
        const fixturePath = path.resolve(process.cwd(), "tests/fixtures", name);
        const buffer = fs.readFileSync(fixturePath);
        const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        return new File([arrayBuf], name, { type: "application/pdf" });
    }

    // -------------------------------------------------------------
    // TEST 1: Capability Registry Status (24 Offline Tools)
    // -------------------------------------------------------------
    assert.strictEqual(OFFLINE_TOOL_COUNT, 24, "OFFLINE_TOOL_COUNT must be exactly 24");
    assert.strictEqual(CLIENT_CAPABLE_TOOL_COUNT, 24, "CLIENT_CAPABLE_TOOL_COUNT must be exactly 24");

    const repairTool = NAV_TOOLS_FALLBACK.find((t) => t.href === "/repair-pdf");
    assert.ok(repairTool, "Repair PDF tool must be registered in NAV_TOOLS_FALLBACK");
    assert.strictEqual(repairTool?.toolPolicy, "CLIENT_PREFERRED");
    assert.strictEqual(repairTool?.capability?.clientExecutable, true);
    assert.strictEqual(repairTool?.capability?.workspaceOffline, true);
    assert.strictEqual(repairTool?.capability?.requiresBackend, false);

    const signTool = NAV_TOOLS_FALLBACK.find((t) => t.href === "/sign-pdf");
    assert.ok(signTool, "Sign PDF tool must be registered in NAV_TOOLS_FALLBACK");
    assert.strictEqual(signTool?.toolPolicy, "CLIENT_PREFERRED");
    assert.strictEqual(signTool?.capability?.clientExecutable, true);
    assert.strictEqual(signTool?.capability?.workspaceOffline, true);
    assert.strictEqual(signTool?.capability?.requiresBackend, false);

    console.log("✓ TEST 1: Capability registry reflects 24 offline tools with Repair & Sign CLIENT_PREFERRED.");

    // -------------------------------------------------------------
    // TEST 2: ClientExecutor.isSupported for Repair aliases
    // -------------------------------------------------------------
    const repairAliases = ["repair", "repair_pdf", "repair-pdf", "structure_repair"];
    for (const alias of repairAliases) {
        assert.strictEqual(
            ClientExecutor.isSupported(alias),
            true,
            `ClientExecutor.isSupported('${alias}') must be true`
        );
    }
    console.log("✓ TEST 2: ClientExecutor recognizes all repair aliases.");

    // -------------------------------------------------------------
    // TEST 3: Structural Repair execution on fixture document
    // -------------------------------------------------------------
    const sampleFile = loadFixtureFile("sample.pdf");
    const repairedBlob = await executePdfcpuWasmOptimize(sampleFile);
    assert.ok(repairedBlob instanceof Blob, "executePdfcpuWasmOptimize must return Blob");
    assert.strictEqual(repairedBlob.type, "application/pdf");

    const repairedBuf = await repairedBlob.arrayBuffer();
    const repairedDoc = await PDFDocument.load(repairedBuf);
    assert.strictEqual(repairedDoc.getPageCount(), 3, "Page count must remain preserved");
    console.log("✓ TEST 3: Structural repair via pdfcpu WASM preserves document structure and 3 pages.");

    // -------------------------------------------------------------
    // TEST 4: ExecutionManager Device Mode routing
    // -------------------------------------------------------------
    const execResult = await ExecutionManager.run({
        tool: "repair",
        files: [sampleFile],
        mode: "device",
    });
    assert.ok(execResult.blob instanceof Blob);
    assert.strictEqual(execResult.fileName, "repaired_sample.pdf");
    console.log("✓ TEST 4: ExecutionManager device routing produced repaired_sample.pdf.");

    // -------------------------------------------------------------
    // TEST 5: Error handling on non-PDF input
    // -------------------------------------------------------------
    const corruptFile = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], "corrupted.bin", { type: "application/pdf" });
    await assert.rejects(
        () => executePdfcpuWasmOptimize(corruptFile),
        /missing %PDF- header/
    );
    console.log("✓ TEST 5: Error handling on corrupt/non-PDF header verified.");

    console.log("\n=================================================");
    console.log("    ALL REPAIR PDF UNIT TESTS PASSED (5/5)       ");
    console.log("=================================================\n");
}

runRepairUnitTests().catch((err) => {
    console.error("Repair unit test failure:", err);
    process.exit(1);
});
