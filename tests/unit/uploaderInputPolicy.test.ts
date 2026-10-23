import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { inspectPdf, isPdfCandidate, prepareEncryptedPdf } from "../../lib/pdf/localPreparation";
import { executePdfcpuWasmOptimize, setWorkerFactory } from "../../lib/execution/pdfcpu/pdfcpuClient";
import { ExecutionError } from "../../lib/execution/types";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";
import { repairablePdf } from "../helpers/repairablePdf";

const signal = () => new AbortController().signal;
const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, "../fixtures", name));
const damaged = () => new File([repairablePdf() as Uint8Array<ArrayBuffer>], "repairable.pdf", { type: "application/pdf" });
async function invalid(operation: Promise<unknown>) {
    await assert.rejects(operation, error => error instanceof ExecutionError && error.code === "INVALID_INPUT");
}
async function main() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let passed = 0, failed = 0, network = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { network++; throw new Error("Network forbidden in input-policy tests"); };
    async function test(name: string, run: () => Promise<void>) {
        try { await run(); passed++; console.log(`PASS ${name}`); }
        catch (error) { failed++; console.error(`FAIL ${name}`, error); }
        finally { setWorkerFactory(null); }
    }
    try {
        await test("R1 strict input rejects the genuinely repairable damaged trailer", async () => {
            await invalid(inspectPdf(damaged(), signal()));
        });
        await test("R1 explicit repair policy admits damaged input and real WASM recovers page content", async () => {
            assert.equal(await inspectPdf(damaged(), signal(), "repair"), false);
            setupNodeWasmWorker();
            const result = await executePdfcpuWasmOptimize(damaged());
            const output = new File([result], "repaired.pdf", { type: "application/pdf" });
            assert.equal(await inspectPdf(output, signal()), false);
            const task = pdfjs.getDocument({ data: new Uint8Array(await result.arrayBuffer()), standardFontDataUrl: path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts") + "/" });
            try {
                const doc = await task.promise;
                assert.equal(doc.numPages, 1);
                const text = await (await doc.getPage(1)).getTextContent();
                assert(text.items.some(item => "str" in item && item.str.includes("F01_REPAIRED_CONTENT")));
            } finally { await task.destroy(); }
        });
        for (const [name, bytes] of [["renamed text", "not a PDF"], ["header only", "%PDF-1.7\ngarbage\n%%EOF"]]) {
            await test(`R1 repair rejects ${name}`, async () => {
                await invalid(inspectPdf(new File([bytes], "fake.pdf", { type: "application/pdf" }), signal(), "repair"));
            });
        }
        await test("R1 encrypted repair input still requests a password", async () => {
            assert.equal(await inspectPdf(new File([fixture("encrypted_sample.pdf")], "locked.pdf"), signal(), "repair"), true);
        });
        for (const marker of ["/Encrypt 9 0 R", "/Encr#79pt 9 0 R", "/Encrypt\0 9 0 R", "/Filter /Standard", "/Filter%comment\n/Standard"]) {
            await test(`R1 parse failure with encryption evidence remains protected: ${marker.split(" ")[0]}`, async () => {
                const text = new TextDecoder().decode(repairablePdf()).replace("/Root null", `/Root null ${marker}`);
                const file = new File([text], "damaged-locked.pdf", { type: "application/pdf" });
                assert.equal(await inspectPdf(file, signal(), "repair"), true);
            });
        }
        for (const marker of ["/Type /ObjStm", "/Type%comment\n/XRef"]) {
            await test("R1 ambiguous damaged compressed structures fail closed", async () => {
                const text = new TextDecoder().decode(repairablePdf()).replace("/Root null", `/Root null ${marker}`);
                await invalid(inspectPdf(new File([text], "compressed.pdf"), signal(), "repair"));
            });
        }
        await test("R1 decrypted output never inherits the repair-input exception", async () => {
            const worker = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null, onmessageerror: null,
                postMessage(request: { id: string }) { this.onmessage?.({ data: { id: request.id, type: "success", pdfBytes: repairablePdf().buffer } } as MessageEvent); }, terminate() {} };
            setWorkerFactory(() => worker as unknown as Worker);
            await invalid(prepareEncryptedPdf(new File([fixture("encrypted_sample.pdf")], "locked.pdf"), "secret123", signal()));
        });
        for (const type of ["", "application/x-pdf", "application/octet-stream", "text/plain"]) {
            await test(`R2 encrypted PDF candidate with MIME ${type || "empty"}`, async () => {
                const file = new File([fixture("encrypted_sample.pdf")], "misleading.bin", { type });
                assert.equal(await isPdfCandidate(file, signal()), true);
                assert.equal(await inspectPdf(file, signal()), true);
            });
        }
        await test("R2 plaintext PDF with missing MIME is inspected and accepted", async () => {
            const file = new File([fixture("normal_text.pdf")], "document.pdf");
            assert.equal(await isPdfCandidate(file, signal()), true);
            assert.equal(await inspectPdf(file, signal()), false);
        });
        for (const [name, type] of [["invalid.pdf", ""], ["invalid.bin", "application/x-pdf"]]) {
            await test(`R2 metadata hints cannot validate arbitrary content: ${name}`, async () => {
                const file = new File(["not a PDF"], name, { type });
                assert.equal(await isPdfCandidate(file, signal()), true);
                await invalid(inspectPdf(file, signal()));
            });
        }
        for (const [name, type, content] of [["readme.md", "text/markdown", "# A document"], ["image.png", "image/png", "PNG content"], ["data.txt", "", "text"], ["pdf-example.md", "text/markdown", "# PDF header example\n%PDF-1.7"]]) {
            await test(`R2 non-PDF compatibility: ${name}`, async () => {
                assert.equal(await isPdfCandidate(new File([content], name, { type }), signal()), false);
            });
        }
        await test("R2 cancelled header detection fails closed", async () => {
            const controller = new AbortController(); controller.abort();
            await assert.rejects(isPdfCandidate(new File([fixture("normal_text.pdf")], "document.bin"), controller.signal), error => error instanceof ExecutionError && error.code === "USER_CANCELLATION");
        });
        assert.equal(network, 0);
    } finally { globalThis.fetch = originalFetch; setWorkerFactory(null); }
    console.log(`Uploader input policy: ${passed} passed, ${failed} failed, 0 skipped; ${network} network attempts.`);
    process.exit(failed ? 1 : 0);
}
void main().catch(error => { console.error(error); process.exit(1); });
