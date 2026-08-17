import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
    MarginsPoints,
    PageDimensions,
    PAPER_DIMENSIONS,
    PaperSize,
    RGBColor,
    TokenRun,
    hexToRgb,
    inchesToPoints,
    parseMarginsInches,
    parsePaperSize,
} from "./types";

export interface LayoutEngineConfig {
    paperSize?: string;
    margins?: {
        top?: number | string;
        bottom?: number | string;
        left?: number | string;
        right?: number | string;
    };
    fontSize?: number;
    lineHeight?: number;
    codeSurfacePadding?: number;
}

export class PdfLayoutEngine {
    private doc: PDFDocument;
    private fontRegular!: PDFFont;
    private fontBold!: PDFFont;
    private paperSize: PaperSize;
    private pageDimensions: PageDimensions;
    private margins: MarginsPoints;
    private fontSize: number;
    private lineHeight: number;
    private linePitch: number;
    private codeSurfacePadding: number;

    private pages: PDFPage[] = [];
    private currentPageIndex = -1;
    private cursorX = 0;
    private cursorY = 0;

    // Palette
    private readonly bgPageColor = hexToRgb("#1e1e24");
    private readonly bgCodeColor = hexToRgb("#18181c");
    private readonly borderCodeColor = hexToRgb("#2d2d34");

    constructor(doc: PDFDocument, config?: LayoutEngineConfig) {
        this.doc = doc;
        this.paperSize = parsePaperSize(config?.paperSize);
        this.pageDimensions = PAPER_DIMENSIONS[this.paperSize];
        this.margins = inchesToPoints(parseMarginsInches(config?.margins));
        this.fontSize = config?.fontSize ?? 10;
        this.lineHeight = config?.lineHeight ?? 1.45;
        this.linePitch = this.fontSize * this.lineHeight;
        this.codeSurfacePadding = config?.codeSurfacePadding ?? 14;
    }

    async init(): Promise<void> {
        this.fontRegular = await this.doc.embedFont(StandardFonts.Courier);
        this.fontBold = await this.doc.embedFont(StandardFonts.CourierBold);
    }

    getPrintableBounds(): {
        x: number;
        y: number;
        width: number;
        height: number;
        contentWidth: number;
    } {
        const x = this.margins.left;
        const width = this.pageDimensions.width - this.margins.left - this.margins.right;
        const height = this.pageDimensions.height - this.margins.top - this.margins.bottom;
        const y = this.margins.bottom;
        const contentWidth = Math.max(10, width - this.codeSurfacePadding * 2);

        return { x, y, width, height, contentWidth };
    }

    allocatePage(): PDFPage {
        const page = this.doc.addPage([this.pageDimensions.width, this.pageDimensions.height]);
        this.pages.push(page);
        this.currentPageIndex = this.pages.length - 1;

        // 1. Draw Page Background (#1e1e24)
        page.drawRectangle({
            x: 0,
            y: 0,
            width: this.pageDimensions.width,
            height: this.pageDimensions.height,
            color: rgb(this.bgPageColor.r, this.bgPageColor.g, this.bgPageColor.b),
        });

        // 2. Draw Code Surface (#18181c) with Border (#2d2d34)
        const bounds = this.getPrintableBounds();
        page.drawRectangle({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            color: rgb(this.bgCodeColor.r, this.bgCodeColor.g, this.bgCodeColor.b),
            borderColor: rgb(this.borderCodeColor.r, this.borderCodeColor.g, this.borderCodeColor.b),
            borderWidth: 1,
        });

        // Reset cursor to top-left of content area
        this.cursorX = bounds.x + this.codeSurfacePadding;
        this.cursorY = this.pageDimensions.height - this.margins.top - this.codeSurfacePadding - this.fontSize;

        return page;
    }

    getCurrentPage(): PDFPage {
        if (this.currentPageIndex < 0 || this.pages.length === 0) {
            return this.allocatePage();
        }
        return this.pages[this.currentPageIndex];
    }

    getCharWidth(bold = false): number {
        const font = bold ? this.fontBold : this.fontRegular;
        return font.widthOfTextAtSize("M", this.fontSize);
    }

    measureTextWidth(text: string, bold = false): number {
        const font = bold ? this.fontBold : this.fontRegular;
        return font.widthOfTextAtSize(text, this.fontSize);
    }

    checkPageBreak(requiredHeight?: number): boolean {
        const height = requiredHeight ?? this.linePitch;
        const bottomLimit = this.margins.bottom + this.codeSurfacePadding;

        if (this.cursorY - height < bottomLimit) {
            this.allocatePage();
            return true;
        }
        return false;
    }

    drawTokenRun(run: TokenRun): void {
        const page = this.getCurrentPage();
        const font = run.bold ? this.fontBold : this.fontRegular;

        page.drawText(run.text, {
            x: this.cursorX,
            y: this.cursorY,
            size: this.fontSize,
            font,
            color: rgb(run.color.r, run.color.g, run.color.b),
        });

        const textWidth = font.widthOfTextAtSize(run.text, this.fontSize);
        this.cursorX += textWidth;
    }

    advanceLine(): void {
        const bounds = this.getPrintableBounds();
        this.cursorX = bounds.x + this.codeSurfacePadding;
        this.cursorY -= this.linePitch;
        this.checkPageBreak();
    }

    getPageCount(): number {
        return this.pages.length;
    }
}
