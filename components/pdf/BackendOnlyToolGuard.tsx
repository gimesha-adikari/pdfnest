"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type ToolPolicy } from "@/lib/execution/types";
import { useBackendHealth } from "@/context/BackendHealthContext";
import { isToolExecutable, requiredWorkerCapability } from "@/lib/health/workerAvailability";

interface BackendOnlyToolGuardProps {
    toolPolicy?: ToolPolicy;
    toolId: string;
    children: ReactNode;
}

interface BackendOnlyToolAvailability {
    isBackendOnly: boolean;
    isExecutable: boolean;
    unavailableService: "backend" | "worker" | null;
}

const BackendOnlyToolAvailabilityContext = createContext<BackendOnlyToolAvailability>({
    isBackendOnly: false,
    isExecutable: true,
    unavailableService: null,
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
    toolId,
    children,
}: BackendOnlyToolGuardProps) {
    const { isAvailable, workerCapabilities } = useBackendHealth();

    const isBackendOnly =
        toolPolicy === "BACKEND_ONLY" || toolPolicy === "SECURITY_CRITICAL_BACKEND";
    const requiredCapability = requiredWorkerCapability(toolId);
    const isExecutable = isToolExecutable({
        toolId,
        toolPolicy,
        backendAvailable: isAvailable,
        workerCapabilities,
    });
    const unavailableService = isBackendOnly && !isAvailable
        ? "backend"
        : requiredCapability && workerCapabilities?.[requiredCapability] !== true
            ? "worker"
            : null;

    return (
        <BackendOnlyToolAvailabilityContext.Provider
            value={{
                isBackendOnly,
                isExecutable,
                unavailableService,
            }}
        >
            {children}
        </BackendOnlyToolAvailabilityContext.Provider>
    );
}
