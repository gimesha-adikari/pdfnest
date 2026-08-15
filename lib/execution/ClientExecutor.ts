"use client";

import { degrees, PDFDocument, PDFName } from "pdf-lib";
import { ExecutionError, ExecutionOptions } from "./types";
import {
    buildPageNumbersDescription,
    executePdfcpuWasmAddText,
    executePdfcpuWasmWatermark,
} from "./pdfcpu/pdfcpuClient";
import { executeImagesToPdf } from "./images/imageToPdfClient";
import { executePdfToImages } from "./images/pdfToImageClient";

export class ClientExecutor {
    static isSupported(tool: string): boolean {
        const normalized = normalizeTool(tool);
        return [
            "rotate",
            "split",
            "delete",
            "reorder",
            "insert_blank",
            "duplicate",
            "update_metadata",
            "merge",
            "watermark",
            "add_page_numbers",
            "add_text",
            "images_to_pdf",
            "crop",
            "pdf_to_images",
        ].includes(normalized);
    }

    static async execute(options: ExecutionOptions): Promise<Blob> {
        const { tool, files } = options;
        const params = options.params || {};

        if (!files || files.length === 0) {
            throw new ExecutionError("INVALID_INPUT", "No files provided for client execution.");
        }

        const normalizedTool = normalizeTool(tool);

        if (normalizedTool === "merge") {
            return await executeMerge(files, options);
        }

        if (normalizedTool === "images_to_pdf") {
            return await executeImagesToPdf(files, params);
        }

        const file = files[0];
        const originalPassword = options.password || (file as any).originalPassword;

        if (normalizedTool === "pdf_to_images") {
            return await executePdfToImages(file, params, originalPassword);
        }

        if (normalizedTool === "watermark") {
            return await executePdfcpuWasmWatermark(file, params, originalPassword);
        }

        if (normalizedTool === "add_page_numbers") {
            return await executeAddPageNumbers(file, params, originalPassword);
        }

        if (normalizedTool === "add_text") {
            return await executeAddText(file, params, originalPassword);
        }

        // Password-protected files route to Cloud to preserve existing relock pipeline
        if (originalPassword) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                "Password-protected files require server-side encryption relocking pipeline."
            );
        }

        try {
            // 1. Perform 5-byte %PDF- header check before WASM parsing
            const fileBuffer = await file.arrayBuffer();
            const headerBytes = new Uint8Array(fileBuffer.slice(0, 5));
            const headerString = String.fromCharCode(...headerBytes);

            if (!headerString.startsWith("%PDF-")) {
                throw new ExecutionError(
                    "INVALID_INPUT",
                    "Invalid PDF file format. Missing %PDF- header signature."
                );
            }

            // 2. Load source PDF document
            let pdfDoc: PDFDocument;
            try {
                pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: false });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                if (message.toLowerCase().includes("password") || message.toLowerCase().includes("encrypt")) {
                    throw new ExecutionError(
                        "UNSUPPORTED_CLIENT_OP",
                        "Password-protected file encountered during client execution.",
                        err
                    );
                }
                throw err;
            }

            // 3. Dispatch tool execution logic
            let outputDoc: PDFDocument = pdfDoc;

            switch (normalizedTool) {
                case "rotate":
                    outputDoc = await executeRotate(pdfDoc, params);
                    break;
                case "split":
                    outputDoc = await executeSplit(pdfDoc, params);
                    break;
                case "delete":
                    outputDoc = await executeDelete(pdfDoc, params);
                    break;
                case "reorder":
                    outputDoc = await executeReorder(pdfDoc, params);
                    break;
                case "insert_blank":
                    outputDoc = await executeInsertBlank(pdfDoc, params);
                    break;
                case "duplicate":
                    outputDoc = await executeDuplicate(pdfDoc, params);
                    break;
                case "update_metadata":
                    outputDoc = await executeUpdateMetadata(pdfDoc, params);
                    break;
                case "crop":
                    outputDoc = await executeCrop(pdfDoc, params);
                    break;
                default:
                    throw new ExecutionError(
                        "UNSUPPORTED_CLIENT_OP",
                        `Tool '${tool}' is not currently enabled for client-side execution.`
                    );
            }

            // 4. Save PDF bytes exactly once
            const pdfBytes = await outputDoc.save();
            return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        } catch (err: unknown) {
            if (err instanceof ExecutionError) {
                throw err;
            }
            const msg = err instanceof Error ? err.message : "Client-side processing failed.";
            throw new ExecutionError("CLIENT_FAILURE", msg, err);
        }
    }
}

function normalizeTool(tool: string): string {
    switch (tool) {
        case "rotate_pdf":
            return "rotate";
        case "split_pdf":
            return "split";
        case "delete_pages":
            return "delete";
        case "reorder_pages":
            return "reorder";
        case "insert_blank":
            return "insert_blank";
        case "update_metadata":
            return "update_metadata";
        case "watermark_pdf":
            return "watermark";
        case "add_page_numbers":
        case "add-page-numbers":
        case "page_numbers":
            return "add_page_numbers";
        case "add_text":
        case "add-text":
        case "addtext":
            return "add_text";
        case "images_to_pdf":
        case "images-to-pdf":
        case "img_to_pdf":
        case "jpg_to_pdf":
        case "jpg-to-pdf":
        case "to_pdf":
        case "to-pdf":
            return "images_to_pdf";
        case "crop":
        case "crop_pdf":
        case "crop-pdf":
            return "crop";
        case "pdf_to_images":
        case "pdf-to-images":
        case "pdf_to_image":
        case "pdf-to-image":
        case "pdf_to_img":
        case "pdf-to-img":
        case "pdf_to_jpg":
        case "pdf-to-jpg":
        case "pdf_to_png":
        case "pdf-to-png":
            return "pdf_to_images";
        default:
            return tool;
    }
}

export async function executeCrop(
    pdfDoc: PDFDocument,
    params: Record<string, any>
): Promise<PDFDocument> {
    const boxParam = params.box;
    if (!boxParam && params.xmin === undefined) {
        throw new ExecutionError("INVALID_INPUT", "Target crop box boundary dimension map is required.");
    }

    let xmin = 0;
    let ymin = 0;
    let xmax = 0;
    let ymax = 0;

    if (typeof boxParam === "string") {
        // String format "[xmin ymin xmax ymax]" or "xmin ymin xmax ymax" (e.g. "[50 100 450 700]")
        const match = boxParam.match(/\[?\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]?/);
        if (!match) {
            throw new ExecutionError("INVALID_INPUT", "Invalid crop box parameter format. Expected [xmin ymin xmax ymax].");
        }
        xmin = parseFloat(match[1]);
        ymin = parseFloat(match[2]);
        xmax = parseFloat(match[3]);
        ymax = parseFloat(match[4]);
    } else if (Array.isArray(boxParam) && boxParam.length === 4) {
        xmin = Number(boxParam[0]);
        ymin = Number(boxParam[1]);
        xmax = Number(boxParam[2]);
        ymax = Number(boxParam[3]);
    } else if (
        params.xmin !== undefined &&
        params.ymin !== undefined &&
        params.xmax !== undefined &&
        params.ymax !== undefined
    ) {
        xmin = Number(params.xmin);
        ymin = Number(params.ymin);
        xmax = Number(params.xmax);
        ymax = Number(params.ymax);
    } else {
        throw new ExecutionError("INVALID_INPUT", "Invalid crop box parameters.");
    }

    const width = xmax - xmin;
    const height = ymax - ymin;

    if (width <= 0 || height <= 0) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "Invalid crop box dimensions. Width and height must be positive numbers."
        );
    }

    const totalPages = pdfDoc.getPageCount();
    if (totalPages === 0) {
        throw new ExecutionError("INVALID_INPUT", "Document contains 0 pages.");
    }

    const targetPageIndices = new Set<number>();
    const pagesParam = params.pages;

    if (!pagesParam || (Array.isArray(pagesParam) && pagesParam.length === 0)) {
        for (let i = 0; i < totalPages; i++) {
            targetPageIndices.add(i);
        }
    } else {
        const rawTokens = Array.isArray(pagesParam)
            ? pagesParam
            : String(pagesParam).split(",").map((p) => p.trim()).filter(Boolean);

        const pageTokens = rawTokens
            .flatMap((t) => String(t).split(","))
            .map((p) => p.trim())
            .filter(Boolean);

        for (const token of pageTokens) {
            const str = String(token).trim();
            if (str.includes("-")) {
                const [startStr, endStr] = str.split("-");
                const start = parseInt(startStr, 10);
                const end = parseInt(endStr, 10);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
                        if (p >= 1 && p <= totalPages) {
                            targetPageIndices.add(p - 1);
                        }
                    }
                }
            } else {
                const p = parseInt(str, 10);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                    targetPageIndices.add(p - 1);
                }
            }
        }
    }

    if (targetPageIndices.size === 0) {
        for (let i = 0; i < totalPages; i++) {
            targetPageIndices.add(i);
        }
    }

    const pages = pdfDoc.getPages();
    for (const idx of targetPageIndices) {
        if (idx >= 0 && idx < pages.length) {
            const page = pages[idx];
            page.setCropBox(xmin, ymin, width, height);
        }
    }

    return pdfDoc;
}

async function executeAddPageNumbers(
    file: File,
    params: Record<string, any>,
    originalPassword?: string
): Promise<Blob> {
    const description = buildPageNumbersDescription(params);
    const pageNumberParams = {
        ...params,
        watermarkType: "text",
        text: "%p",
        description,
    };
    return await executePdfcpuWasmWatermark(file, pageNumberParams, originalPassword);
}

async function executeAddText(
    file: File,
    params: Record<string, any>,
    originalPassword?: string
): Promise<Blob> {
    const rawElements = params.elements;
    let elements = [];
    if (typeof rawElements === "string") {
        try {
            elements = JSON.parse(rawElements);
        } catch {
            elements = [];
        }
    } else if (Array.isArray(rawElements)) {
        elements = rawElements;
    }
    return await executePdfcpuWasmAddText(file, elements, originalPassword);
}

// --- TOOL ENGINES ---

async function executeRotate(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const rotations: Record<string, number> = params.rotations || {};
    const pages = pdfDoc.getPages();

    Object.entries(rotations).forEach(([pageStr, addedAngle]) => {
        const pageNum = parseInt(pageStr, 10);
        if (pageNum >= 1 && pageNum <= pages.length && addedAngle > 0) {
            const page = pages[pageNum - 1];
            const existingAngle = page.getRotation().angle;
            const finalAngle = (existingAngle + addedAngle) % 360;
            page.setRotation(degrees(finalAngle));
        }
    });

    return pdfDoc;
}

function hasComplexCatalogStructures(pdfDoc: PDFDocument): boolean {
    const catalog = pdfDoc.catalog;
    return (
        catalog.has(PDFName.of("AcroForm")) ||
        catalog.has(PDFName.of("Outlines")) ||
        catalog.has(PDFName.of("Names")) ||
        catalog.has(PDFName.of("PageLabels")) ||
        catalog.has(PDFName.of("Dests")) ||
        catalog.has(PDFName.of("StructTreeRoot")) ||
        catalog.has(PDFName.of("OCProperties"))
    );
}

async function copyPagesToFreshDoc(
    srcDoc: PDFDocument,
    pageIndices: number[]
): Promise<PDFDocument> {
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    if (srcDoc.getTitle()) newDoc.setTitle(srcDoc.getTitle()!);
    if (srcDoc.getAuthor()) newDoc.setAuthor(srcDoc.getAuthor()!);
    if (srcDoc.getSubject()) newDoc.setSubject(srcDoc.getSubject()!);
    if (srcDoc.getKeywords()) {
        const kw = srcDoc.getKeywords();
        if (Array.isArray(kw)) newDoc.setKeywords(kw);
        else if (typeof kw === "string") newDoc.setKeywords(kw.split(",").map((s) => s.trim()));
    }
    if (srcDoc.getCreator()) newDoc.setCreator(srcDoc.getCreator()!);
    if (srcDoc.getProducer()) newDoc.setProducer(srcDoc.getProducer()!);

    return newDoc;
}

async function executeSplit(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const pagesStr = String(params.pages || "").trim();
    if (!pagesStr) {
        throw new ExecutionError("INVALID_INPUT", "Page selection parameters are required for extraction.");
    }

    const totalPages = pdfDoc.getPageCount();
    const pageIndices = parsePageRangeString(pagesStr, totalPages);

    if (pageIndices.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "No valid pages selected for extraction.");
    }

    if (hasComplexCatalogStructures(pdfDoc)) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Document contains complex catalog structures (bookmarks, forms, attachments) requiring server-side pdfcpu engine."
        );
    }

    return await copyPagesToFreshDoc(pdfDoc, pageIndices);
}

async function executeDelete(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const pagesStr = String(params.pages || "").trim();
    if (!pagesStr) {
        throw new ExecutionError("INVALID_INPUT", "Page parameters are required for deletion.");
    }

    const totalPages = pdfDoc.getPageCount();
    const pageIndices = parsePageRangeString(pagesStr, totalPages);

    const uniqueDescending = Array.from(new Set(pageIndices)).sort((a, b) => b - a);

    if (uniqueDescending.length >= totalPages) {
        throw new ExecutionError("INVALID_INPUT", "Cannot remove every single page from the document.");
    }

    if (hasComplexCatalogStructures(pdfDoc)) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Document contains complex catalog structures (bookmarks, forms, attachments) requiring server-side pdfcpu engine."
        );
    }

    const deleteSet = new Set(uniqueDescending);
    const keepIndices = Array.from({ length: totalPages }, (_, i) => i).filter((i) => !deleteSet.has(i));

    return await copyPagesToFreshDoc(pdfDoc, keepIndices);
}

async function executeReorder(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const orderRaw = params.sequence || params.order || params.pages;
    const totalPages = pdfDoc.getPageCount();
    let pageIndices: number[] = [];

    if (Array.isArray(orderRaw)) {
        pageIndices = orderRaw.map((p) => Number(p) - 1).filter((idx) => idx >= 0 && idx < totalPages);
    } else if (typeof orderRaw === "string") {
        pageIndices = parsePageRangeString(orderRaw, totalPages);
    }

    if (pageIndices.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "Invalid page ordering parameters.");
    }

    if (hasComplexCatalogStructures(pdfDoc)) {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Document contains complex catalog structures (bookmarks, forms, attachments) requiring server-side pdfcpu engine."
        );
    }

    return await copyPagesToFreshDoc(pdfDoc, pageIndices);
}

async function executeInsertBlank(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const totalPages = pdfDoc.getPageCount();
    const pageNum = parseInt(String(params.page || params.index || "1"), 10);
    
    // 0-based insertion index (clamped between 0 and totalPages)
    const targetIdx = Math.max(0, Math.min(totalPages, pageNum - 1));

    // Determine dimensions from adjacent page (or default A4)
    const refPage = pdfDoc.getPages()[Math.min(targetIdx, totalPages - 1)];
    const width = refPage ? refPage.getWidth() : 595.28;
    const height = refPage ? refPage.getHeight() : 841.89;

    pdfDoc.insertPage(targetIdx, [width, height]);
    return pdfDoc;
}

async function executeDuplicate(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const totalPages = pdfDoc.getPageCount();
    const pageNum = parseInt(String(params.page || params.index || "1"), 10);
    const targetIdx = Math.max(0, Math.min(totalPages - 1, pageNum - 1));

    const [clonedPage] = await pdfDoc.copyPages(pdfDoc, [targetIdx]);
    pdfDoc.insertPage(targetIdx + 1, clonedPage);

    return pdfDoc;
}

async function executeUpdateMetadata(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const meta = params.metadata || params;

    if (meta.title !== undefined) pdfDoc.setTitle(String(meta.title));
    if (meta.author !== undefined) pdfDoc.setAuthor(String(meta.author));
    if (meta.subject !== undefined) pdfDoc.setSubject(String(meta.subject));
    if (meta.keywords !== undefined) {
        const kwArray = Array.isArray(meta.keywords)
            ? meta.keywords
            : String(meta.keywords).split(",").map((k) => k.trim());
        pdfDoc.setKeywords(kwArray);
    }
    if (meta.creator !== undefined) pdfDoc.setCreator(String(meta.creator));
    if (meta.producer !== undefined) pdfDoc.setProducer(String(meta.producer));

    return pdfDoc;
}

// Helper: Parses CSV range string like "1-3, 5, 8-10" into zero-based page indices
function parsePageRangeString(rangeStr: string, maxPages: number): number[] {
    const indices: number[] = [];
    const parts = rangeStr.split(",");

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        if (trimmed.includes("-")) {
            const [startStr, endStr] = trimmed.split("-");
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end)) {
                const min = Math.max(1, Math.min(start, end));
                const max = Math.min(maxPages, Math.max(start, end));
                for (let i = min; i <= max; i++) {
                    indices.push(i - 1);
                }
            }
        } else {
            const pageNum = parseInt(trimmed, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
                indices.push(pageNum - 1);
            }
        }
    }

    return indices;
}

async function executeMerge(files: File[], options: ExecutionOptions): Promise<Blob> {
    if (files.length < 2) {
        throw new ExecutionError("INVALID_INPUT", "At least two files are required for merging.");
    }

    const mergedDoc = await PDFDocument.create();
    let isFirst = true;

    for (const file of files) {
        const password = options.password || (file as any).originalPassword;
        if (password) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                `Password-protected file '${file.name}' requires server-side encryption pipeline.`
            );
        }

        const fileBuffer = await file.arrayBuffer();
        const headerBytes = new Uint8Array(fileBuffer.slice(0, 5));
        const headerString = String.fromCharCode(...headerBytes);
        if (!headerString.startsWith("%PDF-")) {
            throw new ExecutionError(
                "INVALID_INPUT",
                `File '${file.name}' is not a valid PDF document (missing %PDF- header).`
            );
        }

        let srcDoc: PDFDocument;
        try {
            srcDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: false });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.toLowerCase().includes("password") || message.toLowerCase().includes("encrypt")) {
                throw new ExecutionError(
                    "UNSUPPORTED_CLIENT_OP",
                    `Password-protected file '${file.name}' encountered during merge.`,
                    err
                );
            }
            throw err;
        }

        // Structural check: If file contains AcroForms, Outlines/Bookmarks, or EmbeddedFiles, route to Cloud for full pdfcpu merge
        if (
            srcDoc.catalog.has(PDFName.of("AcroForm")) ||
            srcDoc.catalog.has(PDFName.of("Outlines")) ||
            srcDoc.catalog.has(PDFName.of("EmbeddedFiles"))
        ) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                `File '${file.name}' contains complex catalog structures requiring server-side pdfcpu merge.`
            );
        }

        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((page) => mergedDoc.addPage(page));

        if (isFirst) {
            if (srcDoc.getTitle()) mergedDoc.setTitle(srcDoc.getTitle()!);
            if (srcDoc.getAuthor()) mergedDoc.setAuthor(srcDoc.getAuthor()!);
            if (srcDoc.getSubject()) mergedDoc.setSubject(srcDoc.getSubject()!);
            if (srcDoc.getKeywords()) mergedDoc.setKeywords(srcDoc.getKeywords()! as any);
            isFirst = false;
        }
    }

    const pdfBytes = await mergedDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
