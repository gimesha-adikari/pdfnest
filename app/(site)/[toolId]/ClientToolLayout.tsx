"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useParams, notFound } from "next/navigation";
import { useTools } from "@/context/ToolContext";
import ToolFAQ from "@/components/SEO/ToolFAQ";
import ToolSchema from "@/components/SEO/ToolSchema";
import { resolveIcon, type LucideIcon } from "@/lib/iconResolver";
import { BackendOnlyToolGuard } from "@/components/pdf/BackendOnlyToolGuard";
import { RepositoryAnalyzerProvider } from "@/context/RepositoryAnalyzerContext";

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
    downloadData: { blob: Blob; fileName: string } | null;
    setDownloadData: (data: { blob: Blob; fileName: string } | null) => void;
    isLoadingConfig: boolean;
}

const SharedToolContext = createContext<ToolContextProps | undefined>(undefined);

export function useSharedTool() {
    const context = useContext(SharedToolContext);
    if (!context) throw new Error("useSharedTool must be used within a ToolProvider");
    return context;
}

export default function ClientToolLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const { getToolByHref, tools: allTools, isLoading: isLoadingTools } = useTools();
    const rawToolId = params?.toolId;
    const toolId = Array.isArray(rawToolId) ? rawToolId[0] : rawToolId || "";
    const currentToolHref = `/${toolId}`;

    const [fileState, setFileState] = useState<File | null>(null);
    const [activeToolHref, setActiveToolHref] = useState<string | null>(null);
    const [downloadData, setDownloadData] = useState<{ blob: Blob; fileName: string } | null>(null);

    const file = activeToolHref === currentToolHref ? fileState : null;

    const localFallback = getToolByHref(currentToolHref);
    // Extract capability policy from the static registry so the guard works
    // even before the CMS hydration completes.
    const toolPolicyValue = (localFallback as any)?.toolPolicy ?? undefined;
    const initialConfig: ToolConfig = {
        name: localFallback?.title || (localFallback as any)?.Title || "PDF Tool",
        description: localFallback?.description || (localFallback as any)?.Description || "Process your PDF files securely.",
        icon: resolveIcon(localFallback?.iconName || (localFallback as any)?.IconName),
        multiple: localFallback?.multiple || (localFallback as any)?.Multiple || false,
        accept: localFallback?.accept || (localFallback as any)?.Accept || ".pdf",
    };

    const [toolConfig, setToolConfig] = useState<ToolConfig>(initialConfig);
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);

    useEffect(() => {
        const activeFallback = getToolByHref(currentToolHref);

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
    }, [currentToolHref, getToolByHref, isLoadingTools]);

    const setFile = (nextFile: File | null) => {
        setFileState(nextFile);
        setActiveToolHref(nextFile ? currentToolHref : null);
    };

    const clearFile = () => {
        setFileState(null);
        setActiveToolHref(null);
    };

    return (
        <SharedToolContext.Provider
            value={{
                toolId,
                toolConfig,
                file,
                setFile: nextFile => {
                    if (nextFile) {
                        setFileState(nextFile);
                        setActiveToolHref(currentToolHref);
                    } else {
                        clearFile();
                    }
                },
                downloadData,
                setDownloadData,
                isLoadingConfig,
            }}
        >
            <BackendOnlyToolGuard
                toolId={toolId}
                toolTitle={toolConfig.name}
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