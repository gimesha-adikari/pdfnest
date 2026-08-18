"use client";

import type { BackendError } from "@/lib/api";

export type ProcessingMode = "auto" | "device" | "cloud";

export type ToolPolicy =
    | "CLIENT_ONLY"
    | "CLIENT_PREFERRED"
    | "HYBRID"
    | "BACKEND_ONLY"
    | "SECURITY_CRITICAL_BACKEND";

export interface ExecutionOptions {
    tool: string;
    files: File[];
    params?: Record<string, any>;
    mode: ProcessingMode;
    allowFallback?: boolean;
    password?: string;
    passwords?: (string | undefined)[];
    onProgress?: (percentage: number) => void;
    signal?: AbortSignal;
}

export interface ExecutionResult {
    blob: Blob;
    fileName: string;
    executionMode: "client" | "cloud";
    fallbackOccurred: boolean;
    telemetry?: Record<string, any>;
}

export type SafetyRejectionCategory =
    | "POLICY_RESTRICTION"
    | "OCR_REQUIRED"
    | "FILE_SIZE_LIMIT"
    | "FILE_COUNT_LIMIT"
    | "LOW_DEVICE_MEMORY"
    | "UNSUPPORTED_WASM"
    | "WASM_UNAVAILABLE"
    | "WASM_MEMORY_LIMIT";

export interface SafetyGateEvaluation {
    eligible: boolean;
    recommendedMode: "client" | "cloud";
    reason?: string;
    rejectionCategory?: SafetyRejectionCategory;
    metrics?: {
        fileSizeMB: number;
        totalFiles: number;
        estimatedPages?: number;
        deviceMemoryGB?: number;
        isMobile: boolean;
    };
}

export type ExecutionErrorCode =
    | "INVALID_INPUT"
    | "DECRYPTION_AUTH_FAILED"
    | "UNSUPPORTED_CLIENT_OP"
    | "CLIENT_FAILURE"
    | "SAFETY_REJECTION"
    | "CLOUD_FAILURE"
    | "CLOUD_UNAVAILABLE"
    | "BACKEND_UNAVAILABLE"
    | "USER_CANCELLATION";

export class ExecutionError extends Error {
    code: ExecutionErrorCode;
    originalError?: unknown;
    status?: number;
    billing?: BackendError;

    constructor(code: ExecutionErrorCode, message: string, originalError?: unknown) {
        super(message);
        this.name = "ExecutionError";
        this.code = code;
        this.originalError = originalError;

        if (originalError && typeof originalError === "object") {
            const orig = originalError as any;
            if (typeof orig.status === "number") this.status = orig.status;
            if (orig.billing) this.billing = orig.billing;
        }
    }
}
