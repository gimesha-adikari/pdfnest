"use client";

import { ClientExecutor } from "./ClientExecutor";
import { CloudExecutor } from "./CloudExecutor";
import { ExecutionSafetyGate } from "./ExecutionSafetyGate";
import { isClientExecutionEnabled } from "./flags";
import { extractFileMetrics, telemetry } from "./telemetry";
import { notifyHybridFallback } from "../notify";
import {
    ExecutionError,
    ExecutionOptions,
    ExecutionResult,
    ToolPolicy,
} from "./types";

export class ExecutionManager {
    static async run(options: ExecutionOptions): Promise<ExecutionResult> {
        const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
        const { tool, files, mode, allowFallback = true } = options;
        const { fileSizeMB, fileCount } = extractFileMetrics(files || []);

        if (!files || files.length === 0) {
            const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
            telemetry.record({
                toolId: tool || "unknown",
                requestedMode: mode || "auto",
                category: "client_failure",
                durationMs,
                success: false,
                fallbackOccurred: false,
                errorCode: "INVALID_INPUT",
                featureFlagDisabled: false,
                fileSizeMB: 0,
                fileCount: 0,
                timestamp: Date.now(),
            });
            throw new ExecutionError("INVALID_INPUT", "No files provided for execution.");
        }

        if (options.signal?.aborted) {
            const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
            telemetry.record({
                toolId: tool,
                requestedMode: mode,
                category: "client_failure",
                durationMs,
                success: false,
                fallbackOccurred: false,
                errorCode: "USER_CANCELLATION",
                featureFlagDisabled: false,
                fileSizeMB,
                fileCount,
                timestamp: Date.now(),
            });
            throw new ExecutionError("USER_CANCELLATION", "Execution was cancelled by the user.");
        }

        const primaryFile = files[0];
        const outputFileName = buildOutputFileName(tool, primaryFile.name);
        const policy: ToolPolicy = getToolPolicy(tool);

        // 1. Determine client-side engine support AND feature flag status
        const clientSupported = ClientExecutor.isSupported(tool);
        const flagEnabled = isClientExecutionEnabled(tool);
        const clientEligible = clientSupported && flagEnabled;

        // Device mode is a strict venue choice: fail closed before any cloud call.
        if (mode === "device" && !clientEligible) {
            const featureFlagDisabled = clientSupported && !flagEnabled;
            const message = !clientSupported
                ? `Tool '${tool}' is not supported for Device processing.`
                : `Device processing for '${tool}' is disabled by its client execution feature flag.`;
            const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
            telemetry.record({
                toolId: tool,
                requestedMode: "device",
                category: "client_failure",
                durationMs,
                success: false,
                fallbackOccurred: false,
                errorCode: "UNSUPPORTED_CLIENT_OP",
                featureFlagDisabled,
                fileSizeMB,
                fileCount,
                timestamp: Date.now(),
            });
            throw new ExecutionError("UNSUPPORTED_CLIENT_OP", message);
        }

        // Explicit Cloud mode goes to CloudExecutor. Auto mode also uses cloud
        // when the client does not support the tool or its feature flag is off.
        if (mode === "cloud" || (mode !== "device" && !clientEligible)) {
            const isFlagDisabled = clientSupported && !flagEnabled;
            const isAutoFallback = mode === "auto" && isFlagDisabled;
            try {
                const blob = await CloudExecutor.execute(options);
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                telemetry.record({
                    toolId: tool,
                    requestedMode: mode,
                    actualMode: "cloud",
                    category: isFlagDisabled ? "feature_flag_disabled" : "direct_cloud_success",
                    durationMs,
                    success: true,
                    fallbackOccurred: isAutoFallback,
                    featureFlagDisabled: isFlagDisabled,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });
                if (isAutoFallback) {
                    notifyHybridFallback("Client execution disabled via feature flag.");
                }
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "cloud",
                    fallbackOccurred: isAutoFallback,
                };
            } catch (err: unknown) {
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                const errCode = err instanceof ExecutionError ? err.code : "CLOUD_FAILURE";
                telemetry.record({
                    toolId: tool,
                    requestedMode: mode,
                    actualMode: "cloud",
                    category: "cloud_failure",
                    durationMs,
                    success: false,
                    fallbackOccurred: false,
                    errorCode: errCode,
                    featureFlagDisabled: isFlagDisabled,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });

                if (err instanceof ExecutionError && err.code === "CLOUD_UNAVAILABLE") {
                    if (mode === "cloud" && clientSupported) {
                        throw new ExecutionError(
                            "CLOUD_UNAVAILABLE",
                            "Cloud processing is currently unavailable. The backend service is offline or unreachable. Switch to Auto or Device mode to process locally.",
                            err
                        );
                    } else if (!clientSupported) {
                        throw new ExecutionError(
                            "BACKEND_UNAVAILABLE",
                            "This tool requires the PDFNest processing service, which is currently unavailable.",
                            err
                        );
                    }
                }
                throw err;
            }
        }

        // 3. Explicit Device Mode -> Client Executor only; failures are returned to the user.
        if (mode === "device") {
            const safety = ExecutionSafetyGate.evaluate(tool, files, policy, options.params);
            if (!safety.eligible) {
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                telemetry.record({
                    toolId: tool,
                    requestedMode: "device",
                    category: "safety_rejection",
                    durationMs,
                    success: false,
                    fallbackOccurred: false,
                    safetyRejectionReason: safety.reason,
                    errorCode: "SAFETY_REJECTION",
                    featureFlagDisabled: false,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });
                throw new ExecutionError(
                    "SAFETY_REJECTION",
                    safety.reason || "Device processing is unsafe for this document size."
                );
            }

            try {
                const blob = await ClientExecutor.execute(options);
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                telemetry.record({
                    toolId: tool,
                    requestedMode: "device",
                    actualMode: "client",
                    category: "client_success",
                    durationMs,
                    success: true,
                    fallbackOccurred: false,
                    featureFlagDisabled: false,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "client",
                    fallbackOccurred: false,
                };
            } catch (err: unknown) {
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                const errCode = err instanceof ExecutionError ? err.code : "CLIENT_FAILURE";
                telemetry.record({
                    toolId: tool,
                    requestedMode: "device",
                    actualMode: "client",
                    category: "client_failure",
                    durationMs,
                    success: false,
                    fallbackOccurred: false,
                    errorCode: errCode,
                    featureFlagDisabled: false,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });

                if (err instanceof ExecutionError) {
                    throw err;
                }
                throw new ExecutionError(
                    "CLIENT_FAILURE",
                    err instanceof Error ? err.message : "Device processing failed.",
                    err
                );
            }
        }

        // 4. Auto Mode -> Prefer Client if safe, with Cloud Fallback on client execution exception
        const safety = ExecutionSafetyGate.evaluate(tool, files, policy, options.params);

        if (safety.eligible) {
            try {
                const blob = await ClientExecutor.execute(options);
                const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                telemetry.record({
                    toolId: tool,
                    requestedMode: "auto",
                    actualMode: "client",
                    category: "client_success",
                    durationMs,
                    success: true,
                    fallbackOccurred: false,
                    featureFlagDisabled: false,
                    fileSizeMB,
                    fileCount,
                    timestamp: Date.now(),
                });
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "client",
                    fallbackOccurred: false,
                };
            } catch (err: unknown) {
                const clientErrMsg = err instanceof Error ? err.message : String(err);
                const clientErrCode = err instanceof ExecutionError ? err.code : "CLIENT_FAILURE";

                // User input validation & auth errors (invalid PDF header, wrong password) do NOT trigger cloud fallback
                if (
                    err instanceof ExecutionError &&
                    (err.code === "INVALID_INPUT" || err.code === "DECRYPTION_AUTH_FAILED" || err.code === "USER_CANCELLATION")
                ) {
                    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                    telemetry.record({
                        toolId: tool,
                        requestedMode: "auto",
                        actualMode: "client",
                        category: "client_failure",
                        durationMs,
                        success: false,
                        fallbackOccurred: false,
                        errorCode: err.code,
                        featureFlagDisabled: false,
                        fileSizeMB,
                        fileCount,
                        timestamp: Date.now(),
                    });
                    throw err;
                }

                if (!allowFallback || options.signal?.aborted) {
                    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                    telemetry.record({
                        toolId: tool,
                        requestedMode: "auto",
                        actualMode: "client",
                        category: "client_failure",
                        durationMs,
                        success: false,
                        fallbackOccurred: false,
                        errorCode: clientErrCode,
                        featureFlagDisabled: false,
                        fileSizeMB,
                        fileCount,
                        timestamp: Date.now(),
                    });
                    throw err;
                }

                console.warn("[ExecutionManager] Client execution failed in Auto mode. Triggering Cloud fallback:", err);
                try {
                    const blob = await CloudExecutor.execute(options);
                    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                    telemetry.record({
                        toolId: tool,
                        requestedMode: "auto",
                        actualMode: "cloud",
                        category: "fallback_success",
                        durationMs,
                        success: true,
                        fallbackOccurred: true,
                        fallbackReason: clientErrMsg,
                        featureFlagDisabled: false,
                        fileSizeMB,
                        fileCount,
                        timestamp: Date.now(),
                    });
                    notifyHybridFallback(clientErrMsg);
                    return {
                        blob,
                        fileName: outputFileName,
                        executionMode: "cloud",
                        fallbackOccurred: true,
                    };
                } catch (cloudErr: unknown) {
                    const cloudErrCode = getExecutionErrorCode(cloudErr);
                    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
                    telemetry.record({
                        toolId: tool,
                        requestedMode: "auto",
                        actualMode: "cloud",
                        category: "cloud_failure",
                        durationMs,
                        success: false,
                        fallbackOccurred: true,
                        fallbackReason: clientErrMsg,
                        errorCode: cloudErrCode || "CLOUD_FAILURE",
                        featureFlagDisabled: false,
                        fileSizeMB,
                        fileCount,
                        timestamp: Date.now(),
                    });
                    if (cloudErrCode === "USER_CANCELLATION" || options.signal?.aborted) {
                        throw cloudErr;
                    }
                    if (cloudErr instanceof ExecutionError && cloudErr.code === "CLOUD_UNAVAILABLE") {
                        throw new ExecutionError(
                            "CLOUD_UNAVAILABLE",
                            "Local processing could not complete and cloud processing is currently unreachable.",
                            cloudErr
                        );
                    }
                    throw cloudErr;
                }
            }
        }

        // Safety gate rejected local execution -> Route to Cloud
        try {
            const blob = await CloudExecutor.execute(options);
            const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
            telemetry.record({
                toolId: tool,
                requestedMode: "auto",
                actualMode: "cloud",
                category: "direct_cloud_success",
                durationMs,
                success: true,
                fallbackOccurred: true,
                safetyRejectionReason: safety.reason,
                featureFlagDisabled: false,
                fileSizeMB,
                fileCount,
                timestamp: Date.now(),
            });
            notifyHybridFallback(safety.reason);
            return {
                blob,
                fileName: outputFileName,
                executionMode: "cloud",
                fallbackOccurred: true,
            };
        } catch (cloudErr: unknown) {
            const cloudErrCode = getExecutionErrorCode(cloudErr);
            const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
            telemetry.record({
                toolId: tool,
                requestedMode: "auto",
                actualMode: "cloud",
                category: "cloud_failure",
                durationMs,
                success: false,
                fallbackOccurred: false,
                safetyRejectionReason: safety.reason,
                errorCode: cloudErrCode || "CLOUD_FAILURE",
                featureFlagDisabled: false,
                fileSizeMB,
                fileCount,
                timestamp: Date.now(),
            });
            if (cloudErrCode === "USER_CANCELLATION" || options.signal?.aborted) {
                throw cloudErr;
            }
            if (cloudErr instanceof ExecutionError && cloudErr.code === "CLOUD_UNAVAILABLE") {
                throw new ExecutionError(
                    "CLOUD_UNAVAILABLE",
                    "This document is too large for device processing, and cloud processing is currently unreachable.",
                    cloudErr
                );
            }
            throw cloudErr;
        }
    }
}

function getExecutionErrorCode(error: unknown): string | undefined {
    if (error instanceof ExecutionError) return error.code;
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === "string" ? code : undefined;
    }
    return undefined;
}

function getToolPolicy(tool: string): ToolPolicy {
    switch (tool) {
        case "rotate":
        case "rotate_pdf":
        case "split":
        case "delete":
        case "reorder":
        case "crop":
        case "duplicate":
        case "insert_blank":
        case "update_metadata":
        case "compress":
        case "compress_pdf":
        case "compress-pdf":
        case "optimize":
        case "optimize_pdf":
        case "optimize-pdf":
        case "highlight":
        case "highlight_pdf":
        case "highlight-pdf":
        case "underline":
        case "underline_pdf":
        case "underline-pdf":
        case "strikeout":
        case "strikeout_pdf":
        case "strikeout-pdf":
        case "strike_pdf":
        case "strike-pdf":
        case "strikethrough":
        case "strikethrough_pdf":
        case "strikethrough-pdf":
        case "sign":
        case "sign_pdf":
        case "sign-pdf":
        case "repair":
        case "repair_pdf":
        case "repair-pdf":
        case "structure_repair":
        case "code":
        case "code_to_pdf":
        case "code-to-pdf":
        case "markdown":
        case "markdown_to_pdf":
        case "markdown-to-pdf":
        case "md_to_pdf":
        case "md-to-pdf":
            return "CLIENT_PREFERRED";
        case "watermark":
        case "add_text":
        case "add_page_numbers":
        case "images_to_pdf":
        case "images-to-pdf":
        case "img_to_pdf":
        case "jpg_to_pdf":
        case "jpg-to-pdf":
        case "to_pdf":
        case "to-pdf":
        case "lock":
        case "unlock":
        case "pdf_to_images":
        case "pdf_to_text":
            return "HYBRID";
        case "grayscale":
        case "word_to_pdf":
        case "excel_to_pdf":
        case "powerpoint_to_pdf":
        case "pdf_to_word":
        case "pdf_to_excel":
        case "pdf_to_powerpoint":
        case "html_to_pdf":
        case "url_to_pdf":
        case "ocr_extract":
        case "image_to_text":
            return "BACKEND_ONLY";
        case "redact_text":
        case "redact":
        case "redact_pdf":
        case "redact-pdf":
            return "SECURITY_CRITICAL_BACKEND";
        default:
            return "CLIENT_PREFERRED";
    }
}

function buildOutputFileName(tool: string, originalName: string): string {
    const base = originalName.replace(/\.pdf$/i, "");
    switch (tool) {
        case "rotate":
        case "rotate_pdf":
            return `${base}-rotated.pdf`;
        case "split":
        case "split_pdf":
            return `${base}-split.pdf`;
        case "highlight":
        case "highlight_pdf":
        case "highlight-pdf":
            return `${base}-highlighted.pdf`;
        case "underline":
        case "underline_pdf":
        case "underline-pdf":
            return `${base}-underlined.pdf`;
        case "strikeout":
        case "strikeout_pdf":
        case "strikeout-pdf":
        case "strike_pdf":
        case "strike-pdf":
        case "strikethrough":
        case "strikethrough_pdf":
        case "strikethrough-pdf":
            return `${base}-struckout.pdf`;
        case "sign":
        case "sign_pdf":
        case "sign-pdf":
            return `signed_${originalName}`;
        case "repair":
        case "repair_pdf":
        case "repair-pdf":
        case "structure_repair":
            return `repaired_${originalName}`;
        case "code":
        case "code_to_pdf":
        case "code-to-pdf":
        case "markdown":
        case "markdown_to_pdf":
        case "markdown-to-pdf":
        case "md_to_pdf":
        case "md-to-pdf": {
            const rawBase = originalName.substring(0, originalName.lastIndexOf(".")) || originalName;
            return `converted_${rawBase}.pdf`;
        }
        default:
            return `${base}-${tool}.pdf`;
    }
}
