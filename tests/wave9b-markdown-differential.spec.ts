import { test, expect } from "@playwright/test";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { executeMarkdownToPdf } from "../lib/execution/document/markdownClient";

async function extractTextLines(pdfBytes: Uint8Array): Promise<string[]> {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdfDoc = await loadingTask.promise;
    const lines: string[] = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items
            .map((item: any) => item.str)
            .filter((str: string) => str.trim().length > 0)
            .join(" ");
        lines.push(pageStr);
    }

    return lines;
}

test.describe("Wave 9B: Markdown to PDF Vector Differential & Parity Suite", () => {
    test("1. Pure vector PDF: Text is selectable, searchable, and preserves all Markdown document structures", async () => {
        const sampleMd = `
# Project Architectural Specification

Platen PDF provides a **secure**, *offline-capable*, and ***high-performance*** document engine.

## Core Directives

1. Zero external network requests in Device mode
2. Pure vector text extraction via pdf-lib
3. Deterministic word wrapping and pagination

### System Code

\`\`\`typescript
export function computeChecksum(payload: string): number {
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
        hash = (hash << 5) - hash + payload.charCodeAt(i);
    }
    return hash;
}
\`\`\`

> Critical Requirement: Document security and user privacy must be upheld at all times.

| Component | Status | Target |
| :--- | :---: | ---: |
| Vector Layout | Active | Client |
| Prism Tokenizer | Active | v1.29.0 |
| PDF Renderer | Active | pdf-lib |
`;

        const mdFile = new File([sampleMd], "spec.md", { type: "text/markdown" });
        const pdfBlob = await executeMarkdownToPdf(mdFile, { paperSize: "A4" });
        const pdfBuffer = new Uint8Array(await pdfBlob.arrayBuffer());

        expect(pdfBuffer.length).toBeGreaterThan(500);

        const extractedPages = await extractTextLines(pdfBuffer);
        const fullExtractedText = extractedPages.join(" ");

        // Searchable vector text assertions
        expect(fullExtractedText).toContain("Project Architectural Specification");
        expect(fullExtractedText).toContain("Platen PDF provides a");
        expect(fullExtractedText).toContain("secure");
        expect(fullExtractedText).toContain("offline-capable");
        expect(fullExtractedText).toContain("Core Directives");
        expect(fullExtractedText).toContain("Zero external network requests");
        expect(fullExtractedText).toContain("computeChecksum");
        expect(fullExtractedText).toContain("Critical Requirement");
        expect(fullExtractedText).toContain("Vector Layout");
        expect(fullExtractedText).toContain("Prism Tokenizer");
    });

    test("2. Long text wrapping preserves exact underlying words without artificial glyph corruption", async () => {
        const longParagraphMd = `# Wrapping Test\n\n${"The quick brown fox jumps over the lazy dog. ".repeat(25)}`;
        const mdFile = new File([longParagraphMd], "wrapping.md", { type: "text/markdown" });
        const pdfBlob = await executeMarkdownToPdf(mdFile, { paperSize: "letter" });
        const pdfBuffer = new Uint8Array(await pdfBlob.arrayBuffer());

        const extractedPages = await extractTextLines(pdfBuffer);
        const fullText = extractedPages.join(" ");

        expect(fullText).not.toContain("↪");
        expect(fullText).toContain("The quick brown fox jumps over the lazy dog.");
    });

    test("3. Multi-page pagination scales deterministically across complex technical document", async () => {
        const complexMd = Array.from({ length: 40 }, (_, i) => `
## Section ${i + 1}: Module Performance

This paragraph elaborates on subsystem ${i + 1} performance metrics under sustained load.
Key properties include **deterministic execution**, \`low-latency routing\`, and zero memory leakage.

\`\`\`javascript
const metric_${i + 1} = { id: ${i + 1}, active: true, latencyMs: ${10 + (i % 5)} };
\`\`\`

- Metric item A for section ${i + 1}
- Metric item B for section ${i + 1}

| Key | Value | Notes |
|---|---|---|
| Latency | ${10 + (i % 5)}ms | P99 Target |
| Memory | 24MB | Bounded |
`).join("\n");

        const mdFile = new File([complexMd], "benchmark.md", { type: "text/markdown" });
        const startTime = Date.now();
        const pdfBlob = await executeMarkdownToPdf(mdFile, { paperSize: "A4" });
        const duration = Date.now() - startTime;

        console.log(`[Wave 9B Benchmark] 40 complex sections rendered in ${duration}ms`);
        expect(duration).toBeLessThan(4000);

        const pdfBuffer = new Uint8Array(await pdfBlob.arrayBuffer());
        const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
        const pdfDoc = await loadingTask.promise;

        expect(pdfDoc.numPages).toBeGreaterThanOrEqual(6);
        expect(pdfDoc.numPages).toBeLessThanOrEqual(25);
    });
});
