"use client";

import { ClientExecutor } from "./ClientExecutor";
import { CloudExecutor } from "./CloudExecutor";
import { ExecutionSafetyGate } from "./ExecutionSafetyGate";
import {
    ExecutionError,
    ExecutionOptions,
    ExecutionResult,
    ToolPolicy,
} from "./types";

export class ExecutionManager {
    static async run(options: ExecutionOptions): Promise<ExecutionResult> {
        const { tool, files, mode, allowFallback = true } = options;

        if (!files || files.length === 0) {
            throw new ExecutionError("INVALID_INPUT", "No files provided for execution.");
        }

        if (options.signal?.aborted) {
            throw new ExecutionError("USER_CANCELLATION", "Execution was cancelled by the user.");
        }

        const primaryFile = files[0];
        const outputFileName = buildOutputFileName(tool, primaryFile.name);
        const policy: ToolPolicy = getToolPolicy(tool);

        // 1. Determine client-side implementation support from code (not environment flags)
        const clientSupported = ClientExecutor.isSupported(tool);

        // 2. Explicit Cloud Mode OR tool not supported on client -> Cloud Executor
        if (mode === "cloud" || !clientSupported) {
            try {
                const blob = await CloudExecutor.execute(options);
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "cloud",
                    fallbackOccurred: false,
                };
            } catch (err: unknown) {
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
                throw err;
            }
        }

        // 3. Explicit Device Mode -> Client Executor (Option B fallback to cloud if file requires server relocking)
        if (mode === "device") {
            const safety = ExecutionSafetyGate.evaluate(tool, files, policy);
            if (!safety.eligible) {
                throw new ExecutionError(
                    "SAFETY_REJECTION",
                    safety.reason || "Device processing is unsafe for this document size."
                );
            }

            try {
                const blob = await ClientExecutor.execute(options);
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "client",
                    fallbackOccurred: false,
                };
            } catch (err: unknown) {
                // If password protected file requires cloud relocking pipeline, fallback to cloud
                if (err instanceof ExecutionError && err.code === "UNSUPPORTED_CLIENT_OP") {
                    console.info("[ExecutionManager] Password-protected file detected in Device mode. Routing to Cloud relock pipeline.");
                    try {
                        const blob = await CloudExecutor.execute(options);
                        return {
                            blob,
                            fileName: outputFileName,
                            executionMode: "cloud",
                            fallbackOccurred: true,
                        };
                    } catch (cloudErr: any) {
                        if (cloudErr?.code === "USER_CANCELLATION" || options.signal?.aborted) {
                            throw cloudErr;
                        }
                        throw new ExecutionError(
                            "CLOUD_UNAVAILABLE",
                            "This encrypted document requires server-side processing, but the backend service is currently unreachable.",
                            cloudErr
                        );
                    }
                }

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
        const safety = ExecutionSafetyGate.evaluate(tool, files, policy);

        if (safety.eligible) {
            try {
                const blob = await ClientExecutor.execute(options);
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "client",
                    fallbackOccurred: false,
                };
            } catch (err: unknown) {
                // User input validation & auth errors (invalid PDF header, wrong password) do NOT trigger cloud fallback
                if (
                    err instanceof ExecutionError &&
                    (err.code === "INVALID_INPUT" || err.code === "DECRYPTION_AUTH_FAILED" || err.code === "USER_CANCELLATION")
                ) {
                    throw err;
                }

                if (!allowFallback || options.signal?.aborted) {
                    throw err;
                }

                console.warn("[ExecutionManager] Client execution failed in Auto mode. Triggering Cloud fallback:", err);
                try {
                    const blob = await CloudExecutor.execute(options);
                    return {
                        blob,
                        fileName: outputFileName,
                        executionMode: "cloud",
                        fallbackOccurred: true,
                    };
                } catch (cloudErr: any) {
                    if (cloudErr?.code === "USER_CANCELLATION" || options.signal?.aborted) {
                        throw cloudErr;
                    }
                    throw new ExecutionError(
                        "CLOUD_UNAVAILABLE",
                        "Local processing could not complete and cloud processing is currently unreachable.",
                        cloudErr
                    );
                }
            }
        }

        // Safety gate rejected local execution -> Route to Cloud
        try {
            const blob = await CloudExecutor.execute(options);
            return {
                blob,
                fileName: outputFileName,
                executionMode: "cloud",
                fallbackOccurred: false,
            };
        } catch (cloudErr: any) {
            if (cloudErr?.code === "USER_CANCELLATION" || options.signal?.aborted) {
                throw cloudErr;
            }
            throw new ExecutionError(
                "CLOUD_UNAVAILABLE",
                "This document is too large for device processing, and cloud processing is currently unreachable.",
                cloudErr
            );
        }
    }
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
        case "repair":
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
        case "sign":
        case "redact_text":
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
        default:
            return `${base}-${tool}.pdf`;
    }
}
