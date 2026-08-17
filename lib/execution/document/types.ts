export type PaperSize = "A4" | "letter" | "legal";

export interface MarginsInches {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface MarginsPoints {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface PageDimensions {
    width: number;
    height: number;
}

export const PAPER_DIMENSIONS: Record<PaperSize, PageDimensions> = {
    A4: { width: 595.28, height: 841.89 },
    letter: { width: 612.0, height: 792.0 },
    legal: { width: 612.0, height: 1008.0 },
};

export function parsePaperSize(sizeStr?: string): PaperSize {
    if (!sizeStr) return "A4";
    const lower = sizeStr.toLowerCase().trim();
    if (lower === "letter") return "letter";
    if (lower === "legal") return "legal";
    return "A4";
}

export function parseMarginsInches(params?: {
    top?: number | string;
    bottom?: number | string;
    left?: number | string;
    right?: number | string;
    marginTop?: number | string;
    marginBottom?: number | string;
    marginLeft?: number | string;
    marginRight?: number | string;
}): MarginsInches {
    const top = parseFloat(String(params?.marginTop ?? params?.top ?? 0.4));
    const bottom = parseFloat(String(params?.marginBottom ?? params?.bottom ?? 0.4));
    const left = parseFloat(String(params?.marginLeft ?? params?.left ?? 0.4));
    const right = parseFloat(String(params?.marginRight ?? params?.right ?? 0.4));

    return {
        top: isNaN(top) || top < 0 ? 0.4 : Math.min(top, 2.5),
        bottom: isNaN(bottom) || bottom < 0 ? 0.4 : Math.min(bottom, 2.5),
        left: isNaN(left) || left < 0 ? 0.4 : Math.min(left, 2.5),
        right: isNaN(right) || right < 0 ? 0.4 : Math.min(right, 2.5),
    };
}

export function inchesToPoints(margins: MarginsInches): MarginsPoints {
    return {
        top: margins.top * 72,
        bottom: margins.bottom * 72,
        left: margins.left * 72,
        right: margins.right * 72,
    };
}

export interface RGBColor {
    r: number;
    g: number;
    b: number;
}

export function hexToRgb(hex: string): RGBColor {
    const cleanHex = hex.replace("#", "").trim();
    if (cleanHex.length === 3) {
        const r = parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
        const g = parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
        const b = parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
        return { r, g, b };
    }
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    return { r, g, b };
}

export interface CodeToPdfOptions {
    paperSize?: string;
    marginTop?: number | string;
    marginBottom?: number | string;
    marginLeft?: number | string;
    marginRight?: number | string;
    fontSize?: number;
    lineHeight?: number;
    tabSize?: number;
    language?: string;
    fileName?: string;
}

export interface MarkdownToPdfOptions {
    paperSize?: string;
    marginTop?: number | string;
    marginBottom?: number | string;
    marginLeft?: number | string;
    marginRight?: number | string;
    fontSize?: number;
    lineHeight?: number;
    fileName?: string;
}

export interface TokenRun {
    text: string;
    color: RGBColor;
    bold?: boolean;
}

