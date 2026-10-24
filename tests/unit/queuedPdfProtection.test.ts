import assert from "node:assert/strict";
import axios from "axios";
import { PDFDocument } from "pdf-lib";
import { ClientExecutor } from "../../lib/execution/ClientExecutor";
import { captureCloudPdfOutputRestoration } from "../../lib/api";
import { verifyProtectedPdfBlob } from "../../lib/security/verifyProtectedPdf";
import { authorizeCloudProcessingInputs, markPdfInputPreparation, setTransientOriginalPassword } from "../../lib/security/pdfInputPreparation";
import { setupNodeWasmWorker } from "../setupNodeWasmWorker";

async function main() {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:9";
    const originalPost = axios.post;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Unexpected network access"); };
    setupNodeWasmWorker();
    try {
        const doc = await PDFDocument.create();
        doc.addPage([300, 400]).drawText("Synthetic private document", { x: 20, y: 200 });
        const bytes = Uint8Array.from(await doc.save()).buffer;
        const plain = new Blob([bytes], { type: "application/pdf" });
        const source = new File([plain], "prepared.pdf", { type: "application/pdf" });
        setTransientOriginalPassword(source, "expected-secret");
        markPdfInputPreparation(source, { sourceProtected: true, bytesState: "decrypted", preparedOn: "device", processingMode: "cloud", cloudSubmissionInitiated: false });
        authorizeCloudProcessingInputs([source], "edit-pdf");
        const encrypt = (password: string) => ClientExecutor.execute({ tool: "lock", files: [new File([plain], "plain.pdf")], mode: "device", params: { password } });
        const encrypted = await encrypt("expected-secret");
        const wrongPassword = await encrypt("different-secret");
        let calls = 0;
        let lockResult = encrypted;
        let transportFailure = false;
        axios.post = (async (url: string, form: FormData) => {
            assert.equal(url, "http://127.0.0.1:9/api/security/lock");
            assert.equal(form.get("password"), "expected-secret");
            calls++;
            if (transportFailure) throw new Error("Synthetic lost response");
            return { data: lockResult, status: 200 };
        }) as typeof axios.post;
        const restore = captureCloudPdfOutputRestoration(source, "edit-pdf");
        const result = await restore(plain);
        await verifyProtectedPdfBlob(result, "expected-secret");
        assert.notEqual(result, plain);
        for (const invalid of [plain, wrongPassword, new Blob(["%PDF-1.7\nmalformed"])]) {
            lockResult = invalid;
            await assert.rejects(restore(plain), /could not be restored and verified/);
        }
        transportFailure = true;
        await assert.rejects(restore(plain), /could not be restored and verified/);
        transportFailure = false;
        lockResult = encrypted;
        const aborted = new AbortController(); aborted.abort();
        const before = calls;
        await assert.rejects(restore(plain, aborted.signal), { name: "AbortError" });
        assert.equal(calls, before);
        await assert.rejects(captureCloudPdfOutputRestoration(source, "wrong-tool")(plain), /authorization/);
        assert.equal(calls, before);
        const unavailablePassword = new File([plain], "lost-password.pdf", { type: "application/pdf" });
        markPdfInputPreparation(unavailablePassword, { sourceProtected: true, bytesState: "decrypted", preparedOn: "device", processingMode: "cloud", cloudSubmissionInitiated: false });
        await assert.rejects(captureCloudPdfOutputRestoration(unavailablePassword, "edit-pdf")(plain), /could not be restored/);
        assert.equal(calls, before);
        const device = new File([plain], "device.pdf", { type: "application/pdf" });
        setTransientOriginalPassword(device, "expected-secret");
        markPdfInputPreparation(device, { sourceProtected: true, bytesState: "decrypted", preparedOn: "device", processingMode: "device", cloudSubmissionInitiated: false });
        await assert.rejects(captureCloudPdfOutputRestoration(device, "edit-pdf")(plain), /could not be restored/);
        assert.equal(calls, before, "Device output restoration cannot transmit bytes/password");
        assert.equal(await captureCloudPdfOutputRestoration(new File([plain], "plain.pdf"), "edit-pdf")(plain), plain);
        // Actual early-return client path: the prepared source is plain, but the result must not be.
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAQUlEQVR4nO3RsREAIAgDQHD/nXEEKdDG/zpFLokAAAAAAAAAAABgUvajVfdq/CKPe68XNehzCAAAAAAAAAAAwKwNL9QCBj9twPIAAAAASUVORK5CYII=", "base64");
        const signed = await ClientExecutor.execute({ tool: "sign", files: [device], mode: "device", params: { signature: new Blob([png], { type: "image/png" }), stamps: [{ page: 1, x: 20, y: 20, width: 50, height: 25 }] } });
        await verifyProtectedPdfBlob(signed, "expected-secret");
        assert.equal(calls, before, "local signing and restoration must stay local");
        for (const tool of ["highlight", "underline", "strikeout"]) {
            const marked = await ClientExecutor.execute({ tool, files: [device], mode: "device", params: { mode: "manual", boxes: [{ page: 1, x: 15, y: 180, width: 180, height: 25, color: "#FFFF00" }] } });
            await verifyProtectedPdfBlob(marked, "expected-secret");
        }
        const compressed = await ClientExecutor.execute({ tool: "compress", files: [device], mode: "device", params: { level: "low" } });
        await verifyProtectedPdfBlob(compressed, "expected-secret");
        assert.equal(calls, before, "local markup/compression cannot use Cloud restoration");

        console.log("PASS: queued PDF verified restoration, plaintext/wrong-password/malformed/transport rejection, authorization, cancellation, plaintext exception and real local protected signing");
    } finally {
        axios.post = originalPost;
        globalThis.fetch = originalFetch;
    }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
