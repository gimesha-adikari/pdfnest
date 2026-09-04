import assert from "assert";

import { submitOcrAwareMarkup } from "@/lib/ocrAwareMarkupV2";

const originalFetch = globalThis.fetch;

async function runTests(): Promise<void> {
    const file = new File(["%PDF-1.7"], "selected.pdf", { type: "application/pdf" });
    const selection = {
        page: 2,
        source: "ocr" as const,
        coordinate_space: "pdf_points_visible_cropbox_top_left",
        page_width: 800,
        page_height: 600,
        rotation: 90,
        crop_box: [0, 0, 600, 800],
        word_ids: ["word-1", "word-2"],
        rects: [{ x: 80, y: 180, width: 200, height: 30 }],
        text: "Rotated OCR",
    };
    let request: Request | null = null;
    try {
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            request = new Request(input, init);
            return new Response(JSON.stringify({ job_id: "job-1", status: "QUEUED" }), { status: 202, headers: { "Content-Type": "application/json" } });
        };
        await submitOcrAwareMarkup("underline", file, selection.text, "ocr", "eng", "#2563EB", selection);
        const capturedRequest = request as Request | null;
        if (!capturedRequest) throw new Error("The markup request was not captured.");
        const body = await capturedRequest.formData();
        assert.strictEqual(body.get("query"), "Rotated OCR");
        assert.deepStrictEqual(JSON.parse(String(body.get("selection"))), selection);

        console.log("OCR-aware markup selection request test passed.");
    } finally {
        globalThis.fetch = originalFetch;
    }
}

void runTests();
