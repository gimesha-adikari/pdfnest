import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionError } from "../../lib/execution/types";
import { buildPageNumbersDescription } from "../../lib/execution/pdfcpu/pdfcpuClient";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

async function createDummyPdf(pageCount = 3, title?: string): Promise<File> {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        pdfDoc.addPage([595.28, 841.89]); // A4
    }
    if (title) {
        pdfDoc.setTitle(title);
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new File([blob], `${title || "doc"}.pdf`, { type: "application/pdf" });
}

export async function runPageNumbersExecutionTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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
    console.log(" RUNNING WAVE 2 PAGE NUMBERS HYBRID UNIT TESTS  ");
    console.log("=================================================\n");

    setupNodeWasmWorker();

    let cloudCallCount = 0;
    const originalCloudExecute = CloudExecutor.execute;
    CloudExecutor.execute = async (options) => {
        cloudCallCount++;
        const dummyPdf = await createDummyPdf(1);
        return new Blob([await dummyPdf.arrayBuffer()], { type: "application/pdf" });
    };

    try {
        const fileA = await createDummyPdf(3, "Pagination Baseline Doc");

        // Test 1: Implementation Support Detection
        assert(
            ClientExecutor.isSupported("add_page_numbers") === true,
            "1. ClientExecutor.isSupported('add_page_numbers') evaluates true"
        );

        // Test 2: Auto mode standard 3-page PDF executes locally (0 cloud calls)
        cloudCallCount = 0;
        const resAuto = await ExecutionManager.run({
            tool: "add_page_numbers",
            files: [fileA],
            params: {
                fontFamily: "Helvetica",
                fontSize: 12,
                position: "bc",
            },
            mode: "auto",
        });
        const autoResultBytes = new Uint8Array(await resAuto.blob.arrayBuffer());
        assert(
            resAuto.executionMode === "client" &&
            resAuto.blob.size > 0 &&
            autoResultBytes.length > 0 &&
            cloudCallCount === 0,
            "2. Auto mode executes locally with 0 cloud calls"
        );

        // Test 3: Device mode executes locally with 0 cloud calls
        cloudCallCount = 0;
        const resDevice = await ExecutionManager.run({
            tool: "add_page_numbers",
            files: [fileA],
            params: {
                fontFamily: "Helvetica",
                fontSize: 14,
                position: "bc",
            },
            mode: "device",
        });
        assert(
            resDevice.executionMode === "client" &&
            resDevice.blob.size > 0 &&
            cloudCallCount === 0,
            "3. Device mode executes locally with 0 cloud calls"
        );

        // Test 4: Cloud mode executes with exactly 1 cloud call
        cloudCallCount = 0;
        const resCloud = await ExecutionManager.run({
            tool: "add_page_numbers",
            files: [fileA],
            params: {
                fontFamily: "Helvetica",
                fontSize: 12,
                position: "bc",
            },
            mode: "cloud",
        });
        assert(
            resCloud.executionMode === "cloud" &&
            cloudCallCount === 1,
            "4. Cloud mode explicitly invokes CloudExecutor (1 cloud call)"
        );

        // Test 5: Verify output validity and page count preservation (3 pages input -> 3 pages output)
        const parsedDoc = await PDFDocument.load(autoResultBytes);
        assert(
            parsedDoc.getPageCount() === 3,
            "5. Output PDF remains valid and page count (3) is preserved"
        );

        // Test 6: Bottom-center positioning (bc) with backend offset (0 20)
        const descBC = buildPageNumbersDescription({ position: "bc", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descBC.includes("pos:bc") && descBC.includes("offset: 0 20"),
            "6. Bottom-center (bc) includes exact backend offset (0 20)"
        );

        // Test 7: Bottom-left positioning (bl) with backend offset (20 20)
        const descBL = buildPageNumbersDescription({ position: "bl", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descBL.includes("pos:bl") && descBL.includes("offset: 20 20"),
            "7. Bottom-left (bl) includes exact backend offset (20 20)"
        );

        // Test 8: Bottom-right positioning (br) with backend offset (-20 20)
        const descBR = buildPageNumbersDescription({ position: "br", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descBR.includes("pos:br") && descBR.includes("offset: -20 20"),
            "8. Bottom-right (br) includes exact backend offset (-20 20)"
        );

        // Test 9: Top-center positioning (tc) with backend offset (0 -20)
        const descTC = buildPageNumbersDescription({ position: "tc", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descTC.includes("pos:tc") && descTC.includes("offset: 0 -20"),
            "9. Top-center (tc) includes exact backend offset (0 -20)"
        );

        // Test 10: Top-left positioning (tl) with backend offset (20 -20)
        const descTL = buildPageNumbersDescription({ position: "tl", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descTL.includes("pos:tl") && descTL.includes("offset: 20 -20"),
            "10. Top-left (tl) includes exact backend offset (20 -20)"
        );

        // Test 11: Top-right positioning (tr) with backend offset (-20 -20)
        const descTR = buildPageNumbersDescription({ position: "tr", fontFamily: "Helvetica", fontSize: 12 });
        assert(
            descTR.includes("pos:tr") && descTR.includes("offset: -20 -20"),
            "11. Top-right (tr) includes exact backend offset (-20 -20)"
        );

        // Test 12: All 6 anchor positions execute successfully in pdfcpu WASM engine
        const positions = ["bl", "bc", "br", "tl", "tc", "tr"];
        let allPositionsPassed = true;
        for (const pos of positions) {
            try {
                const res = await ClientExecutor.execute({
                    tool: "add_page_numbers",
                    files: [fileA],
                    params: { position: pos, fontSize: 12, fontFamily: "Helvetica" },
                    mode: "device",
                });
                if (res.size === 0) allPositionsPassed = false;
            } catch (err) {
                allPositionsPassed = false;
            }
        }
        assert(
            allPositionsPassed,
            "12. All 6 anchor positions (bl, bc, br, tl, tc, tr) execute successfully in WASM"
        );

        // Test 13: Font mapping (Helvetica, Times-Roman, Courier)
        const fonts = ["Helvetica", "Times-Roman", "Courier"];
        let allFontsPassed = true;
        for (const font of fonts) {
            try {
                const res = await ClientExecutor.execute({
                    tool: "add_page_numbers",
                    files: [fileA],
                    params: { position: "bc", fontSize: 12, fontFamily: font },
                    mode: "device",
                });
                if (res.size === 0) allFontsPassed = false;
            } catch (err) {
                allFontsPassed = false;
            }
        }
        assert(
            allFontsPassed,
            "13. Typeface profiles (Helvetica, Times-Roman, Courier) execute successfully in WASM"
        );

        // Test 14: Font scale propagation (normalizedScale = (fontSize / 25).toFixed(2))
        const desc12 = buildPageNumbersDescription({ fontSize: 12 });
        const desc25 = buildPageNumbersDescription({ fontSize: 25 });
        const desc50 = buildPageNumbersDescription({ fontSize: 50 });
        assert(
            desc12.includes("scale:0.48 abs") &&
            desc25.includes("scale:1.00 abs") &&
            desc50.includes("scale:2.00 abs"),
            "14. Font scale normalization (fontSize / 25) propagates correctly"
        );

        // Test 15: Password-protected input triggers Cloud fallback (Option B)
        cloudCallCount = 0;
        const protectedFile = await createDummyPdf(1, "Protected");
        (protectedFile as any).originalPassword = "secretPassword123";

        const pwdResult = await ExecutionManager.run({
            tool: "add_page_numbers",
            files: [protectedFile],
            params: { position: "bc" },
            mode: "auto",
            password: "secretPassword123",
        });
        assert(
            pwdResult.executionMode === "cloud" && pwdResult.fallbackOccurred === true && cloudCallCount === 1,
            "15. Password-protected file triggers Cloud fallback in Auto mode (Option B)"
        );

        // Test 16: Invalid PDF header throws INVALID_INPUT error in Device mode
        const corruptFile = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])], "corrupted.pdf", {
            type: "application/pdf",
        });
        let invalidHeaderCaught = false;
        try {
            await ClientExecutor.execute({
                tool: "add_page_numbers",
                files: [corruptFile],
                params: { position: "bc" },
                mode: "device",
            });
        } catch (err: any) {
            if (err instanceof ExecutionError && err.code === "INVALID_INPUT") {
                invalidHeaderCaught = true;
            }
        }
        assert(
            invalidHeaderCaught,
            "16. Invalid PDF header throws INVALID_INPUT error without Cloud fallback"
        );

        // Test 17: Oversized document (>25MB) rejected by SafetyGate in Device mode
        const oversizedFile = new File(
            [new Uint8Array(26 * 1024 * 1024)],
            "oversized.pdf",
            { type: "application/pdf" }
        );
        const safetyResult = ExecutionSafetyGate.evaluate("add_page_numbers", [oversizedFile], "HYBRID");
        assert(
            safetyResult.eligible === false,
            "17. ExecutionSafetyGate rejects 26MB file for local execution"
        );

        // Test 18: Auto mode routes oversized document to Cloud
        cloudCallCount = 0;
        const autoOversizedResult = await ExecutionManager.run({
            tool: "add_page_numbers",
            files: [oversizedFile],
            params: { position: "bc" },
            mode: "auto",
        });
        assert(
            autoOversizedResult.executionMode === "cloud" && cloudCallCount === 1,
            "18. Auto mode automatically routes oversized file to Cloud"
        );

        // Test 19: %p macro sequencing across 5-page PDF
        const file5 = await createDummyPdf(5, "Five Page Doc");
        const res5 = await ClientExecutor.execute({
            tool: "add_page_numbers",
            files: [file5],
            params: { position: "bc", fontSize: 12, fontFamily: "Helvetica" },
            mode: "device",
        });
        const doc5 = await PDFDocument.load(await res5.arrayBuffer());
        assert(
            doc5.getPageCount() === 5 && res5.size > 0,
            "19. %p sequencing completes across 5-page document preserving exact page count"
        );

        // Test 20: Pre-existing description string preserved without duplicate offsets
        const customDesc = "font:Courier, scale:1.20 abs, pos:tr, rot:0, offset: -20 -20";
        const builtDesc = buildPageNumbersDescription({ description: customDesc });
        assert(
            builtDesc === customDesc,
            "20. Pre-existing description with offsets is preserved without duplicate appending"
        );

    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    return { passed, failed, errors };
}

if (require.main === module) {
    runPageNumbersExecutionTests().then(({ passed, failed, errors }) => {
        console.log(`\nPage Numbers Execution Test Results: ${passed} passed, ${failed} failed.`);
        if (failed > 0) {
            console.error("Failures:\n" + errors.join("\n"));
            process.exit(1);
        }
    });
}
