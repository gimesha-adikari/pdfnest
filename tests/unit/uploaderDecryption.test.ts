import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { executePdfcpuWasmUnlock, setWorkerFactory } from "../../lib/execution/pdfcpu/pdfcpuClient";
import { ExecutionError, type ExecutionErrorCode } from "../../lib/execution/types";
import { inspectPdf, prepareEncryptedPdf } from "../../lib/pdf/localPreparation";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

// Derived once from encrypted_sample.pdf with qpdf --encrypt secret123 owner123 128 --use-aes=y.
// Inline fixture avoids a qpdf dependency at test runtime. The existing _128 fixture is RC4.
const AES128 = "JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvRXh0ZW5zaW9ucyA8PCAvQURCRSA8PCAvQmFzZVZlcnNpb24gLzEuNyAvRXh0ZW5zaW9uTGV2ZWwgOCA+PiA+PiAvUGFnZXMgMyAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL09ialN0bSAvTGVuZ3RoIDQzMiAvRmlsdGVyIC9GbGF0ZURlY29kZSAvTiA2IC9GaXJzdCAzNCA+PgpzdHJlYW0KX3VXyqXQYSc2us9OIgoD2uKlp/E70JkbbDjzRKyfFBt7ors+Fxw0l1BGdrxc02TWy5USUcMcZcgaixXlS8383DB062nPwGkDpo11qEusnX1Mq6XakuV3subjXHuKOuXEj1Vr8imGc/7qk/ZdlhYaw9EBQU8CpBsVCnuPGd7MaxT6FnaSKRnzLu2Xr3Mc0po0rLX+ny4riiWNjoVltL+aiP5Fh8+zYbJ/tkWTItuvf42xOXxEUO7R1six0tCdw7nq3SZAVzkWpSqISVxPvn8ZqM4/pN+trMZLPAfD4Ma4dnk/sjXlA+bt3bWQOUANgmcsOOeXBD8+eDcNYNtWGZPZ/zXiqqXViFMTN93+eaH2KyWsUVkq4NnSrFVi7MXcNqgqqano8enG+uOkQi7bp0HrFEQQ5AdeE9VkaSJD+XBbJnkDqKtb/ugmXyvYLumgZ1dMa59wV4JGXcZ9YdJGQsF43G9UhA90jOLN4QEaGu9AnsR8nIoy090xsqrH063u+RhsodeGeVr7B0kQ1/ICC62M+yiZGLG+BWDqNVVKDYT7dI4IYtRweqapL+2oPvtaCVZvZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8IC9GaWx0ZXIgL0ZsYXRlRGVjb2RlIC9MZW5ndGggMjA4ID4+CnN0cmVhbQq4VOKdLInBPaCTlgNjGFHaQXTNIHQxrNNwFxnflIb5+Xh6aEbDxXLjlA1t07Oq5WCgZlDQjEc46ccYdDx2Vii5UptTEyRSj4+hzwdZ+DuXsCMrTX7M6TX7VPjrOSicT5r/EvjtLYxpuqZMkEI1oCW8irIPn/fbQA4WoCT77COoNn1Yeg3eDMURp0KpG2ZBIcEYINlIMqyDP1mzBTrXXTsYl8KH/L9VOe+r+8YI7ibIH9EnEXuCvr3Vm2sbA13WzTCdxYZSlbgZtbyNAIf3zKEqZW5kc3RyZWFtCmVuZG9iagoxMCAwIG9iago8PCAvRmlsdGVyIC9GbGF0ZURlY29kZSAvTGVuZ3RoIDIwOCA+PgpzdHJlYW0KZa3BRSOrkVfyS4y1LiuSjjHOAxhhktR7pDLu4lulkxzMkbFX5BSBuqgcj4fmNjl5SSStq/uFiGdbmtlkV83aimGfVaCdPSRrn6SFvjbp/yJeRp3sMItCoEsiX/bsrUISx7Xf9qfyfv4IOMr8AiEighPijJ9c9trayJ5tqsTAXRcCZrWd2Hc4i0HNCSQrwEvB3+NZgvuz6eunW3EdGO1JH/m2wk3sZp6S+suCRcGTSHJjIeueZIzPryulY7eYn62rPif1VbusDcNCW6WRlwFXPGVuZHN0cmVhbQplbmRvYmoKMTEgMCBvYmoKPDwgL0ZpbHRlciAvRmxhdGVEZWNvZGUgL0xlbmd0aCAyMDggPj4Kc3RyZWFtCkpaI49v6RS4zE3Flv7vYtXBhYPceP9kIBV5CrO9OfsKrC2OcuDSpioctKUP0N6nMznDmcVlMzlyGiRySbXC8BaBSeXGFx3LGZrv2bMuAEp9T7WgHgkKMIn5MfssLL1kO1MVnRAi2f3ywWer1uFvAI8xspvMPo95vbriHHCUdH/X1Iaz15tKHUHNl+rYduEWJrXPzylU5Cyf9rV5DDzsm2vx14MCJGXeuIePf5R61X4TndAzLGSV2ojJeLIDLKcb4J3KY9og5LWdRGUCfj6tJqZlbmRzdHJlYW0KZW5kb2JqCjEyIDAgb2JqCjw8IC9DRiA8PCAvU3RkQ0YgPDwgL0F1dGhFdmVudCAvRG9jT3BlbiAvQ0ZNIC9BRVNWMiAvTGVuZ3RoIDE2ID4+ID4+IC9GaWx0ZXIgL1N0YW5kYXJkIC9MZW5ndGggMTI4IC9PIDw2ZWEzZjNiY2E0NzA0OGU2ZDQ1ODVlMmRhZWM2NGQ5NzNmNzI1M2YzZGRlNWQ0NDlhYzU5YzY5MzQ3ZjE0OTFlPiAvT0UgPD4gL1AgLTQgL1IgNCAvU3RtRiAvU3RkQ0YgL1N0ckYgL1N0ZENGIC9VIDwwZDUyMmRlNzMxOTM0MWE2YzdlNjg2NDQ2MjVmOTRhNDAwMjE0NDY5OTBiOWU0MTE0MDcxYTRkOTEwNDk4NGMxPiAvVUUgPD4gL1YgNCA+PgplbmRvYmoKMTMgMCBvYmoKPDwgL1R5cGUgL1hSZWYgL0xlbmd0aCA0NiAvRmlsdGVyIC9GbGF0ZURlY29kZSAvRGVjb2RlUGFybXMgPDwgL0NvbHVtbnMgNCAvUHJlZGljdG9yIDEyID4+IC9XIFsgMSAyIDEgXSAvSW5mbyA0IDAgUiAvUm9vdCAxIDAgUiAvU2l6ZSAxNCAvSUQgWzxmYzk3ZGFjYTk2NmI4NzcyNjIxMzY1NmIzM2VjNjJlOD48MWU5ZGZhYjQ4ZTM4ZTg0NDY5MzYyM2U4ZGNhMTQzMWU+XSAvRW5jcnlwdCAxMiAwIFIgPj4Kc3RyZWFtCnicY2IAAiZGBn4GJgaGYhCrAcRiYMRK/Gea8puJgVEcqIRRAkYwWTEAAHocBDwKZW5kc3RyZWFtCmVuZG9iagpzdGFydHhyZWYKMTgxNQolJUVPRgo=";
const LAST_MODIFIED = 1_700_000_000_123;
const signal = () => new AbortController().signal;
function fixture(name: string): File {
    return new File([fs.readFileSync(path.resolve(__dirname, "../fixtures", name))], name, { type: "application/pdf", lastModified: LAST_MODIFIED });
}
function aes128(): File {
    return new File([Buffer.from(AES128, "base64")], "aes128.pdf", { type: "application/pdf", lastModified: LAST_MODIFIED });
}
async function rejectsCode(promise: Promise<unknown>, code: ExecutionErrorCode): Promise<ExecutionError> {
    let caught: ExecutionError | undefined;
    await assert.rejects(promise, (error: unknown) => {
        assert(error instanceof ExecutionError);
        assert.equal(error.code, code);
        caught = error;
        return true;
    });
    return caught!;
}

interface Request { id: string; type: string; password: string; pdfBytes: ArrayBuffer }
class ControlledWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    request?: Request;
    terminations = 0;
    onPost?: (request: Request) => void;
    postMessage(request: Request) { this.request = request; this.onPost?.(request); }
    terminate() { this.terminations++; }
    respond(data: Record<string, unknown>) { this.onmessage?.({ data: { id: this.request!.id, ...data } } as MessageEvent); }
    install() { setWorkerFactory(() => this as unknown as Worker); }
    assertReleased() {
        assert.equal(this.terminations, 1, "owned worker must terminate exactly once");
        assert.equal(this.onmessage, null);
        assert.equal(this.onerror, null);
        assert.equal(this.onmessageerror, null);
    }
}

async function main() {
    // Node lacks browser APIs used by the normal pdfjs build; its legacy entry
    // installs the real compatibility polyfills, including Math.sumPrecise.
    await import("pdfjs-dist/legacy/build/pdf.mjs");
    let passed = 0, failed = 0, networkCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden in uploader decryption unit test"); };
    const plainDoc = await PDFDocument.create();
    plainDoc.addPage([100, 100]);
    const plainBytes = new Uint8Array(await plainDoc.save());
    const buffer = () => plainBytes.slice().buffer as ArrayBuffer;
    const validFile = () => new File([plainBytes], "plain.pdf", { type: "application/pdf" });
    async function test(name: string, run: () => Promise<void>) {
        setupNodeWasmWorker();
        const before = networkCalls;
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([run(), new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error("Test failed to settle within 10 seconds")), 10_000); })]);
            assert.equal(networkCalls, before, "preparation must not attempt a network request");
            passed++;
            console.log(`PASS ${name}`);
        } catch (error) { failed++; console.error(`FAIL ${name}`, error); }
        finally { clearTimeout(watchdog); setWorkerFactory(null); }
    }
    async function assertArtifact(blob: Blob) {
        assert.equal(blob.type, "application/pdf");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        assert.equal(doc.isEncrypted, false);
        assert.equal(doc.getPageCount(), 3);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loading = pdfjs.getDocument({ data: bytes, standardFontDataUrl: path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts") + "/" });
        try {
            const parsed = await loading.promise;
            assert.equal(parsed.numPages, 3);
            for (let n = 1; n <= 3; n++) {
                const page = await parsed.getPage(n);
                const content = await page.getTextContent();
                const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
                assert(text.includes(`PDFNEST_TEST_PAGE_${n}`), `page ${n} marker must survive decryption`);
                assert(text.includes(`This is page ${n} content for automated E2E testing.`));
            }
        } finally { await loading.destroy(); }
    }
    try {
        const sources = [
            ["AES-256", () => fixture("encrypted_sample.pdf")],
            ["AES-128", aes128],
            ["existing RC4-128", () => fixture("encrypted_sample_128.pdf")],
        ] as const;
        for (const [label, source] of sources) {
            for (const password of ["secret123", "owner123"]) await test(`${label} ${password === "secret123" ? "user" : "owner"} password preserves all page content`, async () => {
                const file = source();
                assert.equal(await inspectPdf(file, signal()), true);
                const prepared = await prepareEncryptedPdf(file, password, signal());
                assert.equal(prepared.name, file.name);
                assert.equal(prepared.type, "application/pdf");
                assert.equal(prepared.lastModified, LAST_MODIFIED);
                assert.equal(prepared.originalPassword, password);
                assert.equal(Object.hasOwn(file, "originalPassword"), false, "preparation must not mutate the queued original");
                assert.equal(await inspectPdf(prepared, signal()), false);
                await assertArtifact(prepared);
            });
            await test(`${label} wrong password rejects locally with sanitized error`, async () => {
                const error = await rejectsCode(prepareEncryptedPdf(source(), "wrong-password", signal()), "DECRYPTION_AUTH_FAILED");
                assert.doesNotMatch(error.message, /wrong-password|secret123|owner123|encrypted_sample/);
            });
        }
        await test("plain valid PDF is recognized without requesting a password", async () => {
            assert.equal(await inspectPdf(validFile(), signal()), false);
        });
        await test("missing password fails before creating a worker", async () => {
            setWorkerFactory(() => { assert.fail("missing password must not create a worker"); });
            await rejectsCode(prepareEncryptedPdf(fixture("encrypted_sample.pdf"), "", signal()), "INVALID_INPUT");
        });
        await test("corrupt header rejects before creating a worker", async () => {
            setWorkerFactory(() => { assert.fail("bad header must not create a worker"); });
            const file = new File(["not a PDF"], "corrupt.pdf");
            await rejectsCode(executePdfcpuWasmUnlock(file, "secret123", {}), "INVALID_INPUT");
            await rejectsCode(inspectPdf(file, signal()), "INVALID_INPUT");
        });
        await test("PDF header alone cannot pass structural inspection", async () => {
            await rejectsCode(inspectPdf(new File(["%PDF-1.7\ncorrupt body\n%%EOF"], "header-only.pdf"), signal()), "INVALID_INPUT");
        });
        await test("unsupported real encryption version fails without publishing output", async () => {
            const bytes = fs.readFileSync(path.resolve(__dirname, "../fixtures/encrypted_sample.pdf"));
            const position = bytes.indexOf(Buffer.from("/V 5"));
            assert(position >= 0);
            bytes[position + 3] = "9".charCodeAt(0); // Same width preserves xref offsets.
            const file = new File([bytes], "unsupported.pdf", { type: "application/pdf" });
            await rejectsCode(inspectPdf(file, signal()), "UNSUPPORTED_CLIENT_OP");
            await rejectsCode(prepareEncryptedPdf(file, "secret123", signal()), "UNSUPPORTED_CLIENT_OP");
        });
        for (const [name, output] of [
            ["corrupt worker output", () => new TextEncoder().encode("%PDF-invalid").buffer],
            ["still-encrypted worker output", async () => fixture("encrypted_sample.pdf").arrayBuffer()],
        ] as const) await test(`preparation rejects ${name}`, async () => {
            const worker = new ControlledWorker(); worker.install();
            worker.onPost = () => { void Promise.resolve(output()).then(pdfBytes => worker.respond({ type: "success", pdfBytes })); };
            await rejectsCode(prepareEncryptedPdf(fixture("encrypted_sample.pdf"), "secret123", signal()), "INVALID_INPUT");
            worker.assertReleased();
        });
        await test("worker success releases its resources and ignores unrelated response IDs", async () => {
            const worker = new ControlledWorker(); worker.install();
            worker.onPost = request => {
                assert.equal(request.type, "decrypt");
                assert.equal(request.password, "secret123");
                assert(new Uint8Array(request.pdfBytes).byteLength > 0);
                worker.onmessage?.({ data: { id: "another-request", type: "error", code: "CLIENT_FAILURE" } } as MessageEvent);
                worker.respond({ type: "success", pdfBytes: buffer() });
            };
            const blob = await executePdfcpuWasmUnlock(validFile(), "secret123", {});
            assert.equal((await PDFDocument.load(await blob.arrayBuffer())).getPageCount(), 1);
            worker.assertReleased();
        });
        for (const code of ["DECRYPTION_AUTH_FAILED", "UNSUPPORTED_CLIENT_OP", "INVALID_INPUT", "CLIENT_FAILURE"] as const) await test(`worker ${code} is sanitized and releases resources`, async () => {
            const worker = new ControlledWorker(); worker.install();
            worker.onPost = () => worker.respond({ type: "error", code, message: "SENSITIVE_ENGINE_DETAIL secret123 /private/document.pdf" });
            const error = await rejectsCode(executePdfcpuWasmUnlock(validFile(), "secret123", {}), code);
            assert.doesNotMatch(error.message, /SENSITIVE_ENGINE_DETAIL|secret123|private|document.pdf/);
            worker.assertReleased();
        });
        await test("worker construction unavailable rejects without server fallback", async () => {
            setWorkerFactory(() => { throw new Error("SENSITIVE_ENGINE_DETAIL"); });
            const error = await rejectsCode(executePdfcpuWasmUnlock(validFile(), "secret123", {}), "CLIENT_FAILURE");
            assert.doesNotMatch(error.message, /SENSITIVE_ENGINE_DETAIL/);
        });
        for (const failure of ["error", "messageerror", "postMessage"] as const) await test(`worker ${failure} settles and releases resources`, async () => {
            const worker = new ControlledWorker(); worker.install();
            worker.onPost = () => {
                if (failure === "error") worker.onerror?.({ preventDefault() {}, message: "SENSITIVE_ENGINE_DETAIL" } as ErrorEvent);
                else if (failure === "messageerror") worker.onmessageerror?.({ data: "SENSITIVE_ENGINE_DETAIL" } as MessageEvent);
                else throw new Error("SENSITIVE_ENGINE_DETAIL");
            };
            const error = await rejectsCode(executePdfcpuWasmUnlock(validFile(), "secret123", {}), "CLIENT_FAILURE");
            assert.doesNotMatch(error.message, /SENSITIVE_ENGINE_DETAIL/);
            worker.assertReleased();
        });
        await test("silent worker times out and releases resources", async () => {
            const worker = new ControlledWorker(); worker.install();
            await rejectsCode(executePdfcpuWasmUnlock(validFile(), "secret123", { timeoutMs: 10 }), "CLIENT_FAILURE");
            worker.assertReleased();
        });
        await test("pre-aborted preparation never creates a worker", async () => {
            const controller = new AbortController(); controller.abort();
            setWorkerFactory(() => { assert.fail("cancelled upload must not create worker"); });
            await rejectsCode(prepareEncryptedPdf(validFile(), "secret123", controller.signal), "USER_CANCELLATION");
            await rejectsCode(inspectPdf(validFile(), controller.signal), "USER_CANCELLATION");
        });
        await test("in-flight abort releases worker and late success cannot restore cancelled output", async () => {
            const controller = new AbortController();
            const worker = new ControlledWorker(); worker.install();
            let lateMessage: (() => void) | undefined;
            worker.onPost = request => {
                const callback = worker.onmessage;
                lateMessage = () => callback?.({ data: { id: request.id, type: "success", pdfBytes: buffer() } } as MessageEvent);
                controller.abort();
            };
            await rejectsCode(executePdfcpuWasmUnlock(validFile(), "secret123", { signal: controller.signal }), "USER_CANCELLATION");
            worker.assertReleased();
            lateMessage!();
            worker.assertReleased();
            const replacement = new ControlledWorker(); replacement.install();
            replacement.onPost = () => replacement.respond({ type: "success", pdfBytes: buffer() });
            const result = await executePdfcpuWasmUnlock(validFile(), "secret123", {});
            assert.equal((await PDFDocument.load(await result.arrayBuffer())).getPageCount(), 1);
            replacement.assertReleased();
        });
    } finally { globalThis.fetch = originalFetch; setWorkerFactory(null); }
    console.log(`Uploader decryption: ${passed} passed, ${failed} failed, 0 skipped; ${networkCalls} network attempts.`);
    process.exit(failed ? 1 : 0); // Go WASM runtime intentionally remains alive in the Node shim.
}
void main().catch(error => { console.error(error); process.exit(1); });
