import assert from "assert";
import {
    cancelOcrTextV2Job,
    createOcrTextV2Job,
    getOcrTextV2Capabilities,
    getOcrTextV2Job,
    getOcrTextV2Result,
    normalizeOcrTextV2State,
    OcrTextV2ApiError,
    safeDownloadFilename,
    safeMessageForCode,
    warningMessage,
    type OcrTextV2JobStatus,
} from "@/lib/ocrV2";

function progress(completed: number, total: number, failedPages: number[] = []): OcrTextV2JobStatus["progress"] {
    return {
        completed_pages: completed,
        total_pages: total,
        failed_pages: failedPages,
        page_statuses: {},
        percent: total ? Math.round((completed / total) * 100) : 0,
    };
}

assert.strictEqual(normalizeOcrTextV2State("queued"), "QUEUED");
assert.strictEqual(normalizeOcrTextV2State("PROCESSING"), "RUNNING");
assert.strictEqual(normalizeOcrTextV2State("COMPLETED"), "SUCCEEDED");
assert.strictEqual(normalizeOcrTextV2State("CANCEL_REQUESTED"), "CANCELLING");
assert.strictEqual(normalizeOcrTextV2State("CANCELLED"), "CANCELLED");
assert.strictEqual(normalizeOcrTextV2State("FAILED"), "FAILED");

const partial: OcrTextV2JobStatus = {
    job_id: "123e4567-e89b-12d3-a456-426614174000",
    status: "RUNNING",
    created_at: "2026-08-29T00:00:00Z",
    updated_at: "2026-08-29T00:00:01Z",
    profile: "OCR_TEXT_V2",
    language: "eng",
    routing_policy: "AUTO",
    progress: progress(1, 4, [0]),
    warnings: [],
    result_available: false,
};
assert.strictEqual(partial.progress.percent, 25);
assert.deepStrictEqual(partial.progress.failed_pages, [0]);

assert.strictEqual(
    warningMessage("ENGINE_FALLBACK:PP_OCR_UNAVAILABLE_TO_TESSERACT"),
    "The enhanced OCR path was unavailable, so standard OCR was used."
);
assert.strictEqual(safeMessageForCode("RESULT_EXPIRED"), "This result is no longer available. Start a new run to process the PDF again.");
assert.strictEqual(safeDownloadFilename("Quarterly report / final.pdf"), "Quarterly-report-final-extracted-text.txt");
assert.strictEqual(safeDownloadFilename(".pdf"), "document-extracted-text.txt");

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string; headers: Headers }> = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), method: init?.method || "GET", headers });
    if (String(input).endsWith("/capabilities")) {
        return new Response(JSON.stringify({
            languages: [{ code: "eng", name: "English" }],
            routing_modes: [{ id: "AUTO", label: "Balanced", description: "Balanced", available: true }],
            quality_engine_available: false,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(input).endsWith("/jobs") && init?.method === "POST") {
        return new Response(JSON.stringify({
            job_id: "123e4567-e89b-12d3-a456-426614174000",
            status: "queued",
            created_at: "2026-08-29T00:00:00Z",
            updated_at: "2026-08-29T00:00:00Z",
            profile: "OCR_TEXT_V2",
            language: "eng",
            routing_policy: "AUTO",
            progress: progress(0, 1),
            warnings: [],
            result_available: false,
        }), { status: 202, headers: { "Content-Type": "application/json" } });
    }
    if (String(input).endsWith("/result")) {
        return new Response(JSON.stringify({
            schema_version: "ocr_v2_worker_response.v1",
            request_id: "request-1",
            profile: "OCR_TEXT_V2",
            status: "SUCCEEDED",
            text: "hello",
            pages: [],
            warnings: [],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "DELETE") {
        return new Response(JSON.stringify({
            job_id: "123e4567-e89b-12d3-a456-426614174000",
            status: "cancelled",
            created_at: "2026-08-29T00:00:00Z",
            updated_at: "2026-08-29T00:00:00Z",
            profile: "OCR_TEXT_V2",
            language: "eng",
            routing_policy: "AUTO",
            progress: progress(0, 1),
            warnings: [],
            result_available: false,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
        job_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "running",
        created_at: "2026-08-29T00:00:00Z",
        updated_at: "2026-08-29T00:00:00Z",
        profile: "OCR_TEXT_V2",
        language: "eng",
        routing_policy: "AUTO",
        progress: progress(0, 1),
        warnings: [],
        result_available: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
};

async function runApiClientTests(): Promise<void> {
    try {
        const capabilities = await getOcrTextV2Capabilities();
        assert.strictEqual(capabilities.languages[0].code, "eng");
        const created = await createOcrTextV2Job(new File(["%PDF-test"], "sample.pdf", { type: "application/pdf" }), "eng", "AUTO", "idempotency-1", "request-1");
        assert.strictEqual(created.job_id, "123e4567-e89b-12d3-a456-426614174000");
        assert.strictEqual(requests[1].headers.get("Idempotency-Key"), "idempotency-1");
        await getOcrTextV2Job(created.job_id);
        await getOcrTextV2Result(created.job_id);
        await cancelOcrTextV2Job(created.job_id);

        globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({ code: "FORBIDDEN", message: "not yours" }), { status: 403 });
        await assert.rejects(() => getOcrTextV2Job(created.job_id), (error: unknown) => error instanceof OcrTextV2ApiError && error.code === "FORBIDDEN");

        let authFailureRequests = 0;
        globalThis.fetch = async (): Promise<Response> => {
            authFailureRequests += 1;
            return new Response(JSON.stringify({ error: "authentication required" }), { status: 401 });
        };
        await assert.rejects(() => getOcrTextV2Capabilities(), (error: unknown) => error instanceof OcrTextV2ApiError && error.code === "AUTHENTICATION_REQUIRED");
        assert.strictEqual(authFailureRequests, 1, "authentication failures must not be retried automatically");
    } finally {
        globalThis.fetch = originalFetch;
    }
}

void runApiClientTests().then(() => console.log("OCR Text V2 contract tests passed."));
