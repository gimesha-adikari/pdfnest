"use client";

import { PDFDocument, PDFImage, rgb } from "pdf-lib";
import { ExecutionError } from "../types";

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

// Scale ratio from normalized 350x495 custom canvas to PDF points
// 210mm / 350 units = 0.6 mm/unit; 0.6 * (72 / 25.4) = 1.7007874 pt/unit
export const CUSTOM_SCALE_RATIO_PT = (210.0 / 350.0) * (72.0 / 25.4);

export interface CanvasLayoutItem {
    id: string;
    fileIndex: number;
    name?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    borderWidth?: number;
    borderColor?: string;
    zIndex?: number;
    pageIndex: number;
}

export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "bmp" | "svg" | "unknown";

export function detectImageFormat(bytes: Uint8Array, fileName = "", mimeType = ""): ImageFormat {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "jpeg";
    }
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "png";
    }
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return "webp";
    }
    if (
        bytes.length >= 6 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x37 || bytes[4] === 0x39) &&
        bytes[5] === 0x61
    ) {
        return "gif";
    }
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
        return "bmp";
    }

    const lowerName = fileName.toLowerCase();
    const lowerMime = mimeType.toLowerCase();

    if (lowerMime === "image/svg+xml" || lowerName.endsWith(".svg")) {
        return "svg";
    }
    if (lowerMime === "image/webp" || lowerName.endsWith(".webp")) {
        return "webp";
    }
    if (lowerMime === "image/gif" || lowerName.endsWith(".gif")) {
        return "gif";
    }
    if (lowerMime === "image/bmp" || lowerName.endsWith(".bmp")) {
        return "bmp";
    }
    if (lowerMime === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
        return "jpeg";
    }
    if (lowerMime === "image/png" || lowerName.endsWith(".png")) {
        return "png";
    }

    return "unknown";
}

export async function rasterizeImageToPngBytes(imageFile: File | Blob): Promise<Uint8Array> {
    if (typeof window === "undefined" || typeof document === "undefined") {
        throw new ExecutionError(
            "UNSUPPORTED_CLIENT_OP",
            "Browser DOM Canvas is required for non-JPEG/PNG image rasterization."
        );
    }

    return new Promise<Uint8Array>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(imageFile);
        const img = new Image();

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;

                if (canvas.width <= 0 || canvas.height <= 0) {
                    URL.revokeObjectURL(objectUrl);
                    reject(new ExecutionError("INVALID_INPUT", "Image has invalid zero dimensions."));
                    return;
                }

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    URL.revokeObjectURL(objectUrl);
                    reject(new ExecutionError("CLIENT_FAILURE", "Failed to create 2D canvas context."));
                    return;
                }

                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(objectUrl);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new ExecutionError("CLIENT_FAILURE", "Failed to export rasterized PNG canvas blob."));
                        return;
                    }
                    blob.arrayBuffer()
                        .then((buffer) => resolve(new Uint8Array(buffer)))
                        .catch((err) => reject(new ExecutionError("CLIENT_FAILURE", "Failed to read canvas buffer.", err)));
                }, "image/png");
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(new ExecutionError("CLIENT_FAILURE", "Error during canvas rasterization.", err));
            }
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(new ExecutionError("INVALID_INPUT", "Failed to decode image in browser runtime.", err));
        };

        img.src = objectUrl;
    });
}

export async function embedImageInPdf(
    pdfDoc: PDFDocument,
    imageFile: File | Blob
): Promise<PDFImage> {
    const arrayBuf = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    if (bytes.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "Image file is empty (0 bytes).");
    }

    const format = detectImageFormat(
        bytes,
        (imageFile as File).name || "",
        imageFile.type || ""
    );

    if (format === "jpeg") {
        try {
            return await pdfDoc.embedJpg(arrayBuf);
        } catch (err) {
            // If raw embed fails, attempt canvas rasterization fallback
            try {
                const pngBytes = await rasterizeImageToPngBytes(imageFile);
                return await pdfDoc.embedPng(pngBytes);
            } catch {
                throw new ExecutionError("INVALID_INPUT", "Failed to embed JPEG image into PDF.", err);
            }
        }
    }

    if (format === "png") {
        try {
            return await pdfDoc.embedPng(arrayBuf);
        } catch (err) {
            try {
                const pngBytes = await rasterizeImageToPngBytes(imageFile);
                return await pdfDoc.embedPng(pngBytes);
            } catch {
                throw new ExecutionError("INVALID_INPUT", "Failed to embed PNG image into PDF.", err);
            }
        }
    }

    if (format === "webp" || format === "gif" || format === "bmp" || format === "svg") {
        try {
            const pngBytes = await rasterizeImageToPngBytes(imageFile);
            return await pdfDoc.embedPng(pngBytes);
        } catch (err) {
            if (err instanceof ExecutionError) throw err;
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                `Client browser cannot decode format '${format}'. Routing to Cloud.`,
                err
            );
        }
    }

    // Try canvas rasterization as a last resort before failing
    try {
        const pngBytes = await rasterizeImageToPngBytes(imageFile);
        return await pdfDoc.embedPng(pngBytes);
    } catch {
        throw new ExecutionError(
            "INVALID_INPUT",
            `Unsupported or unrecognized image format: '${(imageFile as File).name || "image"}'`
        );
    }
}

export async function executeStandardImagesToPdf(files: File[]): Promise<Blob> {
    if (!files || files.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "No image files provided for PDF conversion.");
    }

    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
        const embeddedImage = await embedImageInPdf(pdfDoc, file);
        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;

        if (imgWidth <= 0 || imgHeight <= 0) {
            throw new ExecutionError("INVALID_INPUT", `Invalid image dimensions (${imgWidth}x${imgHeight}) for file ${file.name}`);
        }

        const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);

        // Scale to fit inside A4 page preserving aspect ratio
        const scale = Math.min(A4_WIDTH_PT / imgWidth, A4_HEIGHT_PT / imgHeight);
        const drawWidth = imgWidth * scale;
        const drawHeight = imgHeight * scale;

        // Center on the page
        const posX = (A4_WIDTH_PT - drawWidth) / 2;
        const posY = (A4_HEIGHT_PT - drawHeight) / 2;

        page.drawImage(embeddedImage, {
            x: posX,
            y: posY,
            width: drawWidth,
            height: drawHeight,
        });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function executeCustomImagesToPdf(
    files: File[],
    layout: CanvasLayoutItem[]
): Promise<Blob> {
    if (!files || files.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "No image files provided for custom canvas conversion.");
    }

    const pdfDoc = await PDFDocument.create();

    // Sort items by PageIndex ascending, then ZIndex ascending (matching backend sort)
    const sortedLayout = [...layout].sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) {
            return a.pageIndex - b.pageIndex;
        }
        return (a.zIndex || 0) - (b.zIndex || 0);
    });

    // Embed all unique referenced images
    const embeddedImages: (PDFImage | null)[] = [];
    for (let i = 0; i < files.length; i++) {
        const isReferenced = sortedLayout.some((item) => item.fileIndex === i);
        if (isReferenced) {
            embeddedImages[i] = await embedImageInPdf(pdfDoc, files[i]);
        } else {
            embeddedImages[i] = null;
        }
    }

    const pages: ReturnType<typeof pdfDoc.addPage>[] = [];
    let currentPageIndex = -1;

    for (const item of sortedLayout) {
        if (item.fileIndex < 0 || item.fileIndex >= files.length) {
            continue;
        }

        const embeddedImage = embeddedImages[item.fileIndex];
        if (!embeddedImage) {
            continue;
        }

        while (currentPageIndex < item.pageIndex) {
            pages.push(pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]));
            currentPageIndex++;
        }

        const page = pages[item.pageIndex];
        if (!page) continue;

        // Convert normalized (350x495) coordinates to PDF points
        const drawWidth = item.width * CUSTOM_SCALE_RATIO_PT;
        const drawHeight = item.height * CUSTOM_SCALE_RATIO_PT;
        const posX = item.x * CUSTOM_SCALE_RATIO_PT;
        // In PDF coordinates, Y origin is bottom-left
        const posY = A4_HEIGHT_PT - (item.y * CUSTOM_SCALE_RATIO_PT) - drawHeight;

        // Draw image
        page.drawImage(embeddedImage, {
            x: posX,
            y: posY,
            width: drawWidth,
            height: drawHeight,
        });

        // Draw border if requested
        if (item.borderWidth && item.borderWidth > 0) {
            const borderWidthPt = item.borderWidth * CUSTOM_SCALE_RATIO_PT;
            let borderR = 0;
            let borderG = 0;
            let borderB = 0;

            if (item.borderColor && item.borderColor.startsWith("#") && item.borderColor.length === 7) {
                borderR = parseInt(item.borderColor.substring(1, 3), 16) / 255;
                borderG = parseInt(item.borderColor.substring(3, 5), 16) / 255;
                borderB = parseInt(item.borderColor.substring(5, 7), 16) / 255;
            }

            page.drawRectangle({
                x: posX,
                y: posY,
                width: drawWidth,
                height: drawHeight,
                borderWidth: borderWidthPt,
                borderColor: rgb(borderR, borderG, borderB),
            });
        }
    }

    if (currentPageIndex === -1) {
        pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function executeImagesToPdf(
    files: File[],
    params: Record<string, any> = {}
): Promise<Blob> {
    const rawLayout = params.canvasLayout;
    if (rawLayout) {
        let layout: CanvasLayoutItem[] = [];
        if (typeof rawLayout === "string") {
            try {
                layout = JSON.parse(rawLayout);
            } catch {
                layout = [];
            }
        } else if (Array.isArray(rawLayout)) {
            layout = rawLayout;
        }
        return await executeCustomImagesToPdf(files, layout);
    }

    return await executeStandardImagesToPdf(files);
}
