"use client";

import { PDFDocument, PDFPage, degrees } from "pdf-lib";
import { ExecutionError } from "../types";

export interface SignatureStamp {
    page: number; // 1-indexed
    x: number;    // Points from left (visible top-left origin)
    y: number;    // Points from top (visible top-left origin)
    width: number;
    height: number;
}

export interface SignPdfParams {
    signature?: Blob | File | Uint8Array | ArrayBuffer | string;
    stamps?: SignatureStamp[] | string;
    [key: string]: any;
}

/**
 * Parses raw signature input (Blob, File, ArrayBuffer, Uint8Array, base64 data URL) into a Uint8Array.
 */
async function extractSignatureBytes(
    signature: Blob | File | Uint8Array | ArrayBuffer | string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
    if (typeof signature === "string") {
        if (signature.startsWith("data:")) {
            const match = signature.match(/^data:([^;]+);base64,(.*)$/);
            if (!match) {
                throw new ExecutionError(
                    "INVALID_INPUT",
                    "Invalid signature data URL format."
                );
            }
            const mimeType = match[1].toLowerCase();
            const binaryString = atob(match[2]);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return { bytes, mimeType };
        } else {
            // Treat as raw base64 string
            const binaryString = atob(signature);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return { bytes, mimeType: "image/png" };
        }
    }

    if (signature instanceof Uint8Array) {
        return { bytes: signature, mimeType: "image/png" };
    }

    if (signature instanceof ArrayBuffer) {
        return { bytes: new Uint8Array(signature), mimeType: "image/png" };
    }

    if (typeof Blob !== "undefined" && signature instanceof Blob) {
        const arrayBuf = await signature.arrayBuffer();
        const mimeType = signature.type || "image/png";
        return { bytes: new Uint8Array(arrayBuf), mimeType };
    }

    throw new ExecutionError(
        "INVALID_INPUT",
        "Unsupported signature image input type."
    );
}

/**
 * Executes visual signature placement onto PDF pages using pdf-lib.
 */
export async function executeSignPdf(
    file: File | Blob,
    params: SignPdfParams,
    originalPassword?: string
): Promise<Blob> {
    if (!file) {
        throw new ExecutionError("INVALID_INPUT", "No PDF document provided for signing.");
    }

    if (!params.signature) {
        throw new ExecutionError("INVALID_INPUT", "Missing signature image asset.");
    }

    // 1. Parse and validate stamps
    let rawStamps = params.stamps;
    if (typeof rawStamps === "string") {
        try {
            rawStamps = JSON.parse(rawStamps);
        } catch {
            throw new ExecutionError("INVALID_INPUT", "Malformed signature stamps metadata JSON.");
        }
    }

    const stamps: SignatureStamp[] = Array.isArray(rawStamps) ? rawStamps : [];
    if (stamps.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "At least one signature stamp placement is required.");
    }

    // 2. Load PDF file buffer & check header
    const fileBuffer = await file.arrayBuffer();
    const headerBytes = new Uint8Array(fileBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    if (!headerString.startsWith("%PDF-")) {
        throw new ExecutionError(
            "INVALID_INPUT",
            "The selected file is not a valid PDF document (missing %PDF- header)."
        );
    }

    // 3. Load PDF Document
    let pdfDoc: PDFDocument;
    try {
        pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: false });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("password") || message.toLowerCase().includes("encrypt")) {
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                "Password-protected files require server-side encryption pipeline.",
                err
            );
        }
        throw new ExecutionError("INVALID_INPUT", "Failed to parse PDF document for signing.", err);
    }

    // 4. Extract and embed signature image
    const { bytes: sigBytes, mimeType } = await extractSignatureBytes(params.signature);
    if (sigBytes.length === 0) {
        throw new ExecutionError("INVALID_INPUT", "Signature image is empty.");
    }

    let embeddedImage;
    try {
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
            embeddedImage = await pdfDoc.embedJpg(sigBytes);
        } else {
            embeddedImage = await pdfDoc.embedPng(sigBytes);
        }
    } catch (embedErr) {
        // Fallback: try embedding as JPG if PNG failed, or vice versa
        try {
            embeddedImage = await pdfDoc.embedJpg(sigBytes);
        } catch {
            throw new ExecutionError(
                "INVALID_INPUT",
                "Failed to embed signature image. Ensure valid PNG or JPEG format.",
                embedErr
            );
        }
    }

    const totalPages = pdfDoc.getPageCount();

    // 5. Draw signature stamps onto target pages
    for (const stamp of stamps) {
        const pageIndex = Number(stamp.page) - 1;
        if (isNaN(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) {
            continue; // Safely skip out-of-range pages
        }

        const page = pdfDoc.getPage(pageIndex);
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        const rotationAngle = ((page.getRotation().angle % 360) + 360) % 360;

        const stampX = Math.max(0, Number(stamp.x) || 0);
        const stampY = Math.max(0, Number(stamp.y) || 0);
        const stampW = Math.max(1, Number(stamp.width) || 100);
        const stampH = Math.max(1, Number(stamp.height) || 40);

        // Aspect ratio preservation (matching PyMuPDF keep_proportion=True default)
        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;
        const imgAspect = imgWidth / imgHeight;
        const targetAspect = stampW / stampH;

        let fittedW = stampW;
        let fittedH = stampH;
        let offsetX = 0;
        let offsetY = 0;

        if (params.keepProportion !== false && imgAspect > 0 && targetAspect > 0) {
            if (imgAspect > targetAspect) {
                // Width limited
                fittedW = stampW;
                fittedH = stampW / imgAspect;
                offsetY = (stampH - fittedH) / 2;
            } else {
                // Height limited
                fittedH = stampH;
                fittedW = stampH * imgAspect;
                offsetX = (stampW - fittedW) / 2;
            }
        }

        const effectiveX = stampX + offsetX;
        const effectiveY = stampY + offsetY;

        // Coordinate transformation matching visible top-left origin
        let pdfX = effectiveX;
        let pdfY = pageHeight - effectiveY - fittedH;
        let drawW = fittedW;
        let drawH = fittedH;

        if (rotationAngle === 90) {
            pdfX = effectiveY;
            pdfY = effectiveX;
            drawW = fittedH;
            drawH = fittedW;
        } else if (rotationAngle === 180) {
            pdfX = pageWidth - effectiveX - fittedW;
            pdfY = effectiveY;
        } else if (rotationAngle === 270) {
            pdfX = pageWidth - effectiveY - fittedH;
            pdfY = pageHeight - effectiveX - fittedW;
            drawW = fittedH;
            drawH = fittedW;
        }

        page.drawImage(embeddedImage, {
            x: pdfX,
            y: pdfY,
            width: drawW,
            height: drawH,
        });
    }

    // 6. Save modified PDF document
    const outputBytes = await pdfDoc.save();
    return new Blob([outputBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
