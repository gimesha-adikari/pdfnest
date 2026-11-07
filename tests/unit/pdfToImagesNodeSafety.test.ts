import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { executePdfToImages } from "../../lib/execution/images/pdfToImageClient";
import { ExecutionError } from "../../lib/execution/types";

async function main() {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    try {
        Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
        const pdf = await PDFDocument.create();
        pdf.addPage([612, 792]);
        const bytes = await pdf.save();
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const file = new File([arrayBuffer], "synthetic.pdf", { type: "application/pdf" });
        await assert.rejects(
            executePdfToImages(file),
            (error: unknown) => error instanceof ExecutionError && error.code === "UNSUPPORTED_CLIENT_OP",
            "non-browser execution must not return a ZIP containing placeholder image bytes",
        );
        console.log("PDF-to-Images refuses non-browser placeholder output.");
    } finally {
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else delete (globalThis as { document?: unknown }).document;
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
