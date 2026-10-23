import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { validateReadablePdfBlob } from "../../lib/security/validateReadablePdfBlob";

async function main() {
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const saved = await document.save();
    const savedBuffer = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
    const validPdf = new Blob([savedBuffer], { type: "application/pdf" });

    assert.deepEqual(await validateReadablePdfBlob(validPdf), { pageCount: 1 });

    for (const [name, blob] of [
        ["empty", new Blob([], { type: "application/pdf" })],
        ["malformed", new Blob(["%PDF-1.7\nnot structurally readable"], { type: "application/pdf" })],
        ["HTML error", new Blob(["<html>not found</html>"], { type: "application/pdf" })],
        ["binary response", new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/pdf" })],
    ] as const) {
        await assert.rejects(
            validateReadablePdfBlob(blob),
            /Generated PDF could not be validated/,
            `${name} response must not qualify as a readable PDF`,
        );
    }

    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
        validateReadablePdfBlob(validPdf, cancelled.signal),
        (error: unknown) => error instanceof Error && error.name === "AbortError",
    );

    console.log("Async PDF artifact structural validation accepted one readable page and rejected empty, malformed, HTML, binary, and cancelled results.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
