import assert from "assert";
import {
    createStructuredOcrV2Job,
    getStructuredCapabilities,
    getStructuredOcrV2Job,
    getStructuredOcrV2Result,
    normalizeStructuredState,
    safeStructuredMessage,
    StructuredOcrV2ApiError,
    structuredDownloadName,
} from "@/lib/structuredOcrV2";

assert.strictEqual(normalizeStructuredState("queued"), "QUEUED");
assert.strictEqual(normalizeStructuredState("processing"), "RUNNING");
assert.strictEqual(normalizeStructuredState("completed"), "SUCCEEDED");
assert.strictEqual(normalizeStructuredState("cancel_requested"), "CANCELLING");
assert.strictEqual(normalizeStructuredState("failed"), "FAILED");
assert.strictEqual(structuredDownloadName("Quarterly report.pdf", "PDF_MARKDOWN_V2"), "Quarterly-report-markdown.md");
assert.strictEqual(structuredDownloadName(".pdf", "DOCUMENT_EXTRACTION_V2"), "document-structured.json");
assert.strictEqual(safeStructuredMessage("STRUCTURED_ENGINE_UNAVAILABLE"), "Structured document processing is temporarily unavailable.");

const originalFetch = globalThis.fetch;
let lastRequest: { url: string; method: string; headers: Headers; body: FormData | null } | null = null;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastRequest = { url: String(input), method: init?.method || "GET", headers: new Headers(init?.headers), body: init?.body instanceof FormData ? init.body : null };
    const response = {
        job_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "queued",
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
        profile: "DOCUMENT_EXTRACTION_V2",
        language: "eng",
        routing_policy: "AUTO",
        progress: { completed_pages: 0, total_pages: 1, failed_pages: [], page_statuses: {}, percent: 0 },
        warnings: [],
        result_available: false,
    };
    if (String(input).endsWith("/structured/capabilities")) {
        return new Response(JSON.stringify({
            schema_version: "ocr_v2_structured_capabilities.v1",
            service_ready: true,
            native_first: true,
            languages: [{ code: "eng", name: "English" }, { code: "jpn_vert", name: "jpn_vert" }],
            routing_modes: [{ id: "AUTO", label: "Automatic", description: "Automatic", available: true }],
            language_policy: { modes: ["EXPLICIT", "AUTO"], default_mode: "AUTO", max_languages: 3, auto_statuses: ["DETECTED", "UNCERTAIN"] },
        }), { status: 200 });
    }
    if (String(input).endsWith("/result")) {
        return new Response(JSON.stringify({ schema_version: "ocr_v2_structured_document.v1", result_id: "result-1", source: {}, pages: [], capabilities: [], available_capabilities: [], warnings: [], validation: { valid: true } }), { status: 200 });
    }
    return new Response(JSON.stringify(response), { status: init?.method === "POST" ? 202 : 200 });
};

async function run(): Promise<void> {
    try {
        const capabilities = await getStructuredCapabilities();
        assert.deepStrictEqual(capabilities.languages.map((item) => item.code), ["eng", "jpn_vert"]);
        assert.strictEqual(capabilities.routing_modes[0].id, "AUTO");
        const created = await createStructuredOcrV2Job(new File(["%PDF-1.7"], "sample.pdf", { type: "application/pdf" }), "DOCUMENT_EXTRACTION_V2", "eng", "AUTO", "idem-1", "request-1");
        assert.strictEqual(created.job_id, "123e4567-e89b-12d3-a456-426614174000");
        assert.strictEqual(lastRequest?.headers.get("Idempotency-Key"), "idem-1");
        assert.strictEqual(lastRequest?.headers.get("X-Request-ID"), "request-1");
        assert.strictEqual(lastRequest?.body?.get("profile"), "DOCUMENT_EXTRACTION_V2");
        await getStructuredOcrV2Job("DOCUMENT_EXTRACTION_V2", created.job_id);
        const result = await getStructuredOcrV2Result("DOCUMENT_EXTRACTION_V2", created.job_id);
        assert.strictEqual(result.schema_version, "ocr_v2_structured_document.v1");
        globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({ code: "STRUCTURED_OUTPUT_INVALID", message: "safe" }), { status: 422 });
        await assert.rejects(() => getStructuredOcrV2Job("DOCUMENT_EXTRACTION_V2", created.job_id), (error: unknown) => error instanceof StructuredOcrV2ApiError && error.code === "STRUCTURED_OUTPUT_INVALID");
    } finally {
        globalThis.fetch = originalFetch;
    }
}

void run().then(() => console.log("Structured OCR V2 contract tests passed."));
