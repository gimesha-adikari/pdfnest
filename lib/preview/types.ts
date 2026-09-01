export interface DocumentHandle {
    id: string;
    version: string;
    pageCount: number;
    fingerprint?: string;
    file?: File;
}

export type PreviewMode = "thumbnail" | "small" | "page" | "large" | "full";

export type PreviewRendererPreference = "auto" | "client" | "server";

export type PreviewPriority = "critical" | "normal" | "background";

export interface PreviewRequest {
    document: DocumentHandle;
    page: number;
    mode?: PreviewMode;
    renderer?: PreviewRendererPreference;
    width?: number;
    height?: number;
    priority?: PreviewPriority;
    scale?: number;
}

export type PreviewKey = string;

export function createPreviewKey(request: PreviewRequest): PreviewKey {
    const parts = [
        request.document.id,
        request.document.version,
        `p${request.page}`,
        `m_${request.mode ?? "page"}`,
        `r_${request.renderer ?? "auto"}`,
    ];

    if (request.scale !== undefined) {
        parts.push(`s_${request.scale}`);
    }

    if (request.width !== undefined || request.height !== undefined) {
        parts.push(`dim_${request.width ?? 0}x${request.height ?? 0}`);
    }

    return parts.join(":");
}

export type PreviewResourceType = "image-url" | "canvas";

/** Safe metadata supplied with a processed preview resource. */
export interface PreviewMetadata {
    /** Backend-authoritative 1-based document page count, when available. */
    pageCount?: number;
    /** 1-based page represented by this resource. */
    page?: number;
    /** Rendered raster dimensions in pixels, when known. */
    renderedWidth?: number;
    renderedHeight?: number;
}

export interface PreviewResource {
    type: PreviewResourceType;
    url?: string;
    canvas?: HTMLCanvasElement;
    width?: number;
    height?: number;
    /** Identifier of the actual renderer that produced this resource */
    renderedBy?: string;
    metadata?: PreviewMetadata;
    revoke?: () => void;
}

export type PreviewStatus = "idle" | "loading" | "success" | "error";

export interface PreviewError {
    code: string;
    message: string;
    status?: number;
    cause?: unknown;
}

export interface PreviewResult {
    status: PreviewStatus;
    resource: PreviewResource | null;
    error: PreviewError | null;
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
}

export interface PreviewRenderer {
    readonly id: string;
    /** Renderer capability flags */
    readonly capabilities: {
        client: boolean; // can render client‑side preview
        server: boolean; // can render server‑side preview
    };

    canRender(request: PreviewRequest): boolean;

    render(
        request: PreviewRequest,
        signal: AbortSignal
    ): Promise<PreviewResource>;
}

export const PREVIEW_SAFETY_THRESHOLDS = {
    LARGE_PAGE_COUNT: 100,
    LARGE_FILE_SIZE_BYTES: 15 * 1024 * 1024, // 15MB
    HUGE_PAGE_COUNT: 500,
    HUGE_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
} as const;

export type PdfSafetyCategory = "normal" | "large" | "huge";

export function getPdfSafetyCategory(file: File | null, pageCount?: number): PdfSafetyCategory {
    if (!file) return "normal";
    const size = file.size;
    const count = pageCount ?? 0;

    if (count > PREVIEW_SAFETY_THRESHOLDS.HUGE_PAGE_COUNT || size > PREVIEW_SAFETY_THRESHOLDS.HUGE_FILE_SIZE_BYTES) {
        return "huge";
    }
    if (count > PREVIEW_SAFETY_THRESHOLDS.LARGE_PAGE_COUNT || size > PREVIEW_SAFETY_THRESHOLDS.LARGE_FILE_SIZE_BYTES) {
        return "large";
    }
    return "normal";
}
