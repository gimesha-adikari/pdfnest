"use client";

/**
 * Hybrid Feature Flag System
 *
 * Provides central, type-safe configuration for enabling/disabling client-side (WASM/Canvas/pdf-lib)
 * execution globally and per-tool via Next.js public environment variables (NEXT_PUBLIC_HYBRID_ENABLE_*).
 */

export interface FlagStatus {
    enabled: boolean;
    source: "per_tool_env" | "global_env" | "default";
    toolKey: string;
    envVarName: string;
}

/**
 * Normalizes a raw tool identifier into a consistent uppercase snake_case key
 * suitable for environment variable lookups.
 *
 * Examples:
 * - "rotate" -> "ROTATE"
 * - "pdf-to-images" -> "PDF_TO_IMAGES"
 * - "add_page_numbers" -> "ADD_PAGE_NUMBERS"
 */
export function normalizeToolKey(toolId: string): string {
    if (!toolId) return "";
    return toolId
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2") // camelCase to snake_case
        .replace(/[-\s]+/g, "_")             // kebab-case and spaces to snake_case
        .toUpperCase();
}

/**
 * Safely parses a string into a boolean or undefined if absent/malformed.
 */
export function parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
    }
    return undefined;
}

/**
 * Next.js only inlines public environment variables when the property name is
 * statically visible in source. Keep these reads literal while evaluating
 * them at call time so unit tests and server-side callers can still set env
 * values before resolving a flag. Add new per-tool keys here rather than
 * constructing process.env property names; unlisted keys use global/default.
 */
const perToolFlagReaders: Record<string, () => string | undefined> = {
    ADD_PAGE_NUMBERS: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_ADD_PAGE_NUMBERS,
    ADD_TEXT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_ADD_TEXT,
    CODE_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_CODE_TO_PDF,
    COMPRESS: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_COMPRESS,
    CROP: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_CROP,
    DELETE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_DELETE,
    DELETE_PAGES: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_DELETE_PAGES,
    DOCUMENT_EXTRACTION_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_DOCUMENT_EXTRACTION_V2,
    DUPLICATE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_DUPLICATE,
    DUPLICATE_PAGES: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_DUPLICATE_PAGES,
    EXCEL_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_EXCEL_TO_PDF,
    GRAYSCALE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_GRAYSCALE,
    HIGHLIGHT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_HIGHLIGHT,
    HIGHLIGHT_PDF_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_HIGHLIGHT_PDF_V2,
    HTML_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_HTML_TO_PDF,
    IMAGE_TO_SEARCHABLE_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_IMAGE_TO_SEARCHABLE_PDF,
    IMAGE_TO_TEXT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_IMAGE_TO_TEXT,
    IMAGE_TO_TEXT_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_IMAGE_TO_TEXT_PDF,
    IMAGES_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_IMAGES_TO_PDF,
    INSERT_BLANK: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_INSERT_BLANK,
    INSERT_BLANK_PAGES: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_INSERT_BLANK_PAGES,
    LOCK: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_LOCK,
    LOCK_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_LOCK_PDF,
    MARKDOWN_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_MARKDOWN_TO_PDF,
    MERGE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_MERGE,
    METADATA: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_METADATA,
    OCR_EXTRACT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_OCR_EXTRACT,
    OCR_TEXT_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_OCR_TEXT_V2,
    PDF_EDITOR: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_EDITOR,
    PDF_TO_EXCEL: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_EXCEL,
    PDF_TO_IMAGES: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_IMAGES,
    PDF_TO_MARKDOWN: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_MARKDOWN,
    PDF_TO_MARKDOWN_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_MARKDOWN_V2,
    PDF_TO_POWERPOINT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_POWERPOINT,
    PDF_TO_TEXT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_TEXT,
    PDF_TO_WORD: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_WORD,
    POWERPOINT_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_POWERPOINT_TO_PDF,
    PAGE_NUMBERS: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_PAGE_NUMBERS,
    REDACT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_REDACT,
    REORDER: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_REORDER,
    REORDER_PAGES: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_REORDER_PAGES,
    REPAIR: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_REPAIR,
    REPOSITORY_ANALYZER: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_REPOSITORY_ANALYZER,
    ROTATE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE,
    SEARCHABLE_PDF_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_SEARCHABLE_PDF_V2,
    SIGN: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_SIGN,
    SPLIT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_SPLIT,
    STUDIO_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_STUDIO_V2,
    STRIKEOUT: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_STRIKEOUT,
    STRIKEOUT_PDF_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_STRIKEOUT_PDF_V2,
    UNDERLINE: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_UNDERLINE,
    UNDERLINE_PDF_V2: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_UNDERLINE_PDF_V2,
    UNLOCK: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_UNLOCK,
    UNLOCK_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_UNLOCK_PDF,
    URL_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_URL_TO_PDF,
    WATERMARK: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_WATERMARK,
    WORD_TO_PDF: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_WORD_TO_PDF,
    UPDATE_METADATA: () => process.env.NEXT_PUBLIC_HYBRID_ENABLE_UPDATE_METADATA,
};

/**
 * Inspects the exact feature flag status for a given tool, including resolution source.
 *
 * Precedence Rules:
 * 1. Per-tool environment variable: NEXT_PUBLIC_HYBRID_ENABLE_<TOOL_KEY> (e.g. NEXT_PUBLIC_HYBRID_ENABLE_ROTATE)
 * 2. Global environment variable: NEXT_PUBLIC_HYBRID_ENABLE_ALL
 * 3. Default fallback: true (client execution enabled by default for supported tools when env flags are absent)
 */
export function getHybridFeatureFlagStatus(toolId: string): FlagStatus {
    const toolKey = normalizeToolKey(toolId);
    const envVarName = `NEXT_PUBLIC_HYBRID_ENABLE_${toolKey}`;

    // 1. Check per-tool env variable
    const perToolRaw = perToolFlagReaders[toolKey]?.();
    const perToolParsed = parseBooleanEnv(perToolRaw);
    if (perToolParsed !== undefined) {
        return {
            enabled: perToolParsed,
            source: "per_tool_env",
            toolKey,
            envVarName,
        };
    }

    // 2. Check global env variable
    const globalRaw = process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL;
    const globalParsed = parseBooleanEnv(globalRaw);
    if (globalParsed !== undefined) {
        return {
            enabled: globalParsed,
            source: "global_env",
            toolKey,
            envVarName,
        };
    }

    // 3. Default behavior (absent configuration defaults to enabled)
    return {
        enabled: true,
        source: "default",
        toolKey,
        envVarName,
    };
}

/**
 * Returns whether client-side execution is enabled for the specified tool according to feature flags.
 */
export function isClientExecutionEnabled(toolId: string): boolean {
    return getHybridFeatureFlagStatus(toolId).enabled;
}
