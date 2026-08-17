import Prism from "prismjs";
import { PDFDocument } from "pdf-lib";
import { ExecutionError } from "../types";
import { CodeToPdfOptions, RGBColor, TokenRun, hexToRgb } from "./types";
import { PdfLayoutEngine } from "./pdfLayoutEngine";

// Synchronous bundling of Prism components for complete offline execution
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";

// Prism Tomorrow Dark Theme Color Palette
export const PRISM_TOMORROW_PALETTE: Record<string, RGBColor> = {
    comment: hexToRgb("#999999"),
    prolog: hexToRgb("#999999"),
    doctype: hexToRgb("#999999"),
    cdata: hexToRgb("#999999"),
    punctuation: hexToRgb("#cccccc"),
    property: hexToRgb("#f08d49"),
    tag: hexToRgb("#f08d49"),
    boolean: hexToRgb("#f08d49"),
    number: hexToRgb("#f08d49"),
    constant: hexToRgb("#f08d49"),
    symbol: hexToRgb("#f08d49"),
    deleted: hexToRgb("#f08d49"),
    selector: hexToRgb("#7ec699"),
    "attr-name": hexToRgb("#7ec699"),
    string: hexToRgb("#7ec699"),
    char: hexToRgb("#7ec699"),
    builtin: hexToRgb("#7ec699"),
    inserted: hexToRgb("#7ec699"),
    operator: hexToRgb("#67cdcc"),
    entity: hexToRgb("#67cdcc"),
    url: hexToRgb("#67cdcc"),
    variable: hexToRgb("#67cdcc"),
    atrule: hexToRgb("#cc99cd"),
    "attr-value": hexToRgb("#cc99cd"),
    keyword: hexToRgb("#cc99cd"),
    function: hexToRgb("#f8c555"),
    "class-name": hexToRgb("#f8c555"),
    regex: hexToRgb("#e2777a"),
    important: hexToRgb("#e2777a"),
    default: hexToRgb("#e3e3e6"),
};

export function resolveLanguage(fileName?: string, explicitLang?: string): string {
    if (explicitLang && Prism.languages[explicitLang]) {
        return explicitLang;
    }

    if (!fileName) return "plaintext";

    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex < 0) return "plaintext";
    const ext = fileName.substring(dotIndex + 1).toLowerCase().trim();

    switch (ext) {
        case "js":
        case "mjs":
        case "cjs":
            return "javascript";
        case "ts":
            return "typescript";
        case "tsx":
            return "tsx";
        case "jsx":
            return "jsx";
        case "py":
        case "pyw":
            return "python";
        case "go":
            return "go";
        case "rs":
            return "rust";
        case "java":
            return "java";
        case "kt":
        case "kts":
            return "kotlin";
        case "c":
            return "c";
        case "cpp":
        case "cc":
        case "cxx":
        case "h":
        case "hpp":
            return "cpp";
        case "html":
        case "htm":
        case "xml":
        case "svg":
            return "markup";
        case "css":
            return "css";
        case "scss":
            return "scss";
        case "json":
            return "json";
        case "yaml":
        case "yml":
            return "yaml";
        case "sh":
        case "bash":
        case "zsh":
            return "bash";
        case "sql":
            return "sql";
        case "md":
        case "markdown":
        case "txt":
        default:
            return "plaintext";
    }
}

export interface RawTokenSpan {
    text: string;
    type: string;
}

export function flattenPrismTokens(tokens: Array<string | Prism.Token>, parentType?: string): RawTokenSpan[] {
    const result: RawTokenSpan[] = [];

    for (const token of tokens) {
        if (typeof token === "string") {
            result.push({
                text: token,
                type: parentType || "default",
            });
        } else if (typeof token.content === "string") {
            result.push({
                text: token.content,
                type: token.type || parentType || "default",
            });
        } else if (Array.isArray(token.content)) {
            result.push(...flattenPrismTokens(token.content, token.type || parentType));
        } else if (token.content && typeof token.content === "object") {
            result.push(...flattenPrismTokens([token.content as Prism.Token], token.type || parentType));
        }
    }

    return result;
}

/**
 * Checks whether the source code contains characters beyond standard WinAnsi / Latin-1 encoding
 * that cannot be safely drawn with Standard 14 Courier fonts without glyph dropping or encoding failure.
 */
export function assertLatinFontCompatibility(source: string): void {
    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        // ASCII & Latin-1 Supplement (0 - 255) are fully encodable in pdf-lib StandardFonts.Courier
        if (code > 255) {
            // Check if it's a known non-Latin/CJK/Sinhala/Complex Unicode glyph
            throw new ExecutionError(
                "UNSUPPORTED_CLIENT_OP",
                `Source code contains non-Latin Unicode characters (U+${code.toString(16).toUpperCase()}) requiring server-side typography rendering.`
            );
        }
    }
}

export async function executeCodeToPdf(file: File, options?: CodeToPdfOptions): Promise<Blob> {
    if (!file || file.size === 0) {
        throw new ExecutionError("INVALID_INPUT", "Provided source code file is empty or missing.");
    }

    let sourceText: string;
    try {
        sourceText = await file.text();
    } catch (err) {
        throw new ExecutionError("INVALID_INPUT", "Failed to read source code text content.", err);
    }

    if (!sourceText && sourceText !== "") {
        throw new ExecutionError("INVALID_INPUT", "Source code file contains no readable text.");
    }

    // Check font compatibility: non-Latin Unicode routes to Cloud fallback
    assertLatinFontCompatibility(sourceText);

    // Expand tabs to 4 spaces for visual column consistency
    const tabSize = options?.tabSize ?? 4;
    const tabSpaces = " ".repeat(tabSize);
    const normalizedSource = sourceText.replace(/\t/g, tabSpaces);

    // Resolve Language Grammar
    const fileName = options?.fileName || file.name;
    const lang = resolveLanguage(fileName, options?.language);
    const grammar = Prism.languages[lang];

    // Tokenize
    let tokenSpans: RawTokenSpan[];
    if (grammar) {
        const prismTokens = Prism.tokenize(normalizedSource, grammar);
        tokenSpans = flattenPrismTokens(prismTokens);
    } else {
        tokenSpans = [{ text: normalizedSource, type: "default" }];
    }

    // Assemble PDF Document
    const pdfDoc = await PDFDocument.create();
    const engine = new PdfLayoutEngine(pdfDoc, {
        paperSize: options?.paperSize,
        margins: {
            top: options?.marginTop,
            bottom: options?.marginBottom,
            left: options?.marginLeft,
            right: options?.marginRight,
        },
        fontSize: options?.fontSize ?? 10,
        lineHeight: options?.lineHeight ?? 1.45,
    });

    await engine.init();
    engine.allocatePage();

    const bounds = engine.getPrintableBounds();
    const charWidth = engine.getCharWidth();
    const maxCharsPerVisualLine = Math.max(10, Math.floor(bounds.contentWidth / charWidth));

    let currentVisualCol = 0;

    for (const span of tokenSpans) {
        const color = PRISM_TOMORROW_PALETTE[span.type] || PRISM_TOMORROW_PALETTE.default;
        const isBold = span.type === "keyword" || span.type === "class-name";

        // A token may contain newlines (e.g. multiline comments, strings, or whitespace)
        const lines = span.text.split("\n");

        for (let l = 0; l < lines.length; l++) {
            if (l > 0) {
                // Advance to next source line
                engine.advanceLine();
                currentVisualCol = 0;
            }

            const segment = lines[l];
            if (segment.length === 0) continue;

            // Visual line wrapping without inserting continuation characters
            let offset = 0;
            while (offset < segment.length) {
                const remainingSpaceOnLine = maxCharsPerVisualLine - currentVisualCol;

                if (remainingSpaceOnLine <= 0) {
                    engine.advanceLine();
                    currentVisualCol = 0;
                    continue;
                }

                const chunkLen = Math.min(segment.length - offset, remainingSpaceOnLine);
                const chunkText = segment.substring(offset, offset + chunkLen);

                engine.drawTokenRun({
                    text: chunkText,
                    color,
                    bold: isBold,
                });

                currentVisualCol += chunkLen;
                offset += chunkLen;
            }
        }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer], {
        type: "application/pdf",
    });
}
