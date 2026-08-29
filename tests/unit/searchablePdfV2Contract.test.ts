import assert from "assert";
import {
    createSearchablePdfV2Job,
    downloadSearchablePdfV2Result,
    getSearchablePdfV2Capabilities,
    getSearchablePdfV2Job,
    normalizeSearchablePdfV2State,
    safeMessageForSearchablePdfCode,
    safeSearchablePdfDownloadFilename,
    SearchablePdfV2ApiError,
    type SearchablePdfV2JobStatus,
} from "@/lib/searchablePdfV2";

const job: SearchablePdfV2JobStatus = {
    job_id: "123e4567-e89b-12d3-a456-426614174000",
    status: "QUEUED",
    profile: "SEARCHABLE_PDF_V2",
    language: "eng",
    routing_policy: "AUTO",
    progress: { completed_pages: 0, total_pages: 2, failed_pages: [], page_statuses: {}, percent: 0 },
    warnings: [],
    result_available: false,
};

assert.strictEqual(normalizeSearchablePdfV2State("queued"), "QUEUED");
assert.strictEqual(normalizeSearchablePdfV2State("processing"), "RUNNING");
assert.strictEqual(normalizeSearchablePdfV2State("completed"), "SUCCEEDED");
assert.strictEqual(normalizeSearchablePdfV2State("cancel_requested"), "CANCELLING");
assert.strictEqual(normalizeSearchablePdfV2State("cancelled"), "CANCELLED");
assert.strictEqual(normalizeSearchablePdfV2State("failed"), "FAILED");
assert.strictEqual(safeSearchablePdfDownloadFilename("Receipt / August.png"), "Receipt-August-searchable.pdf");
assert.strictEqual(safeMessageForSearchablePdfCode("AUTHENTICATION_REQUIRED"), "Sign in to create a searchable PDF.");

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string; headers: Headers; body?: FormData }> = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body instanceof FormData ? init.body : undefined;
    requests.push({ url: String(input), method: init?.method || "GET", headers: new Headers(init?.headers), body });
    const url = String(input);
    if (url.endsWith("/capabilities")) {
        return new Response(JSON.stringify({
            schema_version: "ocr_v2_capabilities.v1",
            profile: "SEARCHABLE_PDF_V2",
            service_ready: true,
            languages: [{ code: "eng", name: "English" }],
            routing_modes: [{ id: "AUTO", label: "Balanced", description: "Balanced", available: true }],
            searchable_pdf: { available: true, engine_id: "tesseract", input_formats: ["image/png", "image/jpeg"] },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/jobs") && init?.method === "POST") {
        return new Response(JSON.stringify(job), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/result")) {
        return new Response(new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" }), {
            status: 200,
            headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ordered.pdf"' },
        });
    }
    return new Response(JSON.stringify({ ...job, status: "RUNNING" }), { status: 200, headers: { "Content-Type": "application/json" } });
};

async function runApiClientTests(): Promise<void> {
    try {
        const capabilities = await getSearchablePdfV2Capabilities();
        assert.strictEqual(capabilities.searchable_pdf.engine_id, "tesseract");

        const first = new File(["one"], "first.png", { type: "image/png" });
        const second = new File(["two"], "second.jpg", { type: "image/jpeg" });
        const created = await createSearchablePdfV2Job([first, second], "eng", "AUTO", "idem-1", "request-1");
        assert.strictEqual(created.job_id, job.job_id);
        const submit = requests.find((item) => item.method === "POST");
        assert.ok(submit);
        assert.strictEqual(submit?.headers.get("Idempotency-Key"), "idem-1");
        assert.strictEqual(submit?.headers.get("X-Request-ID"), "request-1");
        assert.deepStrictEqual(submit?.body?.getAll("file").map((item) => (item as File).name), ["first.png", "second.jpg"]);

        const status = await getSearchablePdfV2Job(job.job_id);
        assert.strictEqual(status.status, "RUNNING");
        const result = await downloadSearchablePdfV2Result(job.job_id);
        assert.strictEqual(result.fileName, "ordered.pdf");
        assert.strictEqual(result.blob.type, "application/pdf");

        globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({ code: "FORBIDDEN", message: "not yours" }), { status: 403 });
        await assert.rejects(() => getSearchablePdfV2Job(job.job_id), (error: unknown) => error instanceof SearchablePdfV2ApiError && error.code === "FORBIDDEN");
    } finally {
        globalThis.fetch = originalFetch;
    }
}

void runApiClientTests().then(() => console.log("Searchable PDF V2 contract tests passed."));
