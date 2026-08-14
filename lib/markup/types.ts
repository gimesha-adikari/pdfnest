export type MarkupKind = "highlight" | "underline" | "strikeout";

export type MarkupMode = "smart" | "manual" | "ocr";

export type PageKind = "text" | "scanned" | "mixed" | "blank" | "unknown";

export interface CustomPdfFile extends File {
    originalPassword?: string;
}

export interface MarkupBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    color: string;
}

export interface PageAnalysis {
    page: number;
    kind: PageKind;
    hasSelectableText: boolean;
    wordCount: number;
    textBlockCount: number;
    imageBlockCount: number;
    textAreaRatio: number;
    imageAreaRatio: number;
}

export interface PDFAnalysis {
    pageCount: number;
    pages: PageAnalysis[];
}

export interface JobSubmissionResponse {
    success?: boolean;
    job_id: string;
    status: string;
    queue_name: string;
}

export interface JobRecord {
    id: string;
    job_type: string;
    status: string;
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: string | null;
    cancel_requested: boolean;
}

export interface PdfJsRenderTask {
    cancel: () => void;
    promise: Promise<void>;
}

export interface PdfJsPage {
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => PdfJsRenderTask;
}

export interface PdfJsDocument {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

export function prettyKind(kind: PageKind | null | undefined) {
    switch (kind) {
        case "text":
            return "Text";
        case "scanned":
            return "Scanned";
        case "mixed":
            return "Mixed";
        case "blank":
            return "Blank";
        default:
            return "Unknown";
    }
}
