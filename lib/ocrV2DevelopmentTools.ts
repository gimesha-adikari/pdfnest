/**
 * Temporary inventory for the OCR V2 development surface.
 *
 * The dedicated OCR V2 landing entries are intentionally kept out of the
 * public tool catalog while their direct routes remain functional. This list
 * is the single source for the private developing-tools page and for the
 * route metadata fallback used by those direct routes.
 */

export type OcrV2DevelopmentSurface = {
    id: string;
    title: string;
    description: string;
    href: string;
    publicHref: string;
    category: "convert" | "create" | "edit" | "studio";
    iconName: string;
    accept: string;
    multiple: boolean;
    toolPolicy: "BACKEND_ONLY" | "CLIENT_PREFERRED";
    kind: "dedicated" | "shared" | "stable" | "hybrid";
    classification: string;
    discovery: "hidden-from-public-catalog" | "public-shared-route" | "public-stable-route" | "public-hybrid-route";
    notes: string;
};

export const OCR_V2_DEDICATED_TOOL_IDS = [
    "ocr-text-v2",
    "searchable-pdf-v2",
    "document-extraction-v2",
    "pdf-to-markdown-v2",
    "highlight-pdf-v2",
    "underline-pdf-v2",
    "strikeout-pdf-v2",
] as const;

export const OCR_V2_DEVELOPMENT_TOOLS: readonly OcrV2DevelopmentSurface[] = [
    {
        id: "ocr-text-v2",
        title: "OCR Text V2",
        description: "Extract copyable text from native or scanned PDFs with the durable OCR Text V2 workflow.",
        href: "/ocr-text-v2",
        publicHref: "/ocr-text-v2",
        category: "convert",
        iconName: "ScanText",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated OCR V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "searchable-pdf-v2",
        title: "Searchable PDF V2",
        description: "Create a searchable PDF from ordered image pages while preserving the visual page layer.",
        href: "/searchable-pdf-v2",
        publicHref: "/searchable-pdf-v2",
        category: "create",
        iconName: "ScanSearch",
        accept: "image/jpeg, image/png, image/webp",
        multiple: true,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated OCR V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "document-extraction-v2",
        title: "Document Extraction V2",
        description: "Extract structured sections, lists, tables, and document content from native or scanned PDFs.",
        href: "/document-extraction-v2",
        publicHref: "/document-extraction-v2",
        category: "convert",
        iconName: "FileSearch",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated structured OCR V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "pdf-to-markdown-v2",
        title: "PDF to Markdown V2",
        description: "Convert native, scanned, and mixed PDFs to structured Markdown with durable processing.",
        href: "/pdf-to-markdown-v2",
        publicHref: "/pdf-to-markdown-v2",
        category: "convert",
        iconName: "FileCode",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated structured OCR V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "highlight-pdf-v2",
        title: "Highlight PDF V2",
        description: "Select native or scanned text visually and apply durable Highlight markup.",
        href: "/highlight-pdf-v2",
        publicHref: "/highlight-pdf-v2",
        category: "edit",
        iconName: "Highlighter",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated OCR-aware markup V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "underline-pdf-v2",
        title: "Underline PDF V2",
        description: "Select native or scanned text visually and apply durable Underline markup.",
        href: "/underline-pdf-v2",
        publicHref: "/underline-pdf-v2",
        category: "edit",
        iconName: "Underline",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated OCR-aware markup V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "strikeout-pdf-v2",
        title: "Strikeout PDF V2",
        description: "Select native or scanned text visually and apply durable Strikeout markup.",
        href: "/strikeout-pdf-v2",
        publicHref: "/strikeout-pdf-v2",
        category: "edit",
        iconName: "Strikethrough",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "dedicated",
        classification: "MIGRATED_SDK_CONSUMER",
        discovery: "hidden-from-public-catalog",
        notes: "Dedicated OCR-aware markup V2 route; public catalog entry is temporarily hidden.",
    },
    {
        id: "general-editor-ocr-v2",
        title: "General Editor OCR V2",
        description: "Open the shared PDF Editor route with the OCR V2 editor extraction path enabled.",
        href: "/edit-pdf?ocr_v2=1",
        publicHref: "/edit-pdf",
        category: "edit",
        iconName: "Pen",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "shared",
        classification: "MIGRATED_SDK_CONSUMER_SHARED_ROUTE",
        discovery: "public-shared-route",
        notes: "The ordinary /edit-pdf legacy entry remains public; this query selects the General Editor V2 path.",
    },
    {
        id: "pdf-to-word-ocr-fallback",
        title: "PDF to Word OCR Fallback",
        description: "Use the public PDF-to-Word product while exercising its migrated OCR fallback path.",
        href: "/pdf-to-word",
        publicHref: "/pdf-to-word",
        category: "convert",
        iconName: "FileType",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "BACKEND_ONLY",
        kind: "stable",
        classification: "MIGRATED_CONSUMER_FALLBACK_ONLY",
        discovery: "public-stable-route",
        notes: "The route remains a normal public product; only its OCR fallback is an SDK migration surface.",
    },
    {
        id: "studio-v2",
        title: "Studio V2 OCR/Document Surface",
        description: "Open the active Studio V2 document workspace whose OCR/document paths remain on their current internal implementation.",
        href: "/studio-v2",
        publicHref: "/studio-v2",
        category: "studio",
        iconName: "Layers",
        accept: ".pdf",
        multiple: false,
        toolPolicy: "CLIENT_PREFERRED",
        kind: "hybrid",
        classification: "STUDIO_ACTIVE_INTERNAL",
        discovery: "public-hybrid-route",
        notes: "Included for development visibility only; Studio is not migrated by this task.",
    },
] as const;

const hiddenHrefSet = new Set<string>(OCR_V2_DEDICATED_TOOL_IDS.map((id) => `/${id}`));

function normalizeHref(href: string): string {
    const clean = href.startsWith("/") ? href : `/${href}`;
    return clean.replace(/\/+$/, "") || "/";
}

export function isOcrV2DevelopmentToolId(toolId: string): boolean {
    return (OCR_V2_DEDICATED_TOOL_IDS as readonly string[]).includes(toolId);
}

export function isHiddenOcrV2PublicHref(href: string): boolean {
    return hiddenHrefSet.has(normalizeHref(href).split("?")[0]);
}

export function getOcrV2DevelopmentSurfaceByHref(href: string): OcrV2DevelopmentSurface | undefined {
    const normalized = normalizeHref(href).split("?")[0];
    return OCR_V2_DEVELOPMENT_TOOLS.find((surface) => surface.publicHref === normalized);
}

export function getOcrV2DevelopmentRouteConfig(toolId: string): OcrV2DevelopmentSurface | undefined {
    return OCR_V2_DEVELOPMENT_TOOLS.find((surface) => surface.id === toolId && surface.kind === "dedicated");
}
