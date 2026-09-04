import assert from "assert";

import {
    fetchOcrMarkupPreview,
    OcrMarkupPreviewError,
    safeOcrMarkupPreviewMessage,
} from "@/lib/ocrMarkupPreview";

const originalFetch = globalThis.fetch;

async function runTests(): Promise<void> {
    const file = new File(["%PDF-1.7"], "scanned.pdf", { type: "application/pdf" });
    const capturedRequests: Array<{ url: string; init?: RequestInit }> = [];

    try {
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            capturedRequests.push({ url: String(input), init });
            return new Response(JSON.stringify({
                schema_version: "ocr_v2_markup_preview.v1",
                profile: "MARKUP_V2",
                status: "SUCCEEDED",
                page_count: 1,
                pages: [{
                    page_index: 0,
                    page_number: 1,
                    page_id: "page-0",
                    width: 600,
                    height: 800,
                    rotation: 0,
                    coordinate_space: "pdf_points_visible_cropbox_top_left",
                    classification: "IMAGE_SCAN",
                    kind: "scanned",
                    selection_mode: "ocr",
                    status: "SUCCESS",
                    has_selectable_text: true,
                    word_count: 1,
                    reading_order: ["word-0"],
                    words: [{ id: "word-0", text: "Scanned", x: 10, y: 20, width: 60, height: 12, order: 0 }],
                    language: { requested: ["eng"], detected: ["eng"] },
                }],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        };

        const preview = await fetchOcrMarkupPreview(file, "eng+sin");
        assert.strictEqual(preview.pages[0].selection_mode, "ocr");
        const capturedRequest = capturedRequests[0];
        if (!capturedRequest) throw new Error("The preview request was not captured.");
        assert.strictEqual(capturedRequest.url.endsWith("/api/v2/ocr/markup/preview"), true);
        const body = capturedRequest.init?.body as FormData;
        assert.strictEqual(body.get("profile"), "MARKUP_V2");
        assert.strictEqual(body.get("language"), "eng+sin");
        assert.strictEqual(body.get("language_mode"), "EXPLICIT");
        assert.deepStrictEqual(body.getAll("languages"), ["eng", "sin"]);

        capturedRequests.length = 0;
        await fetchOcrMarkupPreview(file, "eng", 2);
        const pageScopedBody = capturedRequests[0]?.init?.body as FormData;
        assert.strictEqual(pageScopedBody.get("page_index"), "2");

        globalThis.fetch = async (): Promise<Response> => new Response(JSON.stringify({ code: "ENGINE_FAILURE", message: "private stack detail" }), { status: 502 });
        await assert.rejects(
            () => fetchOcrMarkupPreview(file),
            (error: unknown) => error instanceof OcrMarkupPreviewError && error.code === "ENGINE_FAILURE" && !error.message.includes("private stack detail"),
        );
        assert.strictEqual(safeOcrMarkupPreviewMessage(new OcrMarkupPreviewError("WORD_GEOMETRY_NOT_AVAILABLE", "internal detail", 422)), "Selectable text is not available for this page. You can use Find text instead.");
        assert.strictEqual(safeOcrMarkupPreviewMessage(new OcrMarkupPreviewError("NETWORK_FAILURE", "private network detail", 0)), "We couldn't connect to the processing service.");
    } finally {
        globalThis.fetch = originalFetch;
    }
}

void runTests().then(() => console.log("OCR markup preview contract tests passed."));
