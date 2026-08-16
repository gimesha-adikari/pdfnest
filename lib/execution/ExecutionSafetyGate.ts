"use client";

import { SafetyGateEvaluation, ToolPolicy } from "./types";

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

export class ExecutionSafetyGate {
    static evaluate(
        toolId: string,
        files: File[],
        policy: ToolPolicy,
        params?: Record<string, any>,
        config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG
    ): SafetyGateEvaluation {
        const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);
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
                metrics,
            };
        }

        // 1.1 OCR mode requires server-side cloud OCR worker
        if (params?.mode === "ocr") {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: "OCR text recognition mode requires server-side cloud worker processing.",
                metrics,
            };
        }

        // 2. File size thresholds (halved for mobile)
        const effectiveSizeCapMB = isMobile ? config.maxClientFileSizeMB / 2 : config.maxClientFileSizeMB;
        if (fileSizeMB > effectiveSizeCapMB) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `File size (${fileSizeMB.toFixed(1)} MB) exceeds local processing safety threshold of ${effectiveSizeCapMB} MB.`,
                metrics,
            };
        }

        // 3. File count check
        if (files.length > config.maxClientFileCount) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `Batch file count (${files.length}) exceeds local processing limit of ${config.maxClientFileCount}.`,
                metrics,
            };
        }

        // 4. Low device RAM check
        if (deviceMemoryGB < config.minDeviceMemoryGB) {
            return {
                eligible: false,
                recommendedMode: "cloud",
                reason: `Available device memory (${deviceMemoryGB} GB) is below the minimum recommended (${config.minDeviceMemoryGB} GB).`,
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
