"use client";

import { ExecutionError } from "../types";

export interface PageTextExtractionResult {
    pageNumber: number;
    text: string;
    hasNativeText: boolean;
    requiresOCR: boolean;
}

export interface PdfToTextExecutionResult {
    blob: Blob;
    pageResults: PageTextExtractionResult[];
    totalPages: number;
    scannedPageCount: number;
    hasScannedPages: boolean;
}

/**
 * Loads pdfjs-dist dynamically across both browser and Node.js SSR/test environments.
 */
async function loadPdfJs(): Promise<any> {
    if (typeof window !== "undefined") {
        const pdfjsLib = await import("pdfjs-dist");
        if (!pdfjsLib.GlobalWorkerOptions?.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }
        return pdfjsLib;
    } else {
        // Node.js test / server environment
        return await import("pdfjs-dist/legacy/build/pdf.mjs");
    }
}

/**
 * Executes high-fidelity client-side PDF text layer extraction using pdfjs-dist.
 * Reconstructs text lines using coordinate-aware Y-delta tracking and hasEOL flags,
 * matching PyMuPDF page delimiters: `--- START OF PAGE N ---` / `--- END OF PAGE ---`.
 *
 * Implements Page-Level OCR detection:
 * - In Auto mode: Throws UNSUPPORTED_CLIENT_OP if any page requires OCR (routes to Cloud OCR).
 * - In Device mode: Extracts all available native text locally without contacting the cloud.
 */
export async function executePdfToText(
    file: File,
    params: Record<string, any> = {},
    password?: string,
    mode?: "auto" | "device" | "cloud",
    signal?: AbortSignal,
    onProgress?: (percentage: number) => void
): Promise<Blob> {
    if (!file) {
        throw new ExecutionError("INVALID_INPUT", "No PDF document provided for text extraction.");
    }

    const checkCancelled = () => {
        if (signal?.aborted) {
            throw new ExecutionError("USER_CANCELLATION", "Text extraction was cancelled by the user.");
        }
    };

    checkCancelled();

    const arrayBuffer = await file.arrayBuffer();
    checkCancelled();

    // 1. Validate %PDF- magic header
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError(
            "INVALID_INPUT",
            `File '${file.name}' is not a valid PDF document (missing %PDF- header).`
        );
    }

    const pdfjsLib = await loadPdfJs();
    checkCancelled();

    const effectivePassword = password || (file as any).originalPassword || undefined;

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        password: effectivePassword,
        useSystemFonts: true,
        disableFontFace: false,
    });

    const onAbort = () => {
        try {
            if (loadingTask && typeof loadingTask.destroy === "function") {
                loadingTask.destroy();
            }
        } catch {
            // ignore
        }
    };

    if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
    }

    let pdfDoc: any;
    try {
        pdfDoc = await loadingTask.promise;
    } catch (err: any) {
        if (signal?.aborted) {
            throw new ExecutionError("USER_CANCELLATION", "Text extraction was cancelled by the user.");
        }
        const message = err?.message || String(err);
        if (
            message.toLowerCase().includes("password") ||
            err?.name === "PasswordException" ||
            err?.code === 1 // PDFJS PasswordResponses.NEED_PASSWORD
        ) {
            throw new ExecutionError(
                "DECRYPTION_AUTH_FAILED",
                "Password required or incorrect for encrypted PDF document.",
                err
            );
        }
        throw new ExecutionError(
            "INVALID_INPUT",
            "Failed to parse PDF document for text extraction.",
            err
        );
    } finally {
        if (signal) {
            signal.removeEventListener("abort", onAbort);
        }
    }

    try {
        checkCancelled();
        const totalPages: number = pdfDoc.numPages;
        if (totalPages <= 0) {
            throw new ExecutionError("INVALID_INPUT", "Document contains 0 readable pages.");
        }

        const pageResults: PageTextExtractionResult[] = [];
        const scannedPages: number[] = [];

        for (let i = 1; i <= totalPages; i++) {
            checkCancelled();

            const page = await pdfDoc.getPage(i);
            try {
                checkCancelled();
                let textContent: any;
                try {
                    textContent = await page.getTextContent({
                        includeMarkedContent: false,
                        disableCombineTextItems: false,
                    });
                } catch (err) {
                    if (signal?.aborted) throw err;
                    textContent = { items: [] };
                }

                checkCancelled();

                const items = (textContent.items || []).filter(
                    (item: any): item is { str: string; transform: number[]; hasEOL: boolean; width: number } =>
                        "str" in item && typeof item.str === "string"
                );

                // Group items into lines based on Y-coordinate delta and hasEOL
                const lines: { y: number; x: number; text: string }[] = [];
                let currentLineText = "";
                let currentY: number | null = null;
                let currentX = 0;

                for (const item of items) {
                    checkCancelled();
                    const y = Math.round(item.transform[5] * 10) / 10;
                    const x = Math.round(item.transform[4] * 10) / 10;

                    if (currentY !== null && Math.abs(currentY - y) > 3) {
                        if (currentLineText.trim()) {
                            lines.push({ y: currentY, x: currentX, text: currentLineText.trim() });
                        }
                        currentLineText = item.str;
                        currentY = y;
                        currentX = x;
                    } else {
                        if (currentY === null) {
                            currentY = y;
                            currentX = x;
                            currentLineText = item.str;
                        } else {
                            if (
                                currentLineText &&
                                !currentLineText.endsWith(" ") &&
                                !item.str.startsWith(" ") &&
                                item.str.trim()
                            ) {
                                currentLineText += " ";
                            }
                            currentLineText += item.str;
                        }
                    }

                    if (item.hasEOL) {
                        if (currentLineText.trim()) {
                            lines.push({ y: currentY, x: currentX, text: currentLineText.trim() });
                        }
                        currentLineText = "";
                        currentY = null;
                    }
                }

                if (currentLineText.trim() && currentY !== null) {
                    lines.push({ y: currentY, x: currentX, text: currentLineText.trim() });
                }

                const pageText = lines.map((l) => l.text).join("\n").trim();
                const hasNativeText = pageText.length > 0;
                const requiresOCR = !hasNativeText;

                if (requiresOCR) {
                    scannedPages.push(i);
                    const effectiveMode = mode || params.mode || "auto";
                    if (effectiveMode === "auto") {
                        throw new ExecutionError(
                            "UNSUPPORTED_CLIENT_OP",
                            `Document contains scanned page(s) (Page ${i}) that require Cloud OCR for full text extraction.`
                        );
                    }
                }

                pageResults.push({
                    pageNumber: i,
                    text: pageText,
                    hasNativeText,
                    requiresOCR,
                });

                if (!signal?.aborted && onProgress) {
                    onProgress(Math.round((i / totalPages) * 100));
                }
            } finally {
                if (typeof page.cleanup === "function") {
                    page.cleanup();
                }
            }
        }

        checkCancelled();

        // Page-level OCR detection & execution mode routing:
        // Case 1: In Auto mode (or default), if any page requires OCR, route to Cloud OCR pipeline
        const effectiveMode = mode || params.mode || "auto";
        if (effectiveMode === "auto" && scannedPages.length > 0) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                `Document contains ${scannedPages.length} scanned page(s) (e.g. Page ${scannedPages[0]}) that require Cloud OCR for full text extraction.`
            );
        }

        // Case 2: In Device mode or when all pages contain native text, assemble plaintext output
        let fullOutput = "";
        for (const res of pageResults) {
            checkCancelled();
            if (res.text) {
                fullOutput += `--- START OF PAGE ${res.pageNumber} ---\n${res.text}\n--- END OF PAGE ---\n\n`;
            }
        }

        checkCancelled();

        const outputBlob = new Blob([fullOutput], { type: "text/plain;charset=utf-8" });

        // Attach metadata for Device mode UI awareness
        (outputBlob as any).scannedPages = scannedPages;
        (outputBlob as any).totalPages = totalPages;
        (outputBlob as any).hasScannedPages = scannedPages.length > 0;

        return outputBlob;
    } finally {
        if (pdfDoc && typeof pdfDoc.destroy === "function") {
            try {
                pdfDoc.destroy();
            } catch {
                // ignore
            }
        }
    }
}
