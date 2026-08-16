"use client";

import { degrees, PDFDocument, rgb } from "pdf-lib";
import { ExecutionError } from "../types";

export type MarkupAction = "highlight" | "underline" | "strikeout";

export interface MarkupBox {
    id?: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
}

export interface MarkupExecutionOptions {
    action: MarkupAction;
    boxes: MarkupBox[];
    mode?: "smart" | "manual" | "text" | "ocr" | string;
}

export interface ExtractedWord {
    text: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface LineGroup {
    items: ExtractedWord[];
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/**
 * Dynamically loads pdfjs-dist with standard worker configuration across browser and test environments.
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
 * Converts a hex color string (#RRGGBB or RRGGBB) to a pdf-lib RGB object.
 */
export function hexToRgb(hexColor?: string) {
    const clean = (hexColor || "#FFFF00").trim().replace(/^#/, "");
    if (clean.length !== 6) {
        return rgb(1.0, 1.0, 0.0);
    }
    const r = parseInt(clean.slice(0, 2), 16) / 255.0;
    const g = parseInt(clean.slice(2, 4), 16) / 255.0;
    const b = parseInt(clean.slice(4, 6), 16) / 255.0;
    return rgb(
        isNaN(r) ? 1.0 : Math.max(0.0, Math.min(1.0, r)),
        isNaN(g) ? 1.0 : Math.max(0.0, Math.min(1.0, g)),
        isNaN(b) ? 0.0 : Math.max(0.0, Math.min(1.0, b))
    );
}

/**
 * Groups word bounding boxes into cohesive horizontal lines.
 * Replicates the PyMuPDF line clustering algorithm for exact geometry parity.
 */
export function groupWordsByLine(wordItems: ExtractedWord[]): LineGroup[] {
    if (!wordItems || wordItems.length === 0) return [];

    const heights = wordItems.map((w) => Math.max(1.0, w.y1 - w.y0));
    heights.sort((a, b) => a - b);
    const medHeight = heights[Math.floor(heights.length / 2)] || 10.0;
    const yTol = Math.max(3.0, medHeight * 0.45);
    const maxXGap = 10.0;

    const lines: LineGroup[] = [];
    const sortedWords = [...wordItems].sort((a, b) => {
        const aCenter = (a.y0 + a.y1) / 2.0;
        const bCenter = (b.y0 + b.y1) / 2.0;
        if (Math.abs(aCenter - bCenter) > yTol) {
            return aCenter - bCenter;
        }
        return a.x0 - b.x0;
    });

    for (const item of sortedWords) {
        const itemYCenter = (item.y0 + item.y1) / 2.0;
        let placed = false;

        for (const line of lines) {
            const lineYCenter = (line.y0 + line.y1) / 2.0;
            if (Math.abs(itemYCenter - lineYCenter) <= yTol) {
                const gap = item.x0 - line.x1;
                if (gap >= -1.0 && gap <= maxXGap) {
                    line.items.push(item);
                    line.x0 = Math.min(line.x0, item.x0);
                    line.x1 = Math.max(line.x1, item.x1);
                    line.y0 = Math.min(line.y0, item.y0);
                    line.y1 = Math.max(line.y1, item.y1);
                    placed = true;
                    break;
                }
            }
        }

        if (!placed) {
            lines.push({
                items: [item],
                x0: item.x0,
                x1: item.x1,
                y0: item.y0,
                y1: item.y1,
            });
        }
    }

    return lines;
}

/**
 * Executes Highlight, Underline, or Strikeout client-side using pdfjs-dist and pdf-lib.
 */
export async function executeMarkup(
    file: File,
    options: MarkupExecutionOptions,
    originalPassword?: string
): Promise<Blob> {
    const { action, boxes, mode = "smart" } = options;

    if (!boxes || boxes.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "Please draw at least one annotation box on the document.");
    }

    if (mode === "ocr") {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "OCR text recognition mode requires server-side cloud worker processing."
        );
    }

    const fileBuffer = await file.arrayBuffer();
    const headerBytes = new Uint8Array(fileBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);

    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError("INVALID_INPUT", "Invalid PDF file format. Missing %PDF- header signature.");
    }

    const clonedBuffer = new Uint8Array(fileBuffer.slice(0));

    let pdfDoc: PDFDocument;
    try {
        pdfDoc = await PDFDocument.load(clonedBuffer, { ignoreEncryption: false });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                "Password-protected PDF encountered during markup execution.",
                err
            );
        }
        throw err;
    }

    const pdfjsLib = await loadPdfJs();
    const docParams: Record<string, any> = { data: new Uint8Array(fileBuffer.slice(0)) };
    if (originalPassword) {
        docParams.password = originalPassword;
    }

    const jsDoc = await pdfjsLib.getDocument(docParams).promise;
    const pageCount = pdfDoc.getPageCount();

    for (let p = 1; p <= pageCount; p++) {
        const pageBoxes = boxes.filter((b) => b.page === p && b.width > 0 && b.height > 0);
        if (pageBoxes.length === 0) continue;

        const page = pdfDoc.getPage(p - 1);
        const jsPage = await jsDoc.getPage(p);
        const baseViewport = jsPage.getViewport({ scale: 1.0 });
        const textContent = await jsPage.getTextContent();

        const pageHeight = page.getHeight();
        const pageWidth = page.getWidth();
        const rotationAngle = (page.getRotation().angle % 360 + 360) % 360;

        // Extract native text words on this page
        const pageWords: ExtractedWord[] = [];
        for (const item of textContent.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            const tx = item.transform; // [scaleX, skewY, skewX, scaleY, transX, transY]
            const x0 = tx[4];
            const y0 = baseViewport.height - tx[5] - (item.height || Math.abs(tx[3]) || 10.0);
            const x1 = x0 + item.width;
            const y1 = baseViewport.height - tx[5];

            const subWords = item.str.split(/\s+/).filter(Boolean);
            if (subWords.length <= 1) {
                pageWords.push({ text: item.str.trim(), x0, y0, x1, y1 });
            } else {
                const avgW = (x1 - x0) / subWords.length;
                for (let si = 0; si < subWords.length; si++) {
                    pageWords.push({
                        text: subWords[si],
                        x0: x0 + si * avgW,
                        y0,
                        x1: x0 + (si + 1) * avgW,
                        y1,
                    });
                }
            }
        }

        for (const box of pageBoxes) {
            const selectionRect = {
                x0: box.x,
                y0: box.y,
                x1: box.x + box.width,
                y1: box.y + box.height,
            };

            let targetLines: LineGroup[] = [];

            if (mode === "manual" || pageWords.length === 0) {
                targetLines.push({
                    items: [],
                    x0: selectionRect.x0,
                    y0: selectionRect.y0,
                    x1: selectionRect.x1,
                    y1: selectionRect.y1,
                });
            } else {
                const matchedWords = pageWords.filter(
                    (w) =>
                        w.x0 < selectionRect.x1 &&
                        w.x1 > selectionRect.x0 &&
                        w.y0 < selectionRect.y1 &&
                        w.y1 > selectionRect.y0
                );

                if (matchedWords.length === 0) {
                    targetLines.push({
                        items: [],
                        x0: selectionRect.x0,
                        y0: selectionRect.y0,
                        x1: selectionRect.x1,
                        y1: selectionRect.y1,
                    });
                } else {
                    targetLines = groupWordsByLine(matchedWords);
                }
            }

            const colorRgb = hexToRgb(box.color || (action === "highlight" ? "#FFFF00" : action === "underline" ? "#0000FF" : "#FF0000"));

            for (const line of targetLines) {
                if (action === "highlight") {
                    const padX = Math.max(0.8, (line.x1 - line.x0) * 0.02);
                    const padY = Math.max(0.8, (line.y1 - line.y0) * 0.15);
                    const drawX = Math.max(0, line.x0 - padX);
                    const drawYTop = Math.max(0, line.y0 - padY);
                    const drawW = Math.min(baseViewport.width - drawX, (line.x1 - line.x0) + padX * 2);
                    const drawH = Math.min(baseViewport.height - drawYTop, (line.y1 - line.y0) + padY * 2);

                    // Coordinate transformation based on page rotation
                    let pdfX = drawX;
                    let pdfY = pageHeight - drawYTop - drawH;
                    let rectW = drawW;
                    let rectH = drawH;

                    if (rotationAngle === 90) {
                        pdfX = drawYTop;
                        pdfY = drawX;
                        rectW = drawH;
                        rectH = drawW;
                    } else if (rotationAngle === 180) {
                        pdfX = pageWidth - drawX - drawW;
                        pdfY = drawYTop;
                    } else if (rotationAngle === 270) {
                        pdfX = pageWidth - drawYTop - drawH;
                        pdfY = pageHeight - drawX - drawW;
                        rectW = drawH;
                        rectH = drawW;
                    }

                    page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: rectW,
                        height: rectH,
                        color: colorRgb,
                        opacity: 0.35,
                    });
                } else if (action === "underline") {
                    const lineH = line.y1 - line.y0;
                    const thickness = Math.max(0.8, Math.min(2.5, lineH * 0.12));
                    const underlineYTop = Math.min(baseViewport.height - 1.0, line.y1 + 1.3);

                    let startX = line.x0;
                    let startY = pageHeight - underlineYTop;
                    let endX = line.x1;
                    let endY = pageHeight - underlineYTop;

                    if (rotationAngle === 90) {
                        startX = underlineYTop;
                        startY = line.x0;
                        endX = underlineYTop;
                        endY = line.x1;
                    } else if (rotationAngle === 180) {
                        startX = pageWidth - line.x0;
                        startY = underlineYTop;
                        endX = pageWidth - line.x1;
                        endY = underlineYTop;
                    } else if (rotationAngle === 270) {
                        startX = pageWidth - underlineYTop;
                        startY = pageHeight - line.x0;
                        endX = pageWidth - underlineYTop;
                        endY = pageHeight - line.x1;
                    }

                    page.drawLine({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        thickness,
                        color: colorRgb,
                        opacity: 1.0,
                    });
                } else if (action === "strikeout") {
                    const lineH = line.y1 - line.y0;
                    const thickness = Math.max(0.8, Math.min(2.5, lineH * 0.12));
                    const strikeYTop = line.y0 + lineH * 0.52;

                    let startX = line.x0;
                    let startY = pageHeight - strikeYTop;
                    let endX = line.x1;
                    let endY = pageHeight - strikeYTop;

                    if (rotationAngle === 90) {
                        startX = strikeYTop;
                        startY = line.x0;
                        endX = strikeYTop;
                        endY = line.x1;
                    } else if (rotationAngle === 180) {
                        startX = pageWidth - line.x0;
                        startY = strikeYTop;
                        endX = pageWidth - line.x1;
                        endY = strikeYTop;
                    } else if (rotationAngle === 270) {
                        startX = pageWidth - strikeYTop;
                        startY = pageHeight - line.x0;
                        endX = pageWidth - strikeYTop;
                        endY = pageHeight - line.x1;
                    }

                    page.drawLine({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        thickness,
                        color: colorRgb,
                        opacity: 1.0,
                    });
                }
            }
        }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
