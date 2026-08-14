"use client";

import { degrees, PDFDocument } from "pdf-lib";
import { ExecutionError, ExecutionOptions } from "./types";

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
        ].includes(normalized);
    }

    static async execute(options: ExecutionOptions): Promise<Blob> {
        const { tool, files, params } = options;

        if (!files || files.length === 0) {
            throw new ExecutionError("INVALID_INPUT", "No files provided for client execution.");
        }

        const file = files[0];
        const originalPassword = options.password || (file as any).originalPassword;

        // Password-protected files route to Cloud to preserve existing relock pipeline
        if (originalPassword) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                "Password-protected files require server-side encryption relocking pipeline."
            );
        }

        const normalizedTool = normalizeTool(tool);

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
        default:
            return tool;
    }
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

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    // Copy basic metadata
    if (pdfDoc.getTitle()) newDoc.setTitle(pdfDoc.getTitle()!);
    if (pdfDoc.getAuthor()) newDoc.setAuthor(pdfDoc.getAuthor()!);
    if (pdfDoc.getSubject()) newDoc.setSubject(pdfDoc.getSubject()!);

    return newDoc;
}

async function executeDelete(pdfDoc: PDFDocument, params: Record<string, any>): Promise<PDFDocument> {
    const pagesStr = String(params.pages || "").trim();
    if (!pagesStr) {
        throw new ExecutionError("INVALID_INPUT", "Page parameters are required for deletion.");
    }

    const totalPages = pdfDoc.getPageCount();
    const pageIndices = parsePageRangeString(pagesStr, totalPages);

    // Remove duplicates and sort descending to avoid index shifting
    const uniqueDescending = Array.from(new Set(pageIndices)).sort((a, b) => b - a);

    if (uniqueDescending.length >= totalPages) {
        throw new ExecutionError("INVALID_INPUT", "Cannot remove every single page from the document.");
    }

    uniqueDescending.forEach((idx) => {
        pdfDoc.removePage(idx);
    });

    return pdfDoc;
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

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => newDoc.addPage(page));

    if (pdfDoc.getTitle()) newDoc.setTitle(pdfDoc.getTitle()!);
    if (pdfDoc.getAuthor()) newDoc.setAuthor(pdfDoc.getAuthor()!);

    return newDoc;
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
