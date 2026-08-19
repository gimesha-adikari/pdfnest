"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { NAV_TOOLS_FALLBACK, ToolItem, isToolAvailableOffline } from "@/lib/toolsData";
import { normalizeTool, mergeToolCatalog } from "@/lib/server/tools";
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
    const staticNormalized = useMemo(
        () => NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null),
        []
    );

    const [tools, setTools] = useState<ToolItem[]>(() => {
        const raw = initialTools && initialTools.length > 0
            ? initialTools.map(normalizeTool).filter((t): t is ToolItem => t !== null)
            : staticNormalized;
        return mergeToolCatalog(raw, staticNormalized);
    });
    const [isLoading, setIsLoading] = useState<boolean>(!initialTools || initialTools.length === 0);

    const { isAvailable, status } = useBackendHealth();

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
                    const backendNormalized = data
                        .filter((t) => t.isActive !== false && t.is_active !== false && t.IsActive !== false)
                        .map(normalizeTool)
                        .filter((t): t is ToolItem => t !== null);

                    const merged = mergeToolCatalog(backendNormalized, staticNormalized);
                    if (merged.length > 0) {
                        setTools(merged);
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
    }, [initialTools, staticNormalized]);

    const getToolByHref = (href: string) => {
        const cleanHref = href.startsWith("/") ? href : `/${href}`;
        // Always search the full tools list so backend-only tool pages can still resolve metadata
        return tools.find((t) => t.href === cleanHref || (t as any).Href === cleanHref);
    };

    /**
     * displayTools: the list to show in navigation, search, command palette, and directories.
     * When the backend is available (or status is unknown) all tools are shown.
     * When the backend is confirmed offline only client-capable tools appear.
     */
    const displayTools = useMemo(() => {
        if (status !== "offline") return tools;
        return tools.filter(isToolAvailableOffline);
    }, [tools, status]);

    const isOfflineMode = status === "offline";
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

