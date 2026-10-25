"use client";

import {
    createContext,
    useContext,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import { useParams, usePathname, notFound } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTools } from "@/context/ToolContext";
import ToolFAQ from "@/components/SEO/ToolFAQ";
import ToolSchema from "@/components/SEO/ToolSchema";
import { resolveIcon, type LucideIcon } from "@/lib/iconResolver";
import { BackendOnlyToolGuard } from "@/components/pdf/BackendOnlyToolGuard";
import { RepositoryAnalyzerProvider } from "@/context/RepositoryAnalyzerContext";
import { getOcrV2DevelopmentRouteConfig } from "@/lib/ocrV2DevelopmentTools";
import { type EditPdfEditorEngine, resolveEditPdfEditorEngine } from "@/lib/editPdfEngine";
import {
    capturePdfResultProvenance,
    type PdfResultProvenance,
} from "@/lib/security/pdfInputPreparation";

export type ToolDownloadData = {
    blob: Blob;
    fileName: string;
    provenance: PdfResultProvenance;
    source?: { file: File; generation: object };
};

type ToolDownloadDataInput = Omit<ToolDownloadData, "provenance"> & { provenance?: PdfResultProvenance };

interface ToolItem {
    title: string;
    description: string;
    href: string;
    category: string;
    icon?: any;
    multiple?: boolean;
    accept?: string;
    isNew?: boolean;
    related?: string[];
}

interface BackendTool {
    Id?: string;
    id?: string;
    Title?: string;
    title?: string;
    Name?: string;
    name?: string;
    Description?: string;
    description?: string;
    Href?: string;
    href?: string;
    Category?: string;
    category?: string;
    Icon?: string | null;
    icon?: string | null;
    Multiple?: boolean;
    multiple?: boolean;
    Accept?: string;
    accept?: string;
    IsNew?: boolean;
    isNew?: boolean;
    RelatedJson?: string;
    related?: string[] | string;
}

interface ToolConfig {
    name: string;
    description: string;
    icon: LucideIcon;
    multiple: boolean;
    accept: string;
}

interface ToolContextProps {
    toolId: string;
    toolConfig: ToolConfig;
    file: File | null;
    setFile: (file: File | null) => void;
    downloadData: ToolDownloadData | null;
    setDownloadData: (data: ToolDownloadDataInput | null) => void;
    conversionGeneration: object | null;
    setConversionGeneration: (generation: object | null) => void;
    isLoadingConfig: boolean;
    editPdfEngine: EditPdfEditorEngine;
}

const SharedToolContext = createContext<ToolContextProps | undefined>(undefined);

export function useSharedTool() {
    const context = useContext(SharedToolContext);
    if (!context) throw new Error("useSharedTool must be used within a ToolProvider");
    return context;
}

interface ClientToolLayoutProps {
    children: ReactNode;
    editPdfEngine?: EditPdfEditorEngine;
}

export default function ClientToolLayout({
    children,
    editPdfEngine: initialEditPdfEngine,
}: ClientToolLayoutProps) {
    const editPdfEngine = resolveEditPdfEditorEngine(initialEditPdfEngine ?? process.env.EDIT_PDF_EDITOR_ENGINE);
    const params = useParams();
    const pathname = usePathname();
    const { cancelPendingAction } = useAuth();
    useLayoutEffect(() => {
        // Persistent tool layouts can survive workspace -> download navigation.
        // Invalidate delayed actions on that transition as well as unmount.
        cancelPendingAction();
        return cancelPendingAction;
    }, [pathname, cancelPendingAction]);
    const { getToolByHref, tools: allTools, isLoading: isLoadingTools } = useTools();
    const rawToolId = params?.toolId;
    const toolId = Array.isArray(rawToolId) ? rawToolId[0] : rawToolId || "";
    const currentToolHref = `/${toolId}`;

    const [fileState, setFileState] = useState<File | null>(null);
    const currentInputRef = useRef<File | null>(null);
    const [activeToolHref, setActiveToolHref] = useState<string | null>(null);
    const [downloadData, setDownloadDataState] = useState<ToolDownloadData | null>(null);

    const setDownloadData = useCallback((data: ToolDownloadDataInput | null) => {
        if (data && currentInputRef.current !== fileState) return;
        setDownloadDataState(data ? {
            ...data,
            provenance: data.provenance ?? capturePdfResultProvenance(
                fileState ? [fileState] : [],
                activeToolHref?.replace(/^\//, "") || toolId
            ),
        } : null);
    }, [fileState, activeToolHref, toolId]);

    const [conversionGeneration, setConversionGeneration] = useState<object | null>(null);

    const file = activeToolHref === currentToolHref ? fileState : null;

    const localFallback = getToolByHref(currentToolHref);
    const developmentFallback = getOcrV2DevelopmentRouteConfig(toolId);
    const routeFallback = localFallback || developmentFallback;
    // Extract capability policy from the static registry so the guard works
    // even before the CMS hydration completes.
    const toolPolicyValue = (routeFallback as any)?.toolPolicy ?? undefined;
    const initialConfig: ToolConfig = {
        name: routeFallback?.title || (routeFallback as any)?.Title || "PDF Tool",
        description: routeFallback?.description || (routeFallback as any)?.Description || "Process your PDF files securely.",
        icon: resolveIcon(routeFallback?.iconName || (routeFallback as any)?.IconName),
        multiple: routeFallback?.multiple || (routeFallback as any)?.Multiple || false,
        accept: routeFallback?.accept || (routeFallback as any)?.Accept || ".pdf",
    };

    const [toolConfig, setToolConfig] = useState<ToolConfig>(initialConfig);
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);

    useEffect(() => {
        const activeFallback = getToolByHref(currentToolHref) || getOcrV2DevelopmentRouteConfig(toolId);

        if (activeFallback) {
            setToolConfig({
                name: activeFallback.title || (activeFallback as any).Title || "PDF Tool",
                description: activeFallback.description || (activeFallback as any).Description || "Process files securely.",
                icon: resolveIcon(activeFallback.iconName || (activeFallback as any).IconName),
                multiple: activeFallback.multiple || (activeFallback as any).Multiple || false,
                accept: activeFallback.accept || (activeFallback as any).Accept || ".pdf",
            });
            setIsLoadingConfig(false);
            return;
        }

        const STATIC_ROUTES = [
            "/",
            "/about",
            "/admin",
            "/subscribe",
            "/pricing",
            "/terms",
            "/privacy",
            "/contact",
            "/cookies",
            "/refund",
            "/security",
            "/acceptable-use",
            "/tools",
            "/dashboard",
            "/login",
            "/register",
            "/verify-email"
        ];

        if (STATIC_ROUTES.includes(currentToolHref)) {
            setIsLoadingConfig(false);
            return;
        }

        if (!isLoadingTools) {
            notFound();
        }
    }, [currentToolHref, getToolByHref, isLoadingTools, toolId]);

    const setFile = useCallback((nextFile: File | null) => {
        if (nextFile !== currentInputRef.current) cancelPendingAction();
        currentInputRef.current = nextFile;
        if (nextFile !== fileState || toolId === "markdown-to-pdf" || toolId === "code-to-pdf") {
            setDownloadData(null);
            setConversionGeneration(null);
        }
        setFileState(nextFile);
        setActiveToolHref(nextFile ? currentToolHref : null);
    }, [fileState, toolId, currentToolHref, setDownloadData, cancelPendingAction]);

    return (
        <SharedToolContext.Provider
            value={{
                toolId,
                toolConfig,
                file,
                setFile,
                downloadData,
                setDownloadData,
                conversionGeneration,
                setConversionGeneration,
                isLoadingConfig,
                editPdfEngine,
            }}
        >
            <BackendOnlyToolGuard
                toolPolicy={toolPolicyValue}
            >
                <ToolSchema toolHref={`/${toolId}`} />
                {toolId === "repository-analyzer" ? (
                    <RepositoryAnalyzerProvider>{children}</RepositoryAnalyzerProvider>
                ) : (
                    children
                )}
                <ToolFAQ toolHref={`/${toolId}`} />
            </BackendOnlyToolGuard>
        </SharedToolContext.Provider>
    );
}
