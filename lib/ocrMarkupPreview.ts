import { getBaseUrl } from "@/lib/api";

export interface OcrMarkupPreviewWord {
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    order: number;
    confidence?: number | null;
}

export interface OcrMarkupPreviewPage {
    page_index: number;
    page_number: number;
    page_id: string;
    width: number;
    height: number;
    rotation: number;
    coordinate_space: string;
    crop_box?: number[] | null;
    classification: string;
    kind: string;
    selection_mode: "native" | "ocr";
    status: string;
    has_selectable_text: boolean;
    word_count: number;
    reading_order: string[];
    words: OcrMarkupPreviewWord[];
    language: Record<string, unknown>;
}

export interface OcrMarkupPreview {
    schema_version: string;
    profile: string;
    status: string;
    page_count: number;
    pages: OcrMarkupPreviewPage[];
}

export class OcrMarkupPreviewError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
        super(message);
        this.name = "OcrMarkupPreviewError";
    }
}

function endpoint(path: string): string {
    return `${getBaseUrl().replace(/\/+$/, "")}${path}`;
}

function messageFor(code: string): string {
    switch (code) {
        case "AUTHENTICATION_REQUIRED": return "Sign in to select text visually on scanned pages.";
        case "FORBIDDEN": return "Selectable text is not available for this document.";
        case "NETWORK_FAILURE": return "We couldn't connect to the processing service.";
        case "UNSUPPORTED_LANGUAGE": return "The selected language is not available for this document.";
        case "LANGUAGE_DETECTION_UNCERTAIN": return "We couldn't determine the document language reliably. Choose a language manually.";
        case "WORD_GEOMETRY_NOT_AVAILABLE": return "Selectable text is not available for this page. You can use Find text instead.";
        case "ENGINE_UNAVAILABLE": return "Selectable text is temporarily unavailable. You can use Find text instead.";
        case "TIMEOUT": return "Preparing selectable text took too long. You can use Find text instead.";
        case "INVALID_INPUT": return "This PDF could not be prepared for text selection.";
        default: return "We couldn't prepare selectable text. You can use Find text instead.";
    }
}

async function parseError(response: Response): Promise<OcrMarkupPreviewError> {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const detail = payload.detail && typeof payload.detail === "object" ? payload.detail as Record<string, unknown> : payload;
    const code = typeof detail.code === "string" ? detail.code : response.status === 401 ? "AUTHENTICATION_REQUIRED" : "ENGINE_FAILURE";
    return new OcrMarkupPreviewError(code, messageFor(code), response.status);
}

export async function fetchOcrMarkupPreview(file: File, language = "auto", pageIndexOrSignal?: number | AbortSignal, signal?: AbortSignal): Promise<OcrMarkupPreview> {
    const pageIndex = typeof pageIndexOrSignal === "number" ? pageIndexOrSignal : undefined;
    const requestSignal = typeof pageIndexOrSignal === "number" ? signal : pageIndexOrSignal;
    const form = new FormData();
    form.append("file", file);
    form.append("request_id", `markup-preview-${crypto.randomUUID()}`);
    form.append("profile", "MARKUP_V2");
    form.append("language", language);
    form.append("language_mode", language === "auto" ? "AUTO" : "EXPLICIT");
    if (language !== "auto") {
        for (const code of language.split("+").filter(Boolean)) form.append("languages", code);
    }
    if (pageIndex !== undefined) form.append("page_index", String(pageIndex));
    form.append("routing_policy", "FAST");

    let response: Response;
    try {
        response = await fetch(endpoint("/api/v2/ocr/markup/preview"), {
            method: "POST",
            body: form,
            credentials: "include",
            signal: requestSignal,
            headers: { "X-Request-ID": crypto.randomUUID() },
        });
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
        throw new OcrMarkupPreviewError("NETWORK_FAILURE", "We couldn't connect to the text-selection service.", 0);
    }
    if (!response.ok) throw await parseError(response);
    try {
        return await response.json() as OcrMarkupPreview;
    } catch {
        throw new OcrMarkupPreviewError("INVALID_ENGINE_OUTPUT", "We couldn't prepare selectable text.", response.status);
    }
}

export function safeOcrMarkupPreviewMessage(error: unknown): string {
    if (error instanceof OcrMarkupPreviewError) return messageFor(error.code);
    if (error instanceof DOMException && error.name === "AbortError") return "";
    return "We couldn't prepare selectable text. You can use Find text instead.";
}
