import type { OcrMarkupPreview } from "@/lib/ocrMarkupPreview";

export const MAX_OCR_MARKUP_PREVIEW_CACHE_ENTRIES = 6;

export function rememberOcrMarkupPreview(
    cache: Map<string, OcrMarkupPreview>,
    key: string,
    value: OcrMarkupPreview,
    maxEntries = MAX_OCR_MARKUP_PREVIEW_CACHE_ENTRIES,
): void {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > Math.max(1, maxEntries)) {
        const oldest = cache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

