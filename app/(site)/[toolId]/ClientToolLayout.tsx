"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { NAV_TOOLS } from "@/lib/toolsData";
import ToolFAQ from "@/components/SEO/ToolFAQ";
import { fetchJson } from "@/lib/api";
import ToolSchema from "@/components/SEO/ToolSchema";

interface ToolItem {
    title: string;
    description: string;
    href: string;
    category: string;
    icon?: any;
    multiple?: boolean;
    accept?: string;
    isNew?: boolean;
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
}

interface ToolConfig {
    name: string;
    description: string;
    icon: any;
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

const ToolContext = createContext<ToolContextProps | undefined>(undefined);

export function useSharedTool() {
    const context = useContext(ToolContext);
    if (!context) throw new Error("useSharedTool must be used within a ToolProvider");
    return context;
}

export default function ClientToolLayout({ children }: { children: ReactNode }) {
    const params = useParams();
    const rawToolId = params?.toolId;
    const toolId = Array.isArray(rawToolId) ? rawToolId[0] : rawToolId || "";

    const [file, setFile] = useState<File | null>(null);
    const [downloadData, setDownloadData] = useState<{ blob: Blob; fileName: string } | null>(null);

    const localFallback = NAV_TOOLS.find((t) => t.href === `/${toolId}`) as ToolItem | undefined;
    const initialConfig: ToolConfig = {
        name: localFallback?.title || "PDF Tool",
        description: localFallback?.description || "Process your PDF files securely.",
        icon: localFallback?.icon || null,
        multiple: localFallback?.multiple || false,
        accept: localFallback?.accept || ".pdf",
    };

    const [toolConfig, setToolConfig] = useState<ToolConfig>(initialConfig);
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);

    useEffect(() => {
        let cancelled = false;

        setIsLoadingConfig(true);

        fetchJson("/site-content/tools")
            .then((data: unknown) => {
                if (cancelled) return;

                const activeFallback = NAV_TOOLS.find((t) => t.href === `/${toolId}`) as ToolItem | undefined;

                if (Array.isArray(data) && data.length > 0) {
                    const tools = data as BackendTool[];
                    const found = tools.find((t) => (t.Href || t.href) === `/${toolId}`);

                    if (found) {
                        setToolConfig({
                            name:
                                found.Name ||
                                found.name ||
                                found.Title ||
                                found.title ||
                                activeFallback?.title ||
                                "PDF Tool",
                            description:
                                found.Description ||
                                found.description ||
                                activeFallback?.description ||
                                "Process files securely.",
                            icon: found.Icon || found.icon || activeFallback?.icon || null,
                            multiple:
                                found.Multiple !== undefined
                                    ? found.Multiple
                                    : found.multiple !== undefined
                                        ? found.multiple
                                        : activeFallback?.multiple || false,
                            accept: found.Accept || found.accept || activeFallback?.accept || ".pdf",
                        });
                        return;
                    }
                }

                if (activeFallback) {
                    setToolConfig({
                        name: activeFallback.title,
                        description: activeFallback.description,
                        icon: activeFallback.icon || null,
                        multiple: activeFallback.multiple || false,
                        accept: activeFallback.accept || ".pdf",
                    });
                }
            })
            .catch((err) => {
                if (cancelled) return;

                console.error("Error fetching remote tool config, falling back:", err);
                const activeFallback = NAV_TOOLS.find((t) => t.href === `/${toolId}`) as ToolItem | undefined;

                if (activeFallback) {
                    setToolConfig({
                        name: activeFallback.title,
                        description: activeFallback.description,
                        icon: activeFallback.icon || null,
                        multiple: activeFallback.multiple || false,
                        accept: activeFallback.accept || ".pdf",
                    });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingConfig(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [toolId]);

    return (
        <ToolContext.Provider
            value={{
                toolId,
                toolConfig,
                file,
                setFile,
                downloadData,
                setDownloadData,
                isLoadingConfig,
            }}
        >
            <ToolSchema toolHref={`/${toolId}`} />
            {children}
            <ToolFAQ toolHref={`/${toolId}`} />
        </ToolContext.Provider>
    );
}