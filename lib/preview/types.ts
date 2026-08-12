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

export interface PreviewResource {
    type: PreviewResourceType;
    url?: string;
    canvas?: HTMLCanvasElement;
    width?: number;
    height?: number;
    /** Identifier of the actual renderer that produced this resource */
    renderedBy?: string;
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
