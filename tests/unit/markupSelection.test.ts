import assert from "assert";

import {
    clientRectsToMarkupSelectionRects,
    groupMarkupSelectionRects,
    wordRectsToMarkupSelectionRects,
} from "@/lib/markupSelection";
import { MAX_OCR_MARKUP_PREVIEW_CACHE_ENTRIES, rememberOcrMarkupPreview } from "@/lib/ocrMarkupPreviewCache";
import type { OcrMarkupPreview } from "@/lib/ocrMarkupPreview";

const preview = { schema_version: "ocr_v2_markup_preview.v1", profile: "MARKUP_V2", status: "SUCCEEDED", page_count: 1, pages: [] };

function runTests(): void {
    const grouped = groupMarkupSelectionRects([
        { x: 10, y: 10, width: 20, height: 8 },
        { x: 40, y: 11, width: 15, height: 7 },
        { x: 12, y: 40, width: 25, height: 8 },
    ], 100, 100);
    assert.deepStrictEqual(grouped, [
        { x: 10, y: 10, width: 45, height: 8 },
        { x: 12, y: 40, width: 25, height: 8 },
    ]);

    const mapped = clientRectsToMarkupSelectionRects(
        [{ left: 30, top: 60, width: 50, height: 20 }],
        { left: 10, top: 20, width: 200, height: 400 },
        100,
        200,
    );
    assert.deepStrictEqual(mapped, [{ x: 10, y: 20, width: 25, height: 10 }]);

    const words = wordRectsToMarkupSelectionRects([
        { id: "a", x: 10, y: 10, width: 20, height: 8 },
        { id: "b", x: 35, y: 10, width: 20, height: 8 },
        { id: "c", x: 10, y: 35, width: 20, height: 8 },
    ], ["a", "b", "c"], 100, 100);
    assert.strictEqual(words.length, 2);
    assert.deepStrictEqual(words[0], { x: 10, y: 10, width: 45, height: 8 });
    assert.deepStrictEqual(words[1], { x: 10, y: 35, width: 20, height: 8 });

    const cache = new Map<string, OcrMarkupPreview>();
    for (let index = 0; index < MAX_OCR_MARKUP_PREVIEW_CACHE_ENTRIES + 2; index += 1) {
        rememberOcrMarkupPreview(cache, `page-${index}`, preview);
    }
    assert.strictEqual(cache.size, MAX_OCR_MARKUP_PREVIEW_CACHE_ENTRIES);
    assert.strictEqual(cache.has("page-0"), false);
    assert.strictEqual(cache.has("page-1"), false);
    assert.strictEqual(cache.has("page-2"), true);

    console.log("Markup selection geometry and bounded-cache tests passed.");
}

runTests();
