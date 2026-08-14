"use client";

import { ClientExecutor } from "./ClientExecutor";
import { CloudExecutor } from "./CloudExecutor";
import { ExecutionSafetyGate } from "./ExecutionSafetyGate";
import { isClientExecutionEnabled } from "./flags";
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

        const primaryFile = files[0];
        const outputFileName = buildOutputFileName(tool, primaryFile.name);
        const policy: ToolPolicy = getToolPolicy(tool);

        // 1. Check feature flag
        const clientEnabled = isClientExecutionEnabled(tool);

        // 2. Explicit Cloud Mode OR client flag disabled -> Cloud Executor
        if (mode === "cloud" || !clientEnabled) {
            const blob = await CloudExecutor.execute(options);
            return {
                blob,
                fileName: outputFileName,
                executionMode: "cloud",
                fallbackOccurred: false,
            };
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
                    const blob = await CloudExecutor.execute(options);
                    return {
                        blob,
                        fileName: outputFileName,
                        executionMode: "cloud",
                        fallbackOccurred: true,
                    };
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
                // User input validation errors (invalid PDF header) do NOT trigger cloud fallback
                if (err instanceof ExecutionError && err.code === "INVALID_INPUT") {
                    throw err;
                }

                if (!allowFallback) {
                    throw err;
                }

                console.warn("[ExecutionManager] Client execution failed in Auto mode. Triggering Cloud fallback:", err);
                const blob = await CloudExecutor.execute(options);
                return {
                    blob,
                    fileName: outputFileName,
                    executionMode: "cloud",
                    fallbackOccurred: true,
                };
            }
        }

        // Safety gate rejected local execution -> Route to Cloud
        const blob = await CloudExecutor.execute(options);
        return {
            blob,
            fileName: outputFileName,
            executionMode: "cloud",
            fallbackOccurred: false,
        };
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
            return "CLIENT_PREFERRED";
        case "watermark":
        case "add_text":
        case "add_page_numbers":
        case "lock":
        case "unlock":
        case "repair":
            return "HYBRID";
        case "compress":
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
