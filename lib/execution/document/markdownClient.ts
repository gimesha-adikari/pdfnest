import { marked, Tokens } from "marked";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { ExecutionError } from "../types";
import {
    MarginsPoints,
    MarkdownToPdfOptions,
    PAPER_DIMENSIONS,
    PaperSize,
    RGBColor,
    hexToRgb,
    inchesToPoints,
    parseMarginsInches,
    parsePaperSize,
} from "./types";
import {
    PRISM_TOMORROW_PALETTE,
    assertLatinFontCompatibility,
    flattenPrismTokens,
    resolveLanguage,
} from "./codeClient";
import Prism from "prismjs";

// Document Palette (Dark Theme matching Platen Markdown Converter)
const THEME = {
    bgPage: hexToRgb("#1e1e24"),
    bgCode: hexToRgb("#18181c"),
    bgTableHeader: hexToRgb("#26262e"),
    bgTableRowAlt: hexToRgb("#222228"),
    border: hexToRgb("#2d2d34"),
    blockquoteBar: hexToRgb("#6366f1"), // Indigo
    textH1: hexToRgb("#ffffff"),
    textH2: hexToRgb("#f3f4f6"),
    textH3: hexToRgb("#e5e7eb"),
    textH4: hexToRgb("#d1d5db"),
    textH5: hexToRgb("#9ca3af"),
    textH6: hexToRgb("#9ca3af"),
    textBody: hexToRgb("#cbcbd0"),
    textBold: hexToRgb("#f3f4f6"),
    textMuted: hexToRgb("#9ca3af"),
    textCode: hexToRgb("#f43f5e"), // Rose
    textLink: hexToRgb("#60a5fa"), // Blue
    checkboxChecked: hexToRgb("#10b981"), // Emerald
};

interface InlineSpan {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    link?: string;
    del?: boolean;
    color?: RGBColor;
}

export class MarkdownPdfEngine {
    private doc: PDFDocument;
    private fontRegular!: PDFFont;
    private fontBold!: PDFFont;
    private fontItalic!: PDFFont;
    private fontBoldItalic!: PDFFont;
    private fontMono!: PDFFont;
    private fontMonoBold!: PDFFont;

    private paperSize: PaperSize;
    private margins: MarginsPoints;
    private fontSize: number;
    private lineHeightMultiplier: number;

    private pages: PDFPage[] = [];
    private currentPageIndex = -1;
    private cursorY = 0;

    constructor(doc: PDFDocument, options?: MarkdownToPdfOptions) {
        this.doc = doc;
        this.paperSize = parsePaperSize(options?.paperSize);
        this.margins = inchesToPoints(
            parseMarginsInches({
                top: options?.marginTop,
                bottom: options?.marginBottom,
                left: options?.marginLeft,
                right: options?.marginRight,
            })
        );
        this.fontSize = options?.fontSize ?? 10.5;
        this.lineHeightMultiplier = options?.lineHeight ?? 1.55;
    }

    async init(): Promise<void> {
        this.fontRegular = await this.doc.embedFont(StandardFonts.Helvetica);
        this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
        this.fontItalic = await this.doc.embedFont(StandardFonts.HelveticaOblique);
        this.fontBoldItalic = await this.doc.embedFont(StandardFonts.HelveticaBoldOblique);
        this.fontMono = await this.doc.embedFont(StandardFonts.Courier);
        this.fontMonoBold = await this.doc.embedFont(StandardFonts.CourierBold);
    }

    get pageDimensions() {
        return PAPER_DIMENSIONS[this.paperSize];
    }

    get bounds() {
        const { width, height } = this.pageDimensions;
        const x = this.margins.left;
        const y = this.margins.bottom;
        const contentWidth = Math.max(20, width - this.margins.left - this.margins.right);
        const contentHeight = Math.max(20, height - this.margins.top - this.margins.bottom);
        return { x, y, width, height, contentWidth, contentHeight };
    }

    allocatePage(): PDFPage {
        const { width, height } = this.pageDimensions;
        const page = this.doc.addPage([width, height]);
        this.pages.push(page);
        this.currentPageIndex = this.pages.length - 1;

        // Draw page dark background
        page.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(THEME.bgPage.r, THEME.bgPage.g, THEME.bgPage.b),
        });

        this.cursorY = height - this.margins.top;
        return page;
    }

    get currentPage(): PDFPage {
        if (this.currentPageIndex < 0) {
            return this.allocatePage();
        }
        return this.pages[this.currentPageIndex];
    }

    ensureSpace(requiredPoints: number): void {
        if (this.currentPageIndex < 0 || this.cursorY - requiredPoints < this.bounds.y) {
            this.allocatePage();
        }
    }

    private selectFont(span: InlineSpan): PDFFont {
        if (span.code) {
            return span.bold ? this.fontMonoBold : this.fontMono;
        }
        if (span.bold && span.italic) {
            return this.fontBoldItalic;
        }
        if (span.bold) {
            return this.fontBold;
        }
        if (span.italic) {
            return this.fontItalic;
        }
        return this.fontRegular;
    }

    // ─── Inline Tokens Extraction ──────────────────────────────────────────────

    private extractInlineSpans(tokens?: Tokens.Generic[], state: Partial<InlineSpan> = {}): InlineSpan[] {
        if (!tokens || tokens.length === 0) return [];
        const spans: InlineSpan[] = [];

        for (const token of tokens) {
            switch (token.type) {
                case "text": {
                    const textToken = token as Tokens.Text;
                    if (textToken.tokens && textToken.tokens.length > 0) {
                        spans.push(...this.extractInlineSpans(textToken.tokens, state));
                    } else if (textToken.text) {
                        spans.push({ text: textToken.text, ...state });
                    }
                    break;
                }
                case "strong": {
                    const strongToken = token as Tokens.Strong;
                    spans.push(...this.extractInlineSpans(strongToken.tokens, { ...state, bold: true }));
                    break;
                }
                case "em": {
                    const emToken = token as Tokens.Em;
                    spans.push(...this.extractInlineSpans(emToken.tokens, { ...state, italic: true }));
                    break;
                }
                case "codespan": {
                    const codeToken = token as Tokens.Codespan;
                    spans.push({ text: codeToken.text, ...state, code: true, color: THEME.textCode });
                    break;
                }
                case "link": {
                    const linkToken = token as Tokens.Link;
                    const linkSpans = this.extractInlineSpans(linkToken.tokens, {
                        ...state,
                        link: linkToken.href,
                        color: THEME.textLink,
                    });
                    if (linkSpans.length === 0 && linkToken.text) {
                        spans.push({ text: linkToken.text, link: linkToken.href, color: THEME.textLink, ...state });
                    } else {
                        spans.push(...linkSpans);
                    }
                    break;
                }
                case "del": {
                    const delToken = token as Tokens.Del;
                    spans.push(...this.extractInlineSpans(delToken.tokens, { ...state, del: true, color: THEME.textMuted }));
                    break;
                }
                case "br": {
                    spans.push({ text: "\n", ...state });
                    break;
                }
                case "image": {
                    const imgToken = token as Tokens.Image;
                    // External images rendered as safe offline indicator; data URIs handled in block flow
                    spans.push({
                        text: `[Image: ${imgToken.text || "image"}]`,
                        italic: true,
                        color: THEME.textMuted,
                        ...state,
                    });
                    break;
                }
                case "html": {
                    const raw = (token as Tokens.HTML).text || "";
                    const sanitized = raw.replace(/<[^>]*>/g, " ").trim();
                    if (sanitized) {
                        spans.push({ text: sanitized, ...state });
                    }
                    break;
                }
                case "escape": {
                    const esc = (token as Tokens.Escape).text || "";
                    if (esc) spans.push({ text: esc, ...state });
                    break;
                }
                default: {
                    if ((token as any).text) {
                        spans.push({ text: (token as any).text, ...state });
                    }
                }
            }
        }

        return spans;
    }

    // ─── Word-Wrapped Inline Text Renderer ─────────────────────────────────────

    renderInlineParagraph(
        spans: InlineSpan[],
        options?: {
            startX?: number;
            availableWidth?: number;
            baseFontSize?: number;
            baseLinePitch?: number;
            defaultColor?: RGBColor;
            marginBottom?: number;
        }
    ): void {
        const startX = options?.startX ?? this.bounds.x;
        const maxWidth = options?.availableWidth ?? this.bounds.contentWidth;
        const fontSize = options?.baseFontSize ?? this.fontSize;
        const linePitch = options?.baseLinePitch ?? fontSize * this.lineHeightMultiplier;
        const defaultColor = options?.defaultColor ?? THEME.textBody;
        const marginBottom = options?.marginBottom ?? 10;

        // Break spans into indivisible units (words + spaces)
        interface TextUnit {
            word: string;
            span: InlineSpan;
            width: number;
            font: PDFFont;
        }

        const units: TextUnit[] = [];

        for (const span of spans) {
            const font = this.selectFont(span);
            // Split preserving whitespace tokens
            const parts = span.text.split(/(\s+|\n)/);

            for (const part of parts) {
                if (!part) continue;
                if (part === "\n") {
                    units.push({ word: "\n", span, width: 0, font });
                } else {
                    const width = font.widthOfTextAtSize(part, fontSize);
                    units.push({ word: part, span, width, font });
                }
            }
        }

        if (units.length === 0) return;

        // Flow units into visual lines
        interface VisualRun {
            text: string;
            span: InlineSpan;
            font: PDFFont;
            x: number;
            width: number;
        }

        const lines: VisualRun[][] = [];
        let currentLine: VisualRun[] = [];
        let currentLineWidth = 0;

        for (let i = 0; i < units.length; i++) {
            const u = units[i];

            if (u.word === "\n") {
                lines.push(currentLine);
                currentLine = [];
                currentLineWidth = 0;
                continue;
            }

            // Leading whitespace at start of line is trimmed
            if (currentLine.length === 0 && /^\s+$/.test(u.word)) {
                continue;
            }

            if (currentLineWidth + u.width <= maxWidth || currentLine.length === 0) {
                currentLine.push({
                    text: u.word,
                    span: u.span,
                    font: u.font,
                    x: startX + currentLineWidth,
                    width: u.width,
                });
                currentLineWidth += u.width;
            } else {
                // Wrap to next line
                lines.push(currentLine);
                currentLine = [];
                currentLineWidth = 0;

                // Skip leading space on new line
                if (/^\s+$/.test(u.word)) {
                    continue;
                }

                currentLine.push({
                    text: u.word,
                    span: u.span,
                    font: u.font,
                    x: startX,
                    width: u.width,
                });
                currentLineWidth = u.width;
            }
        }

        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        // Draw lines
        for (const line of lines) {
            this.ensureSpace(linePitch);

            const page = this.currentPage;
            for (const run of line) {
                const textColor = run.span.color || defaultColor;

                // Draw background pill for inline codespans
                if (run.span.code) {
                    page.drawRectangle({
                        x: run.x - 2,
                        y: this.cursorY - fontSize * 0.25,
                        width: run.width + 4,
                        height: fontSize * 1.25,
                        color: rgb(THEME.bgCode.r, THEME.bgCode.g, THEME.bgCode.b),
                        borderColor: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
                        borderWidth: 0.5,
                    });
                }

                page.drawText(run.text, {
                    x: run.x,
                    y: this.cursorY,
                    size: fontSize,
                    font: run.font,
                    color: rgb(textColor.r, textColor.g, textColor.b),
                });

                // Draw strikethrough line
                if (run.span.del) {
                    page.drawLine({
                        start: { x: run.x, y: this.cursorY + fontSize * 0.35 },
                        end: { x: run.x + run.width, y: this.cursorY + fontSize * 0.35 },
                        thickness: 0.8,
                        color: rgb(THEME.textMuted.r, THEME.textMuted.g, THEME.textMuted.b),
                    });
                }
            }

            this.cursorY -= linePitch;
        }

        this.cursorY -= marginBottom;
    }

    // ─── Markdown Block Element Renderers ──────────────────────────────────────

    renderHeading(heading: Tokens.Heading): void {
        const depth = Math.min(6, Math.max(1, heading.depth));
        const sizes = [20, 16, 14, 12, 11, 10];
        const colors = [THEME.textH1, THEME.textH2, THEME.textH3, THEME.textH4, THEME.textH5, THEME.textH6];
        const topMargins = [18, 14, 12, 10, 8, 6];
        const bottomMargins = [10, 8, 6, 6, 4, 4];

        const fontSize = sizes[depth - 1];
        const color = colors[depth - 1];
        const marginTop = topMargins[depth - 1];
        const marginBottom = bottomMargins[depth - 1];
        const linePitch = fontSize * 1.35;

        // Keep-with-next / orphan protection: ensure space for heading + minimum following paragraph line
        this.ensureSpace(marginTop + linePitch + 45);

        this.cursorY -= marginTop;

        const spans = this.extractInlineSpans(heading.tokens as Tokens.Generic[], { bold: true, color });
        if (spans.length === 0 && heading.text) {
            spans.push({ text: heading.text, bold: true, color });
        }

        this.renderInlineParagraph(spans, {
            baseFontSize: fontSize,
            baseLinePitch: linePitch,
            defaultColor: color,
            marginBottom,
        });

        // H1 bottom border rule
        if (depth === 1) {
            const page = this.currentPage;
            const borderY = this.cursorY + marginBottom - 4;
            page.drawLine({
                start: { x: this.bounds.x, y: borderY },
                end: { x: this.bounds.x + this.bounds.contentWidth, y: borderY },
                thickness: 0.75,
                color: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
            });
            this.cursorY -= 4;
        }
    }

    renderParagraph(paragraph: Tokens.Paragraph): void {
        const spans = this.extractInlineSpans(paragraph.tokens as Tokens.Generic[]);
        if (spans.length === 0 && paragraph.text) {
            spans.push({ text: paragraph.text });
        }
        this.renderInlineParagraph(spans, { marginBottom: 10 });
    }

    renderBlockquote(quote: Tokens.Blockquote): void {
        const quoteStartX = this.bounds.x + 14;
        const quoteWidth = this.bounds.contentWidth - 14;
        const initialY = this.cursorY;

        for (const token of quote.tokens) {
            if (token.type === "paragraph") {
                const p = token as Tokens.Paragraph;
                const spans = this.extractInlineSpans(p.tokens as Tokens.Generic[], {
                    italic: true,
                    color: THEME.textMuted,
                });
                this.renderInlineParagraph(spans, {
                    startX: quoteStartX,
                    availableWidth: quoteWidth,
                    defaultColor: THEME.textMuted,
                    marginBottom: 6,
                });
            } else {
                this.renderToken(token);
            }
        }

        const endY = this.cursorY + 6;
        const page = this.currentPage;
        const barHeight = Math.max(12, initialY - endY);

        // Draw Indigo Blockquote Left Bar
        page.drawRectangle({
            x: this.bounds.x + 2,
            y: endY,
            width: 3,
            height: barHeight,
            color: rgb(THEME.blockquoteBar.r, THEME.blockquoteBar.g, THEME.blockquoteBar.b),
        });

        this.cursorY -= 6;
    }

    renderCodeBlock(codeToken: Tokens.Code): void {
        const rawCode = codeToken.text || "";
        const lang = resolveLanguage("", codeToken.lang);
        const grammar = Prism.languages[lang];

        let tokenSpans: { text: string; type: string }[];
        if (grammar) {
            const prismTokens = Prism.tokenize(rawCode, grammar);
            tokenSpans = flattenPrismTokens(prismTokens);
        } else {
            tokenSpans = [{ text: rawCode, type: "default" }];
        }

        const fontSize = 9.0;
        const linePitch = fontSize * 1.45;
        const padX = 10;
        const padY = 8;

        // Split spans into lines
        const lines: { text: string; color: RGBColor; bold?: boolean }[][] = [[]];

        for (const span of tokenSpans) {
            const color = PRISM_TOMORROW_PALETTE[span.type] || PRISM_TOMORROW_PALETTE.default;
            const isBold = span.type === "keyword" || span.type === "class-name";
            const parts = span.text.split("\n");

            for (let p = 0; p < parts.length; p++) {
                if (p > 0) lines.push([]);
                if (parts[p]) {
                    lines[lines.length - 1].push({ text: parts[p], color, bold: isBold });
                }
            }
        }

        const blockHeight = lines.length * linePitch + padY * 2;

        // Allocate space for entire block if fits, or begin page
        if (blockHeight < this.bounds.contentHeight * 0.7) {
            this.ensureSpace(blockHeight + 10);
        } else {
            this.ensureSpace(linePitch * 3 + padY * 2);
        }

        const boxStartX = this.bounds.x;
        const boxWidth = this.bounds.contentWidth;
        const boxTopY = this.cursorY;

        // Calculate actual renderable lines on current page
        let currentLineIdx = 0;

        while (currentLineIdx < lines.length) {
            const remainingOnPage = Math.floor((this.cursorY - padY - this.bounds.y) / linePitch);
            const linesToDraw = Math.min(lines.length - currentLineIdx, Math.max(1, remainingOnPage));
            const currentSliceHeight = linesToDraw * linePitch + padY * 2;

            const page = this.currentPage;

            // Draw Code Box Surface
            page.drawRectangle({
                x: boxStartX,
                y: this.cursorY - currentSliceHeight,
                width: boxWidth,
                height: currentSliceHeight,
                color: rgb(THEME.bgCode.r, THEME.bgCode.g, THEME.bgCode.b),
                borderColor: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
                borderWidth: 0.75,
            });

            let lineY = this.cursorY - padY - fontSize;

            for (let i = 0; i < linesToDraw; i++) {
                const line = lines[currentLineIdx++];
                let runX = boxStartX + padX;

                for (const run of line) {
                    const font = run.bold ? this.fontMonoBold : this.fontMono;
                    page.drawText(run.text, {
                        x: runX,
                        y: lineY,
                        size: fontSize,
                        font,
                        color: rgb(run.color.r, run.color.g, run.color.b),
                    });
                    runX += font.widthOfTextAtSize(run.text, fontSize);
                }

                lineY -= linePitch;
            }

            this.cursorY -= currentSliceHeight;

            if (currentLineIdx < lines.length) {
                this.allocatePage();
            }
        }

        this.cursorY -= 12;
    }

    renderList(list: Tokens.List, level = 0): void {
        const indent = level * 16;
        const itemStartX = this.bounds.x + indent;
        const textStartX = itemStartX + 16;
        const textWidth = this.bounds.contentWidth - indent - 16;

        let itemIndex = typeof list.start === "number" ? list.start : 1;

        for (const item of list.items) {
            this.ensureSpace(this.fontSize * this.lineHeightMultiplier + 4);

            const page = this.currentPage;
            let prefixText = "•";

            if (item.task) {
                prefixText = item.checked ? "[x]" : "[ ]";
            } else if (list.ordered) {
                prefixText = `${itemIndex++}.`;
            }

            // Draw bullet / number prefix
            page.drawText(prefixText, {
                x: itemStartX,
                y: this.cursorY - this.fontSize * this.lineHeightMultiplier,
                size: this.fontSize,
                font: list.ordered ? this.fontBold : this.fontRegular,
                color: item.task && item.checked ? rgb(THEME.checkboxChecked.r, THEME.checkboxChecked.g, THEME.checkboxChecked.b) : rgb(THEME.textMuted.r, THEME.textMuted.g, THEME.textMuted.b),
            });

            // Render Item content
            for (const child of item.tokens) {
                if (child.type === "text") {
                    const t = child as Tokens.Text;
                    const spans = this.extractInlineSpans(t.tokens as Tokens.Generic[]);
                    if (spans.length === 0 && t.text) spans.push({ text: t.text });
                    this.renderInlineParagraph(spans, {
                        startX: textStartX,
                        availableWidth: textWidth,
                        marginBottom: 4,
                    });
                } else if (child.type === "paragraph") {
                    const p = child as Tokens.Paragraph;
                    const spans = this.extractInlineSpans(p.tokens as Tokens.Generic[]);
                    if (spans.length === 0 && p.text) spans.push({ text: p.text });
                    this.renderInlineParagraph(spans, {
                        startX: textStartX,
                        availableWidth: textWidth,
                        marginBottom: 4,
                    });
                } else if (child.type === "list") {
                    this.renderList(child as Tokens.List, level + 1);
                } else {
                    this.renderToken(child);
                }
            }
        }

        this.cursorY -= 4;
    }

    renderTable(table: Tokens.Table): void {
        const numCols = table.header.length;
        if (numCols === 0) return;

        const colWidth = this.bounds.contentWidth / numCols;
        const rowHeight = 24;
        const headerHeight = 26;
        const padX = 6;

        this.ensureSpace(headerHeight + rowHeight + 10);

        const tableStartX = this.bounds.x;

        // Draw Header
        const page = this.currentPage;
        page.drawRectangle({
            x: tableStartX,
            y: this.cursorY - headerHeight,
            width: this.bounds.contentWidth,
            height: headerHeight,
            color: rgb(THEME.bgTableHeader.r, THEME.bgTableHeader.g, THEME.bgTableHeader.b),
            borderColor: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
            borderWidth: 0.75,
        });

        for (let c = 0; c < numCols; c++) {
            const hCell = table.header[c];
            const cellText = hCell.text || "";
            page.drawText(cellText, {
                x: tableStartX + c * colWidth + padX,
                y: this.cursorY - headerHeight + 8,
                size: 9.5,
                font: this.fontBold,
                color: rgb(THEME.textH1.r, THEME.textH1.g, THEME.textH1.b),
            });
        }

        this.cursorY -= headerHeight;

        // Draw Rows
        for (let r = 0; r < table.rows.length; r++) {
            this.ensureSpace(rowHeight + 4);
            const rowPage = this.currentPage;
            const isAlt = r % 2 === 1;

            if (isAlt) {
                rowPage.drawRectangle({
                    x: tableStartX,
                    y: this.cursorY - rowHeight,
                    width: this.bounds.contentWidth,
                    height: rowHeight,
                    color: rgb(THEME.bgTableRowAlt.r, THEME.bgTableRowAlt.g, THEME.bgTableRowAlt.b),
                });
            }

            // Bottom border line
            rowPage.drawLine({
                start: { x: tableStartX, y: this.cursorY - rowHeight },
                end: { x: tableStartX + this.bounds.contentWidth, y: this.cursorY - rowHeight },
                thickness: 0.5,
                color: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
            });

            const row = table.rows[r];
            for (let c = 0; c < numCols; c++) {
                const cell = row[c];
                const cellText = cell?.text || "";
                rowPage.drawText(cellText, {
                    x: tableStartX + c * colWidth + padX,
                    y: this.cursorY - rowHeight + 7,
                    size: 9.0,
                    font: this.fontRegular,
                    color: rgb(THEME.textBody.r, THEME.textBody.g, THEME.textBody.b),
                });
            }

            this.cursorY -= rowHeight;
        }

        this.cursorY -= 12;
    }

    renderHr(): void {
        this.ensureSpace(16);
        const page = this.currentPage;
        const lineY = this.cursorY - 8;
        page.drawLine({
            start: { x: this.bounds.x, y: lineY },
            end: { x: this.bounds.x + this.bounds.contentWidth, y: lineY },
            thickness: 0.75,
            color: rgb(THEME.border.r, THEME.border.g, THEME.border.b),
        });
        this.cursorY -= 16;
    }

    async renderImage(imgToken: Tokens.Image): Promise<void> {
        const href = imgToken.href || "";

        // Embedded base64 Data URIs (PNG or JPEG)
        if (href.startsWith("data:image/png;base64,") || href.startsWith("data:image/jpeg;base64,") || href.startsWith("data:image/jpg;base64,")) {
            try {
                const base64Data = href.substring(href.indexOf(",") + 1);
                const binaryStr = atob(base64Data);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }

                const isPng = href.startsWith("data:image/png");
                const embeddedImage = isPng ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);

                const origWidth = embeddedImage.width;
                const origHeight = embeddedImage.height;
                const maxWidth = this.bounds.contentWidth;
                const maxHeight = 280;

                let drawWidth = origWidth;
                let drawHeight = origHeight;

                if (drawWidth > maxWidth) {
                    const scale = maxWidth / drawWidth;
                    drawWidth = maxWidth;
                    drawHeight = drawHeight * scale;
                }

                if (drawHeight > maxHeight) {
                    const scale = maxHeight / drawHeight;
                    drawHeight = maxHeight;
                    drawWidth = drawWidth * scale;
                }

                this.ensureSpace(drawHeight + 14);
                const page = this.currentPage;
                page.drawImage(embeddedImage, {
                    x: this.bounds.x + (this.bounds.contentWidth - drawWidth) / 2,
                    y: this.cursorY - drawHeight,
                    width: drawWidth,
                    height: drawHeight,
                });

                this.cursorY -= drawHeight + 12;
                return;
            } catch (err) {
                console.warn("[MarkdownPdfEngine] Failed to decode base64 image data URI:", err);
            }
        }

        // External image URL -> Zero network requests, safe offline fallback label
        const spans: InlineSpan[] = [
            {
                text: `[Image: ${imgToken.text || "image"}]`,
                italic: true,
                color: THEME.textMuted,
            },
        ];
        this.renderInlineParagraph(spans, { marginBottom: 8 });
    }

    async renderToken(token: Tokens.Generic): Promise<void> {
        switch (token.type) {
            case "heading":
                this.renderHeading(token as Tokens.Heading);
                break;
            case "paragraph":
                this.renderParagraph(token as Tokens.Paragraph);
                break;
            case "blockquote":
                this.renderBlockquote(token as Tokens.Blockquote);
                break;
            case "code":
                this.renderCodeBlock(token as Tokens.Code);
                break;
            case "list":
                this.renderList(token as Tokens.List);
                break;
            case "table":
                this.renderTable(token as Tokens.Table);
                break;
            case "hr":
                this.renderHr();
                break;
            case "image":
                await this.renderImage(token as Tokens.Image);
                break;
            case "space":
                // Handled in block margins
                break;
            case "html": {
                const raw = (token as Tokens.HTML).text || "";
                const sanitized = raw.replace(/<[^>]*>/g, " ").trim();
                if (sanitized) {
                    this.renderInlineParagraph([{ text: sanitized }], { marginBottom: 6 });
                }
                break;
            }
            default:
                if ((token as any).tokens) {
                    for (const child of (token as any).tokens) {
                        await this.renderToken(child);
                    }
                }
                break;
        }
    }

    async renderDocument(tokens: Tokens.Generic[]): Promise<void> {
        this.allocatePage();
        for (const token of tokens) {
            await this.renderToken(token);
        }
    }
}

export async function executeMarkdownToPdf(file: File, options?: MarkdownToPdfOptions): Promise<Blob> {
    if (!file || file.size === 0) {
        throw new ExecutionError("INVALID_INPUT", "Provided Markdown file is empty or missing.");
    }

    let markdownSource: string;
    try {
        markdownSource = await file.text();
    } catch (err) {
        throw new ExecutionError("INVALID_INPUT", "Failed to read Markdown file text content.", err);
    }

    if (!markdownSource && markdownSource !== "") {
        throw new ExecutionError("INVALID_INPUT", "Markdown file contains no readable text content.");
    }

    // Assert font compatibility (non-Latin Unicode throws UNSUPPORTED_CLIENT_OP for Auto fallback)
    assertLatinFontCompatibility(markdownSource);

    // Lex AST
    const tokens = marked.lexer(markdownSource, { gfm: true, breaks: false }) as Tokens.Generic[];

    const pdfDoc = await PDFDocument.create();
    const engine = new MarkdownPdfEngine(pdfDoc, options);
    await engine.init();
    await engine.renderDocument(tokens);

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
