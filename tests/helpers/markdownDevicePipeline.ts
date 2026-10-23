import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";
import { ClientPdfRenderer } from "../../lib/preview/ClientPdfRenderer";
import type { ProcessingMode } from "../../lib/execution/types";

// Browser-only entry point bundled by the regression suite. No executor,
// admission policy, PDF.js loader, worker or canvas implementation is mocked.
const pipeline = {
    stage: "idle",
    result: null as null | {
        executionMode: string; fallbackOccurred: boolean; imageCount: number;
        width: number; height: number; redPixels: number; bluePixels: number;
    },
    error: "",
    async run(source: string, name: string, mode: ProcessingMode) {
        this.stage = "generating";
        try {
            const controller = new AbortController();
            const result = await ExecutionManager.run({
                tool: "markdown-to-pdf", files: [new File([source], name, { type: "text/markdown" })],
                mode, signal: controller.signal,
            });
            this.stage = "pdf-generated";
            const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
            const images = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
            const imageCount = images instanceof PDFDict ? images.keys().length : 0;
            const id = crypto.randomUUID();
            const renderer = new ClientPdfRenderer({ renderingIntent: "print" });
            const preview = await renderer.render({
                document: { id, version: id, pageCount: 1,
                    file: new File([result.blob], `${id}.pdf`, { type: "application/pdf" }) },
                page: 1, scale: 2,
            }, controller.signal);
            try {
                const image = new Image();
                image.src = preview.url!;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                const context = canvas.getContext("2d")!;
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let redPixels = 0, bluePixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 180 && pixels[i + 1] < 100 && pixels[i + 2] < 100) redPixels++;
                    if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] > 180) bluePixels++;
                }
                this.result = { executionMode: result.executionMode, fallbackOccurred: result.fallbackOccurred,
                    imageCount, width: canvas.width, height: canvas.height, redPixels, bluePixels };
                this.stage = "ready";
            } finally { preview.revoke?.(); }
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
            this.stage = "failed";
        } finally { ClientPdfRenderer.clearDocumentCache(); }
    },
};

declare global { interface Window { markdownDevicePipeline: typeof pipeline } }
window.markdownDevicePipeline = pipeline;
