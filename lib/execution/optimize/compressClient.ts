"use client";

import { ExecutionError } from "../types";
import { executePdfcpuWasmOptimize } from "../pdfcpu/pdfcpuClient";

export interface CompressParams {
    level?: "low" | "medium" | "high";
    [key: string]: any;
}

export interface DocumentComposition {
    fileSize: number;
    pageCount: number;
    imageCount: number;
    estimatedImageBytes: number;
    imageByteRatio: number;
    isRasterDominated: boolean;
}

/**
 * Rapidly inspects PDF structure to determine image byte ratio (rho_img)
 * and whether the document is raster-dominated.
 */
async function analyzeComposition(pdfBytes: ArrayBuffer): Promise<DocumentComposition> {
    const fileSize = pdfBytes.byteLength;
    const uint8 = new Uint8Array(pdfBytes);
    
    let imageCount = 0;
    let estimatedImageBytes = 0;
    let pageCount = 0;

    // Scan for /Type /Page and /Subtype /Image or /DCTDecode /FlateDecode image objects
    // Using string matching across stream dictionaries
    const textDecoder = new TextDecoder("latin1");
    const chunkSize = 65536;
    let buffer = "";

    for (let offset = 0; offset < uint8.length; offset += chunkSize - 1024) {
        const slice = uint8.subarray(offset, Math.min(offset + chunkSize, uint8.length));
        buffer = textDecoder.decode(slice);

        // Count pages
        const pageMatches = buffer.match(/\/Type\s*\/Page\b/g);
        if (pageMatches) {
            pageCount += pageMatches.length;
        }

        // Search for image XObjects with Length
        const imgRegex = /\/Subtype\s*\/Image[\s\S]*?\/Length\s+(\d+)/g;
        let match;
        while ((match = imgRegex.exec(buffer)) !== null) {
            imageCount++;
            const len = parseInt(match[1], 10);
            if (!isNaN(len) && len > 0 && len < fileSize) {
                estimatedImageBytes += len;
            }
        }
    }

    pageCount = Math.max(pageCount, 1);
    const imageByteRatio = Math.min(estimatedImageBytes / Math.max(fileSize, 1), 1.0);
    const isRasterDominated = imageByteRatio >= 0.35 || (imageCount >= pageCount && fileSize > 500 * 1024);

    return {
        fileSize,
        pageCount,
        imageCount,
        estimatedImageBytes,
        imageByteRatio,
        isRasterDominated,
    };
}

/**
 * Client execution engine for Compress PDF.
 * Implements the unified 3-tier compression contract (LOW, MEDIUM, HIGH)
 * with composition-based Cloud fallback routing and Zero Size Expansion protection.
 */
export async function executeCompressPdf(
    file: File,
    params: CompressParams = {},
    password?: string,
    mode?: "auto" | "device" | "cloud",
    signal?: AbortSignal,
    onProgress?: (percentage: number) => void
): Promise<Blob> {
    if (!file) {
        throw new ExecutionError("INVALID_INPUT", "No PDF document provided for compression.");
    }

    const checkCancelled = () => {
        if (signal?.aborted) {
            throw new ExecutionError("USER_CANCELLATION", "Compression was cancelled by the user.");
        }
    };

    checkCancelled();

    // 1. Validate %PDF- magic header
    const arrayBuffer = await file.arrayBuffer();
    checkCancelled();

    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "The selected file is not a valid PDF document (missing %PDF- header)."
        );
    }

    const effectiveLevel = (params.level || "medium").toLowerCase() as "low" | "medium" | "high";
    const effectiveMode = mode || params.mode || "auto";

    if (onProgress) onProgress(10);
    checkCancelled();

    // 2. Analyze document composition for raster vs structural dominance
    const composition = await analyzeComposition(arrayBuffer);
    checkCancelled();
    if (onProgress) onProgress(25);

    // 3. Evaluate Execution Level & Mode Routing
    // Case HIGH in Auto/Cloud Mode -> Route to Cloud Ghostscript 72 DPI engine
    if (effectiveLevel === "high" && effectiveMode === "auto") {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "High compression requires server-side 72 DPI bicubic raster downsampling."
        );
    }

    // Case MEDIUM in Auto Mode on Raster-Dominated Document -> Check if local structural is sufficient
    let localOptimizedBlob: Blob;
    try {
        if (onProgress) onProgress(40);
        checkCancelled();
        localOptimizedBlob = await executePdfcpuWasmOptimize(file, password);
        checkCancelled();
        if (onProgress) onProgress(80);
    } catch (err: any) {
        checkCancelled();
        throw err;
    }

    const originalSize = file.size;
    const optimizedSize = localOptimizedBlob.size;
    const reductionPercent = ((originalSize - optimizedSize) / originalSize) * 100;

    // In Auto mode with MEDIUM level on a raster-dominated document:
    // If local structural optimization yields minimal reduction (< 10%), fall back to Cloud 150 DPI Ghostscript
    if (
        effectiveLevel === "medium" &&
        effectiveMode === "auto" &&
        composition.isRasterDominated &&
        reductionPercent < 10.0
    ) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Document is raster-dominated and requires server-side 150 DPI image downsampling for balanced compression."
        );
    }

    // 4. Zero Size Expansion Guarantee
    // If the optimized file is not strictly smaller than the original, return original bytes!
    let finalBlob: Blob;
    let zeroExpansionApplied = false;

    if (optimizedSize >= originalSize) {
        finalBlob = new Blob([arrayBuffer], { type: "application/pdf" });
        zeroExpansionApplied = true;
    } else {
        finalBlob = localOptimizedBlob;
    }

    if (onProgress) onProgress(100);

    // Attach metadata for workspace UI transparency
    const finalSize = zeroExpansionApplied ? originalSize : optimizedSize;
    const finalReduction = zeroExpansionApplied
        ? 0
        : Math.round(((originalSize - finalSize) / originalSize) * 1000) / 10;

    (finalBlob as any).originalSize = originalSize;
    (finalBlob as any).compressedSize = finalSize;
    (finalBlob as any).reductionPercent = finalReduction;
    (finalBlob as any).bytesSaved = Math.max(0, originalSize - finalSize);
    (finalBlob as any).zeroExpansionApplied = zeroExpansionApplied;
    (finalBlob as any).compressionLevel = effectiveLevel;
    (finalBlob as any).hasRasterLimitation =
        effectiveLevel === "high" && effectiveMode === "device" && composition.isRasterDominated;

    return finalBlob;
}
