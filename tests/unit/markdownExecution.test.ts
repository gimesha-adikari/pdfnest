import assert from "node:assert";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { CloudExecutor } from "../../lib/execution/CloudExecutor";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { executeMarkdownToPdf } from "../../lib/execution/document/markdownClient";
import { parsePaperSize, PAPER_DIMENSIONS, parseMarginsInches, inchesToPoints } from "../../lib/execution/document/types";
import { ExecutionError } from "../../lib/execution/types";

export async function runMarkdownToPdfExecutionTests(): Promise<void> {
    console.log("=================================================");
    console.log("   RUNNING MARKDOWN TO PDF (WAVE 9B) UNIT TESTS  ");
    console.log("=================================================");

    // ─── TEST 1: ClientExecutor.isSupported evaluates true for all aliases ────
    assert.strictEqual(ClientExecutor.isSupported("markdown_to_pdf"), true, "markdown_to_pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("markdown-to-pdf"), true, "markdown-to-pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("md_to_pdf"), true, "md_to_pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("md-to-pdf"), true, "md-to-pdf must be supported");
    assert.strictEqual(ClientExecutor.isSupported("markdown"), true, "markdown must be supported");
    console.log("✓ TEST 1: ClientExecutor.isSupported handles all markdown-to-pdf aliases.");

    // ─── TEST 2: Paper Dimensions & Margin Metrics ───────────────────────────
    assert.strictEqual(parsePaperSize("A4"), "A4");
    assert.strictEqual(parsePaperSize("letter"), "letter");
    assert.strictEqual(parsePaperSize("legal"), "legal");

    const parsedMargin = parseMarginsInches({ marginTop: 0.5, marginBottom: 0.75, marginLeft: 0.5, marginRight: 0.5 });
    const points = inchesToPoints(parsedMargin);
    assert.strictEqual(points.top, 36);
    assert.strictEqual(points.bottom, 54);
    assert.strictEqual(points.left, 36);
    assert.strictEqual(points.right, 36);
    console.log("✓ TEST 2: Paper dimensions and margin conversions passed.");

    // ─── TEST 3: Comprehensive Markdown Elements Generation ───────────────────
    const sampleMd = `
# Main Project Heading

This is a **bold** paragraph with *italic* text, ***bold-italic***, and \`inline code\`.
Here is a [Documentation Link](https://platen.io/docs) and a ~~strikethrough~~ span.

## Code Architecture

\`\`\`typescript
interface UserProfile {
    id: string;
    displayName: string;
    verified: boolean;
}

function verifyUser(user: UserProfile): boolean {
    return user.verified;
}
\`\`\`

### Features and Requirements

- Unordered item 1 with **bold**
- Unordered item 2 with \`code\`
  - Nested sub-item A
  - Nested sub-item B

1. First ordered step
2. Second ordered step
3. Third ordered step

- [ ] Unchecked task
- [x] Completed task

> Platen PDF enables client-first, offline-capable vector document processing.
> All operations run securely within the local sandbox.

---

### Data Matrix

| Feature | Support | Engine |
| :--- | :---: | ---: |
| Vector Text | Yes | pdf-lib |
| Syntax Highlighting | Yes | Prism 1.29.0 |
| Offline Sandbox | 100% | WASM / Client |
`;

    const mdFile = new File([sampleMd], "README.md", { type: "text/markdown" });
    const pdfBlob = await executeMarkdownToPdf(mdFile, { paperSize: "A4" });
    assert.ok(pdfBlob.size > 200, "Output blob must contain valid PDF bytes");

    const pdfDoc = await PDFDocument.load(await pdfBlob.arrayBuffer());
    assert.ok(pdfDoc.getPageCount() >= 1, "Should render at least 1 page");
    console.log("✓ TEST 3: Comprehensive Markdown elements (headings, inline, code, lists, blockquotes, tables, hr) rendered.");

    // ─── TEST 4: Multi-Page Pagination Scalability ─────────────────────────────
    const longMd = Array.from({ length: 80 }, (_, i) => `### Section ${i + 1}\n\nThis is paragraph ${i + 1} explaining technical details with **bold** concepts and \`code_snippet_${i + 1}()\`.\n\n- Bullet point A for ${i + 1}\n- Bullet point B for ${i + 1}\n`).join("\n");
    const longMdFile = new File([longMd], "large_spec.md", { type: "text/markdown" });
    const longPdfBlob = await executeMarkdownToPdf(longMdFile, { paperSize: "A4" });

    const longPdfDoc = await PDFDocument.load(await longPdfBlob.arrayBuffer());
    const pageCount = longPdfDoc.getPageCount();
    assert.ok(pageCount >= 8 && pageCount <= 16, `80 sections should paginate cleanly across 8-16 pages (actual: ${pageCount})`);
    console.log(`✓ TEST 4: Multi-page pagination passed (generated ${pageCount} pages for 80 sections).`);

    // ─── TEST 5: Embedded Base64 Data URI Image & External URL Safety ─────────
    // Valid 1x1 PNG data URI
    const transparentPngDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const imgMd = `# Image Demonstration\n\nEmbedded Logo:\n\n![Local Logo](${transparentPngDataUri})\n\nExternal Logo:\n\n![Cloud Image](https://example.com/logo.png)`;
    const imgFile = new File([imgMd], "images.md", { type: "text/markdown" });
    const imgPdfBlob = await executeMarkdownToPdf(imgFile, { paperSize: "letter" });
    assert.ok(imgPdfBlob.size > 200);

    const imgPdfDoc = await PDFDocument.load(await imgPdfBlob.arrayBuffer());
    assert.strictEqual(imgPdfDoc.getPageCount(), 1);
    console.log("✓ TEST 5: Embedded data URI image & safe external URL placeholder verified.");

    // ─── TEST 6: ExecutionManager Device Routing & Output Naming ───────────────
    const execResult = await ExecutionManager.run({
        tool: "markdown-to-pdf",
        files: [new File(["# Hello Platen"], "notes.md", { type: "text/markdown" })],
        mode: "device",
        params: { paperSize: "A4" },
    });
    assert.strictEqual(execResult.executionMode, "client");
    assert.strictEqual(execResult.fileName, "converted_notes.pdf");
    assert.ok(execResult.blob.size > 100);
    console.log("✓ TEST 6: ExecutionManager device execution returned correct output filename.");

    // ─── TEST 7: Error Handling for Empty Files and Unsupported Unicode ───────
    let emptyCaught = false;
    try {
        await executeMarkdownToPdf(new File([], "empty.md"));
    } catch (err: any) {
        emptyCaught = true;
        assert.strictEqual(err.code, "INVALID_INPUT");
    }
    assert.strictEqual(emptyCaught, true, "Empty file must throw INVALID_INPUT");

    // Unsupported Sinhala Unicode check
    const sinhalaMd = `# සටහන\n\nමෙය ප්ලැටන් පද්ධතියේ සටහනකි.`;
    let unicodeCaught = false;
    try {
        await executeMarkdownToPdf(new File([sinhalaMd], "sinhala.md"));
    } catch (err: any) {
        unicodeCaught = true;
        assert.strictEqual(err.code, "UNSUPPORTED_CLIENT_OP");
    }
    assert.strictEqual(unicodeCaught, true, "Non-Latin Unicode must throw UNSUPPORTED_CLIENT_OP for Auto fallback");
    console.log("✓ TEST 7: Error handling for empty files and unsupported Unicode passed.");

    // ─── TEST 8: Auto Mode Fallback on Unsupported Client Op ───────────────────
    const originalCloudExecute = CloudExecutor.execute;
    let cloudCallCount = 0;
    CloudExecutor.execute = async () => {
        cloudCallCount++;
        return new Blob(["%PDF-1.4 Mocked Cloud PDF"], { type: "application/pdf" });
    };

    try {
        const autoResult = await ExecutionManager.run({
            tool: "markdown-to-pdf",
            files: [new File([sinhalaMd], "sinhala.md")],
            mode: "auto",
        });
        assert.strictEqual(cloudCallCount, 1, "Auto mode must attempt Cloud fallback exactly once");
        assert.strictEqual(autoResult.executionMode, "cloud");
        assert.strictEqual(autoResult.fallbackOccurred, true);
        console.log("✓ TEST 8: Auto mode fallback on unsupported client op calls Cloud exactly once.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 9: HTTP 429 Quota/Billing Error Preservation ─────────────────────
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
                tool: "markdown-to-pdf",
                files: [new File([sinhalaMd], "sinhala.md")],
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
        console.log("✓ TEST 9: HTTP 429 structured billing/quota error is preserved without being converted to CLOUD_UNAVAILABLE.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 10: Genuine Network Failure returns CLOUD_UNAVAILABLE ───────────
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
                tool: "markdown-to-pdf",
                files: [new File([sinhalaMd], "sinhala.md")],
                mode: "auto",
            });
        } catch (err) {
            caughtNetErr = err;
        }

        assert.ok(caughtNetErr);
        assert.strictEqual(caughtNetErr.code, "CLOUD_UNAVAILABLE", "True network outage must yield CLOUD_UNAVAILABLE");
        console.log("✓ TEST 10: Genuine network transport failure correctly returns CLOUD_UNAVAILABLE.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 11: Structured Application Error (413 / 400) is preserved ────────
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
                tool: "markdown-to-pdf",
                files: [new File([sinhalaMd], "sinhala.md")],
                mode: "auto",
            });
        } catch (err) {
            caughtAppErr = err;
        }

        assert.ok(caughtAppErr);
        assert.notStrictEqual(caughtAppErr.code, "CLOUD_UNAVAILABLE");
        assert.strictEqual(caughtAppErr.status, 413);
        assert.strictEqual(caughtAppErr.message, "File payload exceeds maximum platform allowance of 50MB.");
        console.log("✓ TEST 11: Structured 413/400 application error is preserved.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    // ─── TEST 12: Device Mode + UNSUPPORTED_CLIENT_OP never attempts Cloud ────
    let deviceCloudCalls = 0;
    CloudExecutor.execute = async () => {
        deviceCloudCalls++;
        return new Blob([]);
    };

    try {
        let deviceErr: any = null;
        try {
            await ExecutionManager.run({
                tool: "markdown-to-pdf",
                files: [new File([sinhalaMd], "sinhala.md")],
                mode: "device",
            });
        } catch (err) {
            deviceErr = err;
        }

        assert.ok(deviceErr);
        assert.strictEqual(deviceCloudCalls, 0, "Device mode must never call Cloud on unsupported client op");
        assert.strictEqual(deviceErr.code, "UNSUPPORTED_CLIENT_OP");
        console.log("✓ TEST 12: Device mode with unsupported client op does not attempt Cloud and surfaces device error.");
    } finally {
        CloudExecutor.execute = originalCloudExecute;
    }

    console.log("\n=================================================");
    console.log("   ALL MARKDOWN TO PDF UNIT TESTS PASSED (12/12) ");
    console.log("=================================================\n");
}

// Auto-run if executed directly via tsx
if (process.argv[1]?.endsWith("markdownExecution.test.ts")) {
    runMarkdownToPdfExecutionTests()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("Markdown execution test failed:", err);
            process.exit(1);
        });
}
