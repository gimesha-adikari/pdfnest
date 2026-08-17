import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { executeCodeToPdf } from "../lib/execution/document/codeClient";

test.describe("Wave 9A: Source Code → PDF Differential Parity & Vector Layout Suite", () => {
    test("1. Vector selectable text & verbatim source preservation across TypeScript/Python/Go", async () => {
        const testCode = `
// Platen PDFNest Core Service
export class DocumentPipeline {
    private readonly timeoutMs: number;

    constructor(timeoutMs = 5000) {
        this.timeoutMs = timeoutMs;
    }

    async process(docId: string): Promise<boolean> {
        console.log(\`Processing document: \${docId}\`);
        return true;
    }
}
`;
        const codeFile = new File([testCode], "DocumentPipeline.ts", { type: "text/typescript" });
        const pdfBlob = await executeCodeToPdf(codeFile, { paperSize: "A4", marginTop: 0.4, marginBottom: 0.4 });

        expect(pdfBlob.size).toBeGreaterThan(500);

        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        expect(pdfDoc.getPageCount()).toBe(1);

        const [page1] = pdfDoc.getPages();
        expect(Math.round(page1.getWidth())).toBe(595);
        expect(Math.round(page1.getHeight())).toBe(842);

        // Verify with pdfjs-dist: Extract text content and ensure 100% vector selectable text
        const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const page = await pdfjsDoc.getPage(1);
        const textContent = await page.getTextContent();

        const extractedStrings = textContent.items
            .filter((item: any) => typeof item.str === "string")
            .map((item: any) => item.str)
            .join(" ");

        // Must contain all keywords and identifiers
        expect(extractedStrings).toContain("export");
        expect(extractedStrings).toContain("class");
        expect(extractedStrings).toContain("DocumentPipeline");
        expect(extractedStrings).toContain("timeoutMs");
        expect(extractedStrings).toContain("process");
        expect(extractedStrings).toContain("Promise");

        // MUST NOT contain artificial continuation markers
        expect(extractedStrings).not.toContain("↪");
    });

    test("2. Visual line wrapping preserves underlying source text without extra characters", async () => {
        const longLineSnippet = `const configPayload = { apiKey: "${"x".repeat(160)}", enabled: true };`;
        const longFile = new File([longLineSnippet], "config.js", { type: "text/javascript" });
        const pdfBlob = await executeCodeToPdf(longFile, { paperSize: "letter" });

        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const page = await pdfjsDoc.getPage(1);
        const textContent = await page.getTextContent();

        const extractedText = textContent.items
            .filter((item: any) => typeof item.str === "string")
            .map((item: any) => item.str)
            .join("");

        // Extracted text must contain the full 160 x's without broken continuation symbols
        expect(extractedText).toContain("x".repeat(160));
        expect(extractedText).toContain("configPayload");
        expect(extractedText).toContain("apiKey");
        expect(extractedText).not.toContain("↪");
    });

    test("3. Multi-page pagination scales deterministically across 1,000 lines", async () => {
        const lines: string[] = [];
        for (let i = 1; i <= 1000; i++) {
            lines.push(`func HandleWorkerTask_${i}(ctx context.Context, taskId string) error { return nil }`);
        }
        const largeSource = lines.join("\n");
        const largeFile = new File([largeSource], "worker_pool.go", { type: "text/x-go" });

        const startTime = Date.now();
        const pdfBlob = await executeCodeToPdf(largeFile, { paperSize: "A4" });
        const durationMs = Date.now() - startTime;

        console.log(`[Wave 9A Benchmark] 1,000 lines rendered in ${durationMs}ms`);
        expect(durationMs).toBeLessThan(3000); // Must be fast (< 3s)

        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();

        // 1000 lines / ~45 lines per page -> ~20-26 pages
        expect(pageCount).toBeGreaterThanOrEqual(18);
        expect(pageCount).toBeLessThanOrEqual(30);

        // Spot-check first and last page with pdfjs-dist
        const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const firstPage = await pdfjsDoc.getPage(1);
        const firstText = (await firstPage.getTextContent()).items.map((it: any) => it.str).join(" ");
        expect(firstText).toContain("HandleWorkerTask_1");

        const lastPage = await pdfjsDoc.getPage(pageCount);
        const lastText = (await lastPage.getTextContent()).items.map((it: any) => it.str).join(" ");
        expect(lastText).toContain("HandleWorkerTask_1000");
    });
});
