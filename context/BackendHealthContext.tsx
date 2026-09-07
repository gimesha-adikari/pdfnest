"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { backendHealth, BackendHealthState, BackendStatus } from "@/lib/health/backendHealth";

interface BackendHealthContextType extends BackendHealthState {
    checkHealth: (force?: boolean) => Promise<boolean>;
    markOffline: (reason?: string) => void;
    markOnline: () => void;
}

const BackendHealthContext = createContext<BackendHealthContextType | undefined>(undefined);

export function BackendHealthProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<BackendHealthState>(() => backendHealth.getState());
    const pathname = usePathname();

    useEffect(() => {
        const unsubscribe = backendHealth.subscribe((newState) => {
            setState(newState);
        });

        // Perform initial check on mount if status is unknown
        if (state.status === "unknown") {
            void backendHealth.checkHealth();
        }

        return unsubscribe;
    }, []);

    // A user navigating after an outage is a useful, low-frequency recovery signal.
    // The tracker enforces its recovery cooldown, so this is not background polling.
    useEffect(() => {
        void backendHealth.maybeRecover();
    }, [pathname]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void backendHealth.maybeRecover();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, []);

    const value = useMemo<BackendHealthContextType>(
        () => ({
            ...state,
            checkHealth: (force = true) => backendHealth.checkHealth(force),
            markOffline: (reason?: string) => backendHealth.markOffline(reason),
            markOnline: () => backendHealth.markOnline(),
        }),
        [state]
    );

    return (
        <BackendHealthContext.Provider value={value}>
            {children}
        </BackendHealthContext.Provider>
    );
}

export function useBackendHealth() {
    const context = useContext(BackendHealthContext);
    if (!context) {
        // Fallback for SSR or non-wrapped components
        return {
            status: "online" as BackendStatus,
            isAvailable: true,
            lastChecked: null,
            error: null,
            checkHealth: async () => true,
            markOffline: () => {},
            markOnline: () => {},
        };
    }
    return context;
}
