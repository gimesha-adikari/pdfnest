"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { fetchJson } from "@/lib/api";

interface SubscriptionStatus {
    tier: "free" | "pro";
    status: string;
    current_period_end: string;
}

interface AuthContextType {
    user: { id: string; email: string; role: string } | null;
    subscription: SubscriptionStatus | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    refreshSession: () => Promise<void>;
    logout: () => Promise<void>;

    isAuthModalOpen: boolean;
    requireAuth: (action: () => void) => void;
    closeAuthModal: () => void;
    handleAuthModalSuccess: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthContextType["user"]>(null);
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    const refreshSession = async () => {
        try {
            const subData = await fetchJson<SubscriptionStatus>("/billing/status");
            setSubscription(subData);
            setIsAuthenticated(true);
            setUser({ id: "active-session", email: "Active User", role: "user" });
        } catch (err) {
            setUser(null);
            setSubscription(null);
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await fetchJson("/auth/logout", { method: "POST" }).catch(() => {});
        } finally {
            setUser(null);
            setSubscription(null);
            setIsAuthenticated(false);
            window.location.href = "/login";
        }
    };

    const requireAuth = (action: () => void) => {
        if (isAuthenticated) {
            action();
        } else {
            setPendingAction(() => action);
            setIsAuthModalOpen(true);
        }
    };

    const closeAuthModal = () => {
        setIsAuthModalOpen(false);
        setPendingAction(null);
    };

    const handleAuthModalSuccess = () => {
        setIsAuthModalOpen(false);
        if (pendingAction) {
            pendingAction();
            setPendingAction(null);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshSession();
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            subscription,
            isAuthenticated,
            isLoading,
            refreshSession,
            logout,
            isAuthModalOpen,
            requireAuth,
            closeAuthModal,
            handleAuthModalSuccess
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be wrapped inside an AuthProvider");
    return context;
}