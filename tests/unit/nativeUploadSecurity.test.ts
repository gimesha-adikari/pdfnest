import assert from "node:assert/strict";
import { createSearchablePdfV2Job } from "@/lib/searchablePdfV2";
import { markPdfInputPreparation, authorizeCloudProcessingInputs, revokeCloudProcessingAuthorization } from "@/lib/security/pdfInputPreparation";
import { uploadFileToPresignedUrl, type R2UploadItem } from "@/lib/r2";

const jobId = "123e4567-e89b-12d3-a456-426614174000";
const originalFetch = globalThis.fetch;
const originalXHR = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalApi = process.env.NEXT_PUBLIC_API_URL;
let calls = 0;
let sends = 0;
class FakeXHR {
    status = 204; responseText = ""; withCredentials = false;
    onload: (() => void) | null = null;
    open(): void {} setRequestHeader(): void {} abort(): void {}
    send(): void { sends += 1; this.onload?.(); }
}
function prepared(name = "page.png"): File {
    const file = new File(["synthetic"], name, { type: "image/png" });
    markPdfInputPreparation(file, { sourceProtected: false, bytesState: "plain", preparedOn: "none", processingMode: "auto", cloudSubmissionInitiated: false });
    return file;
}
function response(): Response { return new Response(JSON.stringify({ job_id: jobId, status: "QUEUED" }), { status: 202 }); }
async function main(): Promise<void> {
    globalThis.fetch = async () => { calls += 1; return response(); };
    const a = prepared();
    const unprepared = new File(["other"], a.name, { type: a.type });
    const create = (files: File[]) => createSearchablePdfV2Job(files, "eng", "AUTO", "stable", "request");
    await assert.rejects(create([unprepared]), /authorization/);
    await assert.rejects(create([a, unprepared]), /authorization/);
    assert.equal(calls, 0, "every exact file is checked before network activity");
    const protectedFile = new File(["%PDF-synthetic"], "page.png", { type: "image/png" });
    markPdfInputPreparation(protectedFile, { sourceProtected: true, bytesState: "encrypted", preparedOn: "none", processingMode: "auto", cloudSubmissionInitiated: false });
    await assert.rejects(create([protectedFile]), /authorization/);
    authorizeCloudProcessingInputs([protectedFile], "searchable-pdf-v2");
    await assert.rejects(create([protectedFile]), /Protected input is not supported/);
    assert.equal(calls, 0, "tool consent cannot enable unsupported protected PDFs");
    Object.defineProperty(a, "initialBatch", { value: [a, unprepared] });
    await create([a]);
    assert.equal(calls, 1, "removed page in a stale initialBatch is not submitted or consulted");
    authorizeCloudProcessingInputs([unprepared], "searchable-pdf-v2");
    revokeCloudProcessingAuthorization(unprepared, "searchable-pdf-v2");
    await assert.rejects(create([a, unprepared]), /authorization/);
    const b = prepared("other.png");
    await create([a, b]); assert.equal(calls, 2);
    console.log("PASS: exact final inputs, metadata replacement, mixed evidence, removal and protected-route rejection; zero rejected-input requests");

    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: FakeXHR });
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:8080";
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { protocol: "http:", origin: "http://localhost:3000" } } });
    const target = (url: string, credentials: boolean): R2UploadItem => ({ key: "owned/test", uploadUrl: url, withCredentials: credentials, method: "PUT", name: a.name, size: a.size, type: a.type });
    for (const url of ["https://evil.invalid/upload", "http://localhost:8080/upload", "//127.0.0.1:8080/upload", "javascript:alert(1)", "data:text/plain,test", "https://", "http://user:pass@127.0.0.1:8080/upload", "http://127.0.0.1:8080\\@evil.invalid/upload"]) {
        await assert.rejects(uploadFileToPresignedUrl(a, target(url, true)));
    }
    assert.equal(sends, 0, "untrusted targets never send");
    await uploadFileToPresignedUrl(a, target("http://127.0.0.1:8080/api/storage/local-ocr-image", true));
    await uploadFileToPresignedUrl(a, target("https://bucket.r2.invalid/signed?signature=synthetic", false));
    assert.equal(sends, 2);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { protocol: "https:" } } });
    await assert.rejects(uploadFileToPresignedUrl(a, target("http://127.0.0.1:8080/upload", true)), /downgrade/);
    process.env.NEXT_PUBLIC_API_URL = "https://backend.invalid";
    await uploadFileToPresignedUrl(a, target("https://backend.invalid/upload", true));
    assert.equal(sends, 3);
    console.log("PASS: configured cross-origin backend and credential-free R2 accepted; foreign, malformed, unsafe and downgrade targets blocked before send");

}
void main().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = originalApi;
    for (const [name, descriptor] of [["XMLHttpRequest", originalXHR], ["window", originalWindow]] as const) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
