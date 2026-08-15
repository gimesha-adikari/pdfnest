"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { NAV_TOOLS_FALLBACK, ToolItem, isToolAvailableOffline } from "@/lib/toolsData";
import { normalizeTool } from "@/lib/server/tools";
import { useBackendHealth } from "@/context/BackendHealthContext";

interface ToolContextType {
    tools: ToolItem[];
    /** Offline-filtered subset: only genuinely offline-capable tools when backend is unavailable. */
    displayTools: ToolItem[];
    isLoading: boolean;
    totalCount: number;
    availableCount: number;
    isOfflineMode: boolean;
    getToolByHref: (href: string) => ToolItem | undefined;
}

const ToolContext = createContext<ToolContextType | undefined>(undefined);


export function ToolProvider({
    children,
    initialTools,
}: {
    children: React.ReactNode;
    initialTools?: ToolItem[];
}) {
    const [tools, setTools] = useState<ToolItem[]>(() => {
        const raw = initialTools && initialTools.length > 0 ? initialTools : NAV_TOOLS_FALLBACK;
        return raw.map(normalizeTool).filter((t): t is ToolItem => t !== null);
    });
    const [isLoading, setIsLoading] = useState<boolean>(!initialTools || initialTools.length === 0);

    const { isAvailable } = useBackendHealth();

    useEffect(() => {
        if (initialTools && initialTools.length > 0) {
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        setIsLoading(true);

        fetchJson<any[]>("/site-content/tools")
            .then((data) => {
                if (isMounted && Array.isArray(data) && data.length > 0) {
                    const normalized = data
                        .filter((t) => t.isActive !== false && t.is_active !== false && t.IsActive !== false)
                        .map(normalizeTool)
                        .filter((t): t is ToolItem => t !== null);

                    if (normalized.length > 0) {
                        setTools(normalized);
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to load CMS tools in ToolProvider:", err);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [initialTools]);

    const getToolByHref = (href: string) => {
        const cleanHref = href.startsWith("/") ? href : `/${href}`;
        // Always search the full tools list so backend-only tool pages can still resolve metadata
        return tools.find((t) => t.href === cleanHref || (t as any).Href === cleanHref);
    };

    /**
     * displayTools: the list to show in navigation, search, command palette, and directories.
     * When the backend is available (or unknown) all tools are shown.
     * When the backend is confirmed offline only client-capable tools appear.
     */
    const displayTools = useMemo(() => {
        if (isAvailable) return tools;
        return tools.filter(isToolAvailableOffline);
    }, [tools, isAvailable]);

    const isOfflineMode = !isAvailable;
    const totalCount = tools.length;
    const availableCount = displayTools.length;

    const value = useMemo(
        () => ({
            tools,
            displayTools,
            isLoading,
            totalCount,
            availableCount,
            isOfflineMode,
            getToolByHref,
        }),
        [tools, displayTools, isLoading, totalCount, availableCount, isOfflineMode]
    );

    return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;

}

export function useTools() {
    const context = useContext(ToolContext);
    if (!context) {
        throw new Error("useTools must be used within a ToolProvider");
    }
    return context;
}

