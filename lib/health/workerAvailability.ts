import { type ToolPolicy } from "@/lib/execution/types";
import { type WorkerCapabilities, type WorkerReadiness } from "@/lib/health/backendHealth";

export type WorkerCapability = keyof WorkerCapabilities;

const WORKER_CAPABILITY_BY_TOOL: Record<string, WorkerCapability> = {
    word_to_pdf: "office_to_pdf",
    excel_to_pdf: "office_to_pdf",
    powerpoint_to_pdf: "office_to_pdf",
    pdf_to_word: "pdf_to_office",
    pdf_to_excel: "pdf_to_office",
    pdf_to_powerpoint: "pdf_to_office",
    image_to_searchable_pdf: "ocr",
    ocr_extract: "ocr",
    image_to_text: "ocr",
    ocr_text_v2: "ocr",
    searchable_pdf_v2: "ocr",
    document_extraction_v2: "ocr",
    pdf_to_markdown: "ocr",
    pdf_to_markdown_v2: "ocr",
    highlight_pdf_v2: "ocr",
    underline_pdf_v2: "ocr",
    strikeout_pdf_v2: "ocr",
    edit_pdf: "document_processing",
    redact_pdf: "document_processing",
};

export function requiredWorkerCapability(toolId: string): WorkerCapability | null {
    return WORKER_CAPABILITY_BY_TOOL[toolId.trim().toLowerCase().replaceAll("-", "_")] ?? null;
}

export function isWorkerCapabilityAvailable(
    capability: WorkerCapability,
    workerReadiness: WorkerReadiness,
    workerCapabilities: WorkerCapabilities | null,
): boolean {
    return workerReadiness === "ready" && workerCapabilities?.[capability] === true;
}

export function isToolExecutable(input: {
    toolId: string;
    toolPolicy?: ToolPolicy;
    backendAvailable: boolean;
    workerCapabilities: WorkerCapabilities | null;
}): boolean {
    const requiresBackend = input.toolPolicy === "BACKEND_ONLY" || input.toolPolicy === "SECURITY_CRITICAL_BACKEND";
    if (requiresBackend && !input.backendAvailable) return false;

    const requiredCapability = requiredWorkerCapability(input.toolId);
    return requiredCapability === null || input.workerCapabilities?.[requiredCapability] === true;
}
