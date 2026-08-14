"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { fetchJson } from "@/lib/api";
import { NAV_TOOLS_FALLBACK, ToolItem } from "@/lib/toolsData";
import { normalizeTool } from "@/lib/server/tools";

interface ToolContextType {
    tools: ToolItem[];
    isLoading: boolean;
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
        return tools.find((t) => t.href === cleanHref || (t as any).Href === cleanHref);
    };

    const value = useMemo(
        () => ({
            tools,
            isLoading,
            getToolByHref,
        }),
        [tools, isLoading]
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
