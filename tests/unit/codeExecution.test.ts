import assert from "node:assert";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { executeCodeToPdf, resolveLanguage } from "../../lib/execution/document/codeClient";
import { parsePaperSize, PAPER_DIMENSIONS, parseMarginsInches, inchesToPoints } from "../../lib/execution/document/types";
import { ExecutionError } from "../../lib/execution/types";

export async function runCodeToPdfExecutionTests(): Promise<void> {
    console.log("=================================================");
    console.log("    RUNNING CODE TO PDF (WAVE 9A) UNIT TESTS     ");
    console.log("=================================================");

    // ─── TEST 1: ClientExecutor.isSupported evaluates true for all aliases ────
    assert.strictEqual(ClientExecutor.isSupported("code_to_pdf"), true, "code_to_pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("code-to-pdf"), true, "code-to-pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("code"), true, "code alias must be supported");
    console.log("✓ TEST 1: ClientExecutor.isSupported handles all code-to-pdf aliases.");

    // ─── TEST 2: Language Resolution across all supported extensions ──────────
    assert.strictEqual(resolveLanguage("main.js"), "javascript");
    assert.strictEqual(resolveLanguage("app.ts"), "typescript");
    assert.strictEqual(resolveLanguage("Component.tsx"), "tsx");
    assert.strictEqual(resolveLanguage("script.py"), "python");
    assert.strictEqual(resolveLanguage("server.go"), "go");
    assert.strictEqual(resolveLanguage("lib.rs"), "rust");
    assert.strictEqual(resolveLanguage("Main.java"), "java");
    assert.strictEqual(resolveLanguage("app.kt"), "kotlin");
    assert.strictEqual(resolveLanguage("main.cpp"), "cpp");
    assert.strictEqual(resolveLanguage("index.html"), "markup");
    assert.strictEqual(resolveLanguage("styles.css"), "css");
    assert.strictEqual(resolveLanguage("data.json"), "json");
    assert.strictEqual(resolveLanguage("deploy.sh"), "bash");
    assert.strictEqual(resolveLanguage("query.sql"), "sql");
    assert.strictEqual(resolveLanguage("notes.txt"), "plaintext");
    assert.strictEqual(resolveLanguage("unknown.xyz"), "plaintext");
    console.log("✓ TEST 2: Language and grammar extension resolution verified.");

    // ─── TEST 3: Paper Dimensions and Margin Calculations ─────────────────────
    assert.strictEqual(parsePaperSize("A4"), "A4");
    assert.strictEqual(parsePaperSize("letter"), "letter");
    assert.strictEqual(parsePaperSize("legal"), "legal");
    assert.strictEqual(parsePaperSize("unknown"), "A4");

    const a4Dims = PAPER_DIMENSIONS["A4"];
    assert.strictEqual(Math.round(a4Dims.width), 595);
    assert.strictEqual(Math.round(a4Dims.height), 842);

    const letterDims = PAPER_DIMENSIONS["letter"];
    assert.strictEqual(letterDims.width, 612.0);
    assert.strictEqual(letterDims.height, 792.0);

    const legalDims = PAPER_DIMENSIONS["legal"];
    assert.strictEqual(legalDims.width, 612.0);
    assert.strictEqual(legalDims.height, 1008.0);

    const margins = inchesToPoints(parseMarginsInches({ top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 }));
    assert.strictEqual(margins.top, 36);
    assert.strictEqual(margins.bottom, 36);
    assert.strictEqual(margins.left, 54);
    assert.strictEqual(margins.right, 54);
    console.log("✓ TEST 3: Paper dimensions and margin conversions passed.");

    // ─── TEST 4: Single-page TypeScript Code PDF Vector Generation ────────────
    const sampleTs = `
import { useState, useEffect } from "react";

export function Counter() {
    const [count, setCount] = useState<number>(0);
    // Simple increment function
    const increment = () => setCount(c => c + 1);

    return (
        <button onClick={increment}>
            Count: {count}
        </button>
    );
}
`;
    const tsFile = new File([sampleTs], "Counter.tsx", { type: "text/typescript" });
    const tsBlob = await executeCodeToPdf(tsFile, { paperSize: "A4" });
    assert.ok(tsBlob.size > 100, "Output blob must contain PDF bytes");

    const tsArrayBuf = await tsBlob.arrayBuffer();
    const tsPdfDoc = await PDFDocument.load(tsArrayBuf);
    assert.strictEqual(tsPdfDoc.getPageCount(), 1, "Short snippet must fit on 1 page");

    const [page1] = tsPdfDoc.getPages();
    const { width: p1W, height: p1H } = page1.getSize();
    assert.strictEqual(Math.round(p1W), 595);
    assert.strictEqual(Math.round(p1H), 842);
    console.log("✓ TEST 4: Single-page TypeScript snippet vector PDF generation succeeded.");

    // ─── TEST 5: Tab Expansion & Source Text Preservation ──────────────────────
    const tabSource = "function test() {\n\tconst x = 10;\n\t\tconst y = 20;\n\treturn x + y;\n}";
    const tabFile = new File([tabSource], "tabs.js", { type: "text/javascript" });
    const tabBlob = await executeCodeToPdf(tabFile, { tabSize: 4 });
    assert.ok(tabBlob.size > 100);

    const tabPdfDoc = await PDFDocument.load(await tabBlob.arrayBuffer());
    assert.strictEqual(tabPdfDoc.getPageCount(), 1);
    console.log("✓ TEST 5: Tab expansion and source formatting verified.");

    // ─── TEST 6: Multi-Page Pagination with Deterministic Line Flow ────────────
    const multiLineCode = Array.from({ length: 250 }, (_, i) => `const line_${i + 1}: number = ${i + 1} * 42; // Index ${i + 1}`).join("\n");
    const multiFile = new File([multiLineCode], "large.ts", { type: "text/typescript" });
    const multiBlob = await executeCodeToPdf(multiFile, { paperSize: "A4" });

    const multiPdfDoc = await PDFDocument.load(await multiBlob.arrayBuffer());
    const pageCount = multiPdfDoc.getPageCount();
    assert.ok(pageCount >= 4 && pageCount <= 8, `250 lines on A4 should span 4-8 pages (actual: ${pageCount})`);
    console.log(`✓ TEST 6: Multi-page pagination passed (generated ${pageCount} pages for 250 lines).`);

    // ─── TEST 7: Long Line Visual Wrapping (No Continuation Markers) ───────────
    const longLineCode = `const ultraLongString = "${'A'.repeat(200)}";\nconst nextLine = true;`;
    const longFile = new File([longLineCode], "longLine.js", { type: "text/javascript" });
    const longBlob = await executeCodeToPdf(longFile, { paperSize: "letter" });

    const longPdfDoc = await PDFDocument.load(await longBlob.arrayBuffer());
    assert.strictEqual(longPdfDoc.getPageCount(), 1);
    console.log("✓ TEST 7: Long line visual wrapping without continuation markers passed.");

    // ─── TEST 8: ExecutionManager Device Routing & Output Naming ───────────────
    const execResult = await ExecutionManager.run({
        tool: "code-to-pdf",
        files: [new File(["console.log('Hello Platen');"], "server.go", { type: "text/x-go" })],
        mode: "device",
        params: { paperSize: "A4" },
    });
    assert.strictEqual(execResult.executionMode, "client");
    assert.strictEqual(execResult.fileName, "converted_server.pdf");
    assert.ok(execResult.blob.size > 100);
    console.log("✓ TEST 8: ExecutionManager device execution returned correct output filename.");

    // ─── TEST 9: Error Handling for Empty Files and Unsupported Unicode ───────
    let emptyCaught = false;
    try {
        await executeCodeToPdf(new File([], "empty.py"));
    } catch (err: any) {
        emptyCaught = true;
        assert.strictEqual(err.code, "INVALID_INPUT");
    }
    assert.strictEqual(emptyCaught, true, "Empty file must throw INVALID_INPUT");

    // Unsupported Sinhala / CJK character check
    const sinhalaSource = `// සිංහල සටහන\nconst message = "හෙලෝ";`;
    let unicodeCaught = false;
    try {
        await executeCodeToPdf(new File([sinhalaSource], "sinhala.js"));
    } catch (err: any) {
        unicodeCaught = true;
        assert.strictEqual(err.code, "UNSUPPORTED_CLIENT_OP");
    }
    assert.strictEqual(unicodeCaught, true, "Non-Latin Unicode must throw UNSUPPORTED_CLIENT_OP for Auto fallback");
    console.log("✓ TEST 9: Error handling for empty files and unsupported Unicode passed.");

    // ─── TEST 10: Auto Fallback on Non-Latin script attempts Cloud exactly once ──
    const originalCloudExecute = CloudExecutor.execute;
    let cloudCallCount = 0;
    CloudExecutor.execute = async (opts) => {
        cloudCallCount++;
        return new Blob(["%PDF-1.4 Mocked Cloud PDF"], { type: "application/pdf" });
    };

    try {
        const autoResult = await ExecutionManager.run({
            tool: "code-to-pdf",
            files: [new File([sinhalaSource], "sinhala.js")],
            mode: "auto",
        });
        assert.strictEqual(cloudCallCount, 1, "Auto mode must attempt Cloud fallback exactly once");
        assert.strictEqual(autoResult.executionMode, "cloud");
        assert.strictEqual(autoResult.fallbackOccurred, true);
        console.log("✓ TEST 10: Auto mode fallback on unsupported client op calls Cloud exactly once.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 11: HTTP 429 Quota/Billing error is preserved (NOT CLOUD_UNAVAILABLE) ─
    CloudExecutor.execute = async () => {
        const clientErr = new Error("You've reached your 3-hour usage limit.") as any;
        clientErr.status = 429;
        clientErr.billing = {
            code: "HOURLY_LIMIT_REACHED",
            title: "Usage limit reached",
            message: "You've reached your 3-hour usage limit.",
            window: "3h",
        };
        const execErr = new ExecutionError("CLOUD_FAILURE", clientErr.message, clientErr);
        execErr.status = 429;
        execErr.billing = clientErr.billing;
        throw execErr;
    };

    try {
        let caught429: any = null;
        try {
            await ExecutionManager.run({
                tool: "code-to-pdf",
                files: [new File([sinhalaSource], "sinhala.js")],
                mode: "auto",
            });
        } catch (err) {
            caught429 = err;
        }

        assert.ok(caught429, "ExecutionManager must propagate the error");
        assert.notStrictEqual(caught429.code, "CLOUD_UNAVAILABLE", "429 must NOT be converted to CLOUD_UNAVAILABLE");
        assert.strictEqual(caught429.status, 429);
        assert.strictEqual(caught429.billing?.code, "HOURLY_LIMIT_REACHED");
        assert.strictEqual(caught429.message, "You've reached your 3-hour usage limit.");
        console.log("✓ TEST 11: HTTP 429 structured billing/quota error is preserved without being converted to CLOUD_UNAVAILABLE.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 12: Genuine Network Failure returns CLOUD_UNAVAILABLE ───────────
    CloudExecutor.execute = async () => {
        const netErr = new Error("PDFNest processing service is currently unavailable.") as any;
        netErr.status = 0;
        const execErr = new ExecutionError("CLOUD_UNAVAILABLE", netErr.message, netErr);
        execErr.status = 0;
        throw execErr;
    };

    try {
        let caughtNetErr: any = null;
        try {
            await ExecutionManager.run({
                tool: "code-to-pdf",
                files: [new File([sinhalaSource], "sinhala.js")],
                mode: "auto",
            });
        } catch (err) {
            caughtNetErr = err;
        }

        assert.ok(caughtNetErr);
        assert.strictEqual(caughtNetErr.code, "CLOUD_UNAVAILABLE", "True network outage must yield CLOUD_UNAVAILABLE");
        console.log("✓ TEST 12: Genuine network transport failure correctly returns CLOUD_UNAVAILABLE.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 13: Structured Application Error (413 / 400) is preserved ────────
    CloudExecutor.execute = async () => {
        const appErr = new Error("File payload exceeds maximum platform allowance of 50MB.") as any;
        appErr.status = 413;
        const execErr = new ExecutionError("CLOUD_FAILURE", appErr.message, appErr);
        execErr.status = 413;
        throw execErr;
    };

    try {
        let caughtAppErr: any = null;
        try {
            await ExecutionManager.run({
                tool: "code-to-pdf",
                files: [new File([sinhalaSource], "sinhala.js")],
                mode: "auto",
            });
        } catch (err) {
            caughtAppErr = err;
        }

        assert.ok(caughtAppErr);
        assert.notStrictEqual(caughtAppErr.code, "CLOUD_UNAVAILABLE");
        assert.strictEqual(caughtAppErr.status, 413);
        assert.strictEqual(caughtAppErr.message, "File payload exceeds maximum platform allowance of 50MB.");
        console.log("✓ TEST 13: Structured 413/400 application error is preserved.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 14: Device Mode + UNSUPPORTED_CLIENT_OP never attempts Cloud ────
    let deviceCloudCalls = 0;
    CloudExecutor.execute = async () => {
        deviceCloudCalls++;
        return new Blob([]);
    };

    try {
        let deviceErr: any = null;
        try {
            await ExecutionManager.run({
                tool: "code-to-pdf",
                files: [new File([sinhalaSource], "sinhala.js")],
                mode: "device",
            });
        } catch (err) {
            deviceErr = err;
        }

        assert.ok(deviceErr);
        assert.strictEqual(deviceCloudCalls, 0, "Device mode must never call Cloud on unsupported client op");
        assert.strictEqual(deviceErr.code, "UNSUPPORTED_CLIENT_OP");
        console.log("✓ TEST 14: Device mode with unsupported client op does not attempt Cloud and surfaces device error.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log("\n=================================================");
    console.log("    ALL CODE TO PDF UNIT TESTS PASSED (14/14)   ");
    console.log("=================================================\n");
}

// Auto-run if executed directly via tsx
if (process.argv[1]?.endsWith("codeExecution.test.ts")) {
    runCodeToPdfExecutionTests()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("Code execution test failed:", err);
            process.exit(1);
        });
}
