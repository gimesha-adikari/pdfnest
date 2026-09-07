"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type ToolPolicy } from "@/lib/execution/types";
import { useBackendHealth } from "@/context/BackendHealthContext";

interface BackendOnlyToolGuardProps {
    toolPolicy?: ToolPolicy;
    children: ReactNode;
}

interface BackendOnlyToolAvailability {
    isBackendOnly: boolean;
    isExecutable: boolean;
}

const BackendOnlyToolAvailabilityContext = createContext<BackendOnlyToolAvailability>({
    isBackendOnly: false,
    isExecutable: true,
});

export function useBackendOnlyToolAvailability() {
    return useContext(BackendOnlyToolAvailabilityContext);
}

/**
 * Provides execution availability to the interactive surface only. Public tool
 * content remains mounted so runtime health cannot change crawlable SEO content.
 */
export function BackendOnlyToolGuard({
    toolPolicy,
    children,
}: BackendOnlyToolGuardProps) {
    const { isAvailable } = useBackendHealth();

    const isBackendOnly =
        toolPolicy === "BACKEND_ONLY" || toolPolicy === "SECURITY_CRITICAL_BACKEND";

    return (
        <BackendOnlyToolAvailabilityContext.Provider
            value={{
                isBackendOnly,
                isExecutable: !isBackendOnly || isAvailable,
            }}
        >
            {children}
        </BackendOnlyToolAvailabilityContext.Provider>
    );
}
