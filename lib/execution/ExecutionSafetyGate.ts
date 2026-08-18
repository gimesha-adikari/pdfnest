"use client";

import { SafetyGateEvaluation, SafetyRejectionCategory, ToolPolicy } from "./types";

export interface SafetyGateConfig {
    maxClientFileSizeMB: number;
    maxClientFileCount: number;
    minDeviceMemoryGB: number;
}

const DEFAULT_SAFETY_CONFIG: SafetyGateConfig = {
    maxClientFileSizeMB: 25,
    maxClientFileCount: 20,
    minDeviceMemoryGB: 2,
};

export interface WasmProbeResult {
    supported: boolean;
    reason?: string;
    category?: "WASM_UNAVAILABLE" | "UNSUPPORTED_WASM" | "WASM_MEMORY_LIMIT";
}

let cachedWasmProbeResult: WasmProbeResult | null = null;

/**
 * Checks whether a tool depends on WebAssembly engines (e.g. pdfcpu WASM)
 * rather than pure JavaScript/Canvas engines (pdf-lib, pdfjs-dist, fflate).
 */
export function isWasmDependentTool(toolId: string): boolean {
    if (!toolId) return false;
    const normalized = toolId.trim().toLowerCase().replace(/[-\s]+/g, "_");
    return [
        "watermark",
        "compress",
        "compress_pdf",
        "optimize",
        "optimize_pdf",
        "add_page_numbers",
        "add_text",
        "lock",
        "unlock",
        "repair",
        "repair_pdf",
        "structure_repair",
        "crop",
        "highlight",
        "highlight_pdf",
        "underline",
        "underline_pdf",
        "strikeout",
        "strikeout_pdf",
        "strikethrough",
    ].includes(normalized);
}

/**
 * Probes browser WebAssembly capabilities and memory allocation support.
 * Results are cached in memory for fast repeated evaluations.
 */
export function probeWasmCapability(forceRecheck = false): WasmProbeResult {
    if (cachedWasmProbeResult && !forceRecheck) {
        return cachedWasmProbeResult;
    }

    try {
        // 1. Check if WebAssembly API exists in runtime context
        if (
            typeof WebAssembly === "undefined" ||
            !WebAssembly ||
            typeof WebAssembly.validate !== "function" ||
            typeof WebAssembly.Memory !== "function"
        ) {
            cachedWasmProbeResult = {
                supported: false,
                reason: "WebAssembly APIs (validate/Memory) are disabled or unavailable in this browser.",
                category: "WASM_UNAVAILABLE",
            };
            return cachedWasmProbeResult;
        }

        // 2. Validate minimal 8-byte WASM header (\0asm\1\0\0\0)
        const minimalWasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        if (!WebAssembly.validate(minimalWasmBytes)) {
            cachedWasmProbeResult = {
                supported: false,
                reason: "WebAssembly bytecode validation failed in this browser environment.",
                category: "UNSUPPORTED_WASM",
            };
            return cachedWasmProbeResult;
        }

        // 3. Test allocation of a minimal 1-page (64 KB) WASM memory block
        const mem = new WebAssembly.Memory({ initial: 1 });
        if (!mem || !mem.buffer || mem.buffer.byteLength < 65536) {
            cachedWasmProbeResult = {
                supported: false,
                reason: "WebAssembly memory allocation test failed.",
                category: "WASM_MEMORY_LIMIT",
            };
            return cachedWasmProbeResult;
        }

        cachedWasmProbeResult = { supported: true };
        return cachedWasmProbeResult;
    } catch (err: any) {
        cachedWasmProbeResult = {
            supported: false,
            reason: `WebAssembly capability probe failed: ${err instanceof Error ? err.message : String(err)}`,
            category: "WASM_MEMORY_LIMIT",
        };
        return cachedWasmProbeResult;
    }
}

/**
 * Resets the in-memory WASM probe cache. Used primarily for unit tests.
 */
export function resetWasmProbeCache(): void {
    cachedWasmProbeResult = null;
}

export class ExecutionSafetyGate {
    static evaluate(
        toolId: string,
        files: File[],
        policy: ToolPolicy,
        params?: Record<string, any>,
        config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG
    ): SafetyGateEvaluation {
        const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const totalSizeBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
        const fileSizeMB = totalSizeBytes / (1024 * 1024);
        const deviceMemoryGB = typeof navigator !== "undefined" ? (navigator as any).deviceMemory || 4 : 4;

        const metrics = {
            fileSizeMB: Number(fileSizeMB.toFixed(2)),
            totalFiles: files.length,
            deviceMemoryGB,
            isMobile,
        };

        // 1. Tool policy restrictions
        if (policy === "BACKEND_ONLY" || policy === "SECURITY_CRITICAL_BACKEND") {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: "This tool requires server-side cloud processing engines.",
                rejectionCategory: "POLICY_RESTRICTION",
                metrics,
            };
        }

        // 1.1 OCR mode requires server-side cloud OCR worker
        if (params?.mode === "ocr") {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: "OCR text recognition mode requires server-side cloud worker processing.",
                rejectionCategory: "OCR_REQUIRED",
                metrics,
            };
        }

        // 1.2 WASM preflight probe for WASM-dependent tools
        if (isWasmDependentTool(toolId)) {
            const wasmProbe = probeWasmCapability();
            if (!wasmProbe.supported) {
                return {
                    eligible: false,
                    recommendedMode: "cloud",
                    reason: wasmProbe.reason || "WebAssembly processing is unavailable for this tool.",
                    rejectionCategory: wasmProbe.category || "UNSUPPORTED_WASM",
                    metrics,
                };
            }
        }

        // 2. File size thresholds (halved for mobile)
        const effectiveSizeCapMB = isMobile ? config.maxClientFileSizeMB / 2 : config.maxClientFileSizeMB;
        if (fileSizeMB > effectiveSizeCapMB) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `File size (${fileSizeMB.toFixed(1)} MB) exceeds local processing safety threshold of ${effectiveSizeCapMB} MB.`,
                rejectionCategory: "FILE_SIZE_LIMIT",
                metrics,
            };
        }

        // 3. File count check
        if (files.length > config.maxClientFileCount) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `Batch file count (${files.length}) exceeds local processing limit of ${config.maxClientFileCount}.`,
                rejectionCategory: "FILE_COUNT_LIMIT",
                metrics,
            };
        }

        // 4. Low device RAM check
        if (deviceMemoryGB < config.minDeviceMemoryGB) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `Available device memory (${deviceMemoryGB} GB) is below the minimum recommended (${config.minDeviceMemoryGB} GB).`,
                rejectionCategory: "LOW_DEVICE_MEMORY",
                metrics,
            };
        }

        return {
            eligible: true,
            recommendedMode: "client",
            metrics,
        };
    }
}
