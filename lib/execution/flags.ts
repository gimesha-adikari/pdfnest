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
    const perToolRaw = process.env[envVarName];
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
