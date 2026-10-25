"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useReducer,
    useState,
} from "react";
import { fetchJson } from "@/lib/api";
import {
    authSessionReducer,
    initialAuthSessionState,
    type BillingPolicy,
    type Guest,
    type SessionResponse,
    type SubscriptionStatus,
    type User,
} from "./authSessionState";

type AuthModalView = "login" | "register";
export type AuthAvailability = "available" | "unavailable" | "unknown";

interface AuthContextType {
    user: User | null;
    guest: Guest | null;
    subscription: SubscriptionStatus | null;
    billingPolicy: BillingPolicy | null;

    isAuthenticated: boolean;
    isLoggedIn: boolean;
    isGuest: boolean;
    isLoading: boolean;
    authAvailability: AuthAvailability;

    refreshSession: () => Promise<void>;
    ensureGuestSession: () => Promise<void>;
    logout: () => Promise<void>;
    signOutAfterPasswordChange: () => void;
    reauthenticationRequired: boolean;

    isAuthModalOpen: boolean;
    authModalView: AuthModalView;
    openAuthModal: (view?: AuthModalView) => void;
    requireAuth: (action: () => void) => void;
    cancelPendingAction: () => void;
    requireLogin: (action: () => void) => void;
    closeAuthModal: () => void;
    handleAuthModalSuccess: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type WindowWithPlaten = Window & {
    __PLATEN_SESSION__?: {
        authenticated: boolean;
        type: "guest" | "user";
        tier: "guest" | "free" | "plus" | "pro";
        isGuest: boolean;
        isLoggedIn: boolean;
        userId?: string;
        guestId?: string;
        billingPolicy: BillingPolicy | null;
    };
    __PLATEN_OPEN_AUTH_MODAL__?: (mode?: AuthModalView) => void;
};

function syncWindowSession(session: WindowWithPlaten["__PLATEN_SESSION__"] | null) {
    if (typeof window === "undefined") return;
    const w = window as WindowWithPlaten;

    if (session) {
        w.__PLATEN_SESSION__ = session;
    } else {
        delete w.__PLATEN_SESSION__;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [sessionState, dispatchSession] = useReducer(authSessionReducer, initialAuthSessionState);
    const { user, guest, subscription, billingPolicy } = sessionState;

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isGuest, setIsGuest] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [authAvailability, setAuthAvailability] = useState<AuthAvailability>("unknown");

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authModalView, setAuthModalView] = useState<AuthModalView>("login");

    const sessionRequest = useRef(0);
    const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
    const pendingAction = useRef<(() => void) | null>(null);
    // A delayed sign-in must not revive a document action whose venue, input
    // or workspace changed while authentication was being checked.
    const cancelPendingAction = useCallback(() => {
        pendingAction.current = null;
    }, []);

    const applyGuest = useCallback((session: SessionResponse) => {
        dispatchSession({ type: "apply", session });
        const guestData = session.guest ?? { id: "guest", trust: 1 };

        setIsAuthenticated(true);
        setIsLoggedIn(false);
        setIsGuest(true);
        setAuthAvailability("available");

        syncWindowSession({
            authenticated: true,
            type: "guest",
            tier: "guest",
            billingPolicy: session.billing_policy ?? null,
            isGuest: true,
            isLoggedIn: false,
            guestId: guestData.id,
        });
    }, []);

    const applyUser = useCallback((session: SessionResponse) => {
        setReauthenticationRequired(false);
        dispatchSession({ type: "apply", session });

        setIsAuthenticated(true);
        setIsLoggedIn(true);
        setIsGuest(false);
        setAuthAvailability("available");

        syncWindowSession({
            authenticated: true,
            type: "user",
            tier: session.subscription?.tier ?? "free",
            billingPolicy: session.billing_policy ?? null,
            isGuest: false,
            isLoggedIn: true,
            userId: session.user?.id,
        });
    }, []);

    const openAuthModal = useCallback((view: AuthModalView = "login") => {
        setAuthModalView(view);
        setIsAuthModalOpen(true);
    }, []);

    const refreshSession = useCallback(async () => {
        const request = ++sessionRequest.current;
        setIsLoading(true);

        try {
            const session = await fetchJson<SessionResponse>("/auth/session");
            if (request !== sessionRequest.current) return;

            if (session.type === "user" && session.user) {
                applyUser(session);
            } else {
                applyGuest(session);
            }
            setAuthAvailability("available");
        } catch (err) {
            if (request !== sessionRequest.current) return;
            console.warn("Session refresh failed; backend or auth service unavailable:", err);

            setAuthAvailability("unavailable");
            dispatchSession({ type: "clear" });

            setIsAuthenticated(false);
            setIsLoggedIn(false);
            setIsGuest(false);

            syncWindowSession(null);
        } finally {
            if (request === sessionRequest.current) {
                setIsLoading(false);
                const action = pendingAction.current;
                if (action) {
                    pendingAction.current = null;
                    action();
                }
            }
        }
    }, [applyGuest, applyUser]);

    const ensureGuestSession = useCallback(async () => {
        if (isLoggedIn) return;
        if (isGuest) return;

        await refreshSession();
    }, [isGuest, isLoggedIn, refreshSession]);

    const invalidateSession = useCallback((passwordChanged = false) => {
        // Fence in-flight session responses before clearing current identity.
        sessionRequest.current++;
        pendingAction.current = null;
        dispatchSession({ type: "clear" });
        setIsAuthenticated(false);
        setIsLoggedIn(false);
        setIsGuest(false);
        setIsLoading(false);
        setIsAuthModalOpen(false);
        setAuthAvailability("available");
        setReauthenticationRequired(passwordChanged);
        syncWindowSession(null);
    }, []);

    const signOutAfterPasswordChange = useCallback(() => invalidateSession(true), [invalidateSession]);

    const logout = useCallback(async () => {
        try {
            await fetchJson("/auth/logout", {
                method: "POST",
            }).catch((err) => {
                // The local session is cleared regardless, but the failure must not vanish.
                console.warn("Logout request failed; clearing the local session anyway:", err);
            });
        } finally {
            invalidateSession();

            await refreshSession();
        }
    }, [invalidateSession, refreshSession]);

    const requireAuth = useCallback(
        (action: () => void) => {
            // For client tools: if authenticated, or if backend auth is offline, let the action execute
            if (isAuthenticated || authAvailability === "unavailable") {
                action();
                return;
            }

            pendingAction.current = action;
            void refreshSession();
        },
        [isAuthenticated, authAvailability, refreshSession]
    );

    const requireLogin = useCallback(
        (action: () => void) => {
            if (isLoggedIn) {
                action();
                return;
            }

            if (authAvailability === "unavailable") {
                openAuthModal("login");
                return;
            }

            pendingAction.current = action;
            openAuthModal("login");
        },
        [isLoggedIn, authAvailability, openAuthModal]
    );

    const closeAuthModal = useCallback(() => {
        setIsAuthModalOpen(false);
        pendingAction.current = null;
    }, []);

    const handleAuthModalSuccess = useCallback(() => {
        setIsAuthModalOpen(false);
        void refreshSession();
    }, [refreshSession]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const w = window as WindowWithPlaten;
        w.__PLATEN_OPEN_AUTH_MODAL__ = openAuthModal;

        return () => {
            if (w.__PLATEN_OPEN_AUTH_MODAL__ === openAuthModal) {
                delete w.__PLATEN_OPEN_AUTH_MODAL__;
            }
        };
    }, [openAuthModal]);

    useEffect(() => {
        void refreshSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = useMemo<AuthContextType>(
        () => ({
            user,
            guest,
            subscription,
            billingPolicy,
            isAuthenticated,
            isLoggedIn,
            isGuest,
            isLoading,
            authAvailability,
            refreshSession,
            ensureGuestSession,
            logout,
            signOutAfterPasswordChange,
            reauthenticationRequired,
            isAuthModalOpen,
            authModalView,
            openAuthModal,
            requireAuth,
            cancelPendingAction,
            requireLogin,
            closeAuthModal,
            handleAuthModalSuccess,
        }),
        [
            authAvailability,
            authModalView,
            closeAuthModal,
            ensureGuestSession,
            handleAuthModalSuccess,
            isAuthenticated,
            isAuthModalOpen,
            isGuest,
            isLoading,
            isLoggedIn,
            logout,
            signOutAfterPasswordChange,
            reauthenticationRequired,
            openAuthModal,
            refreshSession,
            requireAuth,
            cancelPendingAction,
            requireLogin,
            subscription,
            billingPolicy,
            user,
            guest,
        ]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be wrapped inside an AuthProvider");
    return context;
}
