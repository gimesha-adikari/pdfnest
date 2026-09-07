"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { NAV_TOOLS_FALLBACK, ToolItem, isToolAvailableOffline } from "@/lib/toolsData";
import { normalizeTool, mergeToolCatalog } from "@/lib/server/tools";
import { useBackendHealth } from "@/context/BackendHealthContext";

export interface ToolAvailability {
    isExecutable: boolean;
    requiresBackend: boolean;
}

interface ToolContextType {
    /** Complete legitimate public catalog. Never filtered by runtime health. */
    tools: ToolItem[];
    isLoading: boolean;
    totalCount: number;
    executableCount: number;
    isOfflineMode: boolean;
    getToolByHref: (href: string) => ToolItem | undefined;
    isToolExecutable: (tool: ToolItem) => boolean;
    getToolAvailability: (tool: ToolItem) => ToolAvailability;
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

    const { status } = useBackendHealth();

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

    const getToolByHref = useCallback((href: string) => {
        const cleanHref = href.startsWith("/") ? href : `/${href}`;
        return tools.find((t) => t.href === cleanHref || (t as any).Href === cleanHref);
    }, [tools]);

    const getToolAvailability = useCallback((tool: ToolItem): ToolAvailability => {
        const requiresBackend = !isToolAvailableOffline(tool);
        return {
            requiresBackend,
            isExecutable: status !== "offline" || !requiresBackend,
        };
    }, [status]);

    const isToolExecutable = useCallback(
        (tool: ToolItem) => getToolAvailability(tool).isExecutable,
        [getToolAvailability]
    );

    const isOfflineMode = status === "offline";
    const totalCount = tools.length;
    const executableCount = useMemo(
        () => tools.filter(isToolExecutable).length,
        [tools, isToolExecutable]
    );

    const value = useMemo(
        () => ({
            tools,
            isLoading,
            totalCount,
            executableCount,
            isOfflineMode,
            getToolByHref,
            isToolExecutable,
            getToolAvailability,
        }),
        [tools, isLoading, totalCount, executableCount, isOfflineMode, getToolByHref, isToolExecutable, getToolAvailability]
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
