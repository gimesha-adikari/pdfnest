"use client";

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
    params: Record<string, any>;
    mode: ProcessingMode;
    allowFallback?: boolean;
    password?: string;
    onProgress?: (percentage: number) => void;
}

export interface ExecutionResult {
    blob: Blob;
    fileName: string;
    executionMode: "client" | "cloud";
    fallbackOccurred: boolean;
    telemetry?: Record<string, any>;
}

export interface SafetyGateEvaluation {
    eligible: boolean;
    recommendedMode: "client" | "cloud";
    reason?: string;
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
    | "UNSUPPORTED_CLIENT_OP"
    | "CLIENT_FAILURE"
    | "SAFETY_REJECTION"
    | "CLOUD_FAILURE"
    | "USER_CANCELLATION";

export class ExecutionError extends Error {
    code: ExecutionErrorCode;
    originalError?: unknown;

    constructor(code: ExecutionErrorCode, message: string, originalError?: unknown) {
        super(message);
        this.name = "ExecutionError";
        this.code = code;
        this.originalError = originalError;
    }
}
