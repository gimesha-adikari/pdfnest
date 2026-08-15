"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { fetchJson } from "@/lib/api";

interface SubscriptionStatus {
    role: string;
    tier: "free" | "plus" | "pro";
    status: string;
    billing_interval: "monthly" | "yearly";
    current_period_end: string;
    custom_credits: number;
    used_units_3h: number;
    used_units_daily: number;
    used_units_monthly: number;
    update_url?: string;
    cancel_url?: string;
}

interface User {
    id: string;
    email: string;
    role: string;
    status?: string;
    google_id?: string | null;
    email_verified?: boolean;
    created_at?: string;
    updated_at?: string;
}

interface Guest {
    id: string;
    trust: number;
    created_at?: string;
    last_seen_at?: string;
}

interface SessionResponse {
    authenticated: boolean;
    type: "guest" | "user";
    user?: User | null;
    guest?: Guest | null;
    subscription?: SubscriptionStatus | null;
}

type AuthModalView = "login" | "register";
export type AuthAvailability = "available" | "unavailable" | "unknown";

interface AuthContextType {
    user: User | null;
    guest: Guest | null;
    subscription: SubscriptionStatus | null;

    isAuthenticated: boolean;
    isLoggedIn: boolean;
    isGuest: boolean;
    isLoading: boolean;
    authAvailability: AuthAvailability;

    refreshSession: () => Promise<void>;
    ensureGuestSession: () => Promise<void>;
    logout: () => Promise<void>;

    isAuthModalOpen: boolean;
    authModalView: AuthModalView;
    openAuthModal: (view?: AuthModalView) => void;
    requireAuth: (action: () => void) => void;
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
    const [user, setUser] = useState<User | null>(null);
    const [guest, setGuest] = useState<Guest | null>(null);
    const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isGuest, setIsGuest] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [authAvailability, setAuthAvailability] = useState<AuthAvailability>("unknown");

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authModalView, setAuthModalView] = useState<AuthModalView>("login");

    const pendingAction = useRef<(() => void) | null>(null);

    const applyGuest = useCallback((guestData: Guest) => {
        setGuest(guestData);
        setUser(null);
        setSubscription(null);

        setIsAuthenticated(true);
        setIsLoggedIn(false);
        setIsGuest(true);
        setAuthAvailability("available");

        syncWindowSession({
            authenticated: true,
            type: "guest",
            tier: "guest",
            isGuest: true,
            isLoggedIn: false,
            guestId: guestData.id,
        });
    }, []);

    const applyUser = useCallback((session: SessionResponse) => {
        setUser(session.user ?? null);
        setGuest(null);
        setSubscription(session.subscription ?? null);

        setIsAuthenticated(true);
        setIsLoggedIn(true);
        setIsGuest(false);
        setAuthAvailability("available");

        syncWindowSession({
            authenticated: true,
            type: "user",
            tier: session.subscription?.tier ?? "free",
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
        setIsLoading(true);

        try {
            const session = await fetchJson<SessionResponse>("/auth/session");

            if (session.type === "user" && session.user) {
                applyUser(session);
            } else {
                applyGuest(
                    session.guest ?? {
                        id: "guest",
                        trust: 1,
                    }
                );
            }
            setAuthAvailability("available");
        } catch (err) {
            console.warn("Session refresh failed; backend or auth service unavailable:", err);

            setAuthAvailability("unavailable");
            setUser(null);
            setGuest(null);
            setSubscription(null);

            setIsAuthenticated(false);
            setIsLoggedIn(false);
            setIsGuest(false);

            syncWindowSession(null);
        } finally {
            setIsLoading(false);

            const action = pendingAction.current;
            if (action) {
                pendingAction.current = null;
                action();
            }
        }
    }, [applyGuest, applyUser]);

    const ensureGuestSession = useCallback(async () => {
        if (isLoggedIn) return;
        if (isGuest) return;

        await refreshSession();
    }, [isGuest, isLoggedIn, refreshSession]);

    const logout = useCallback(async () => {
        try {
            await fetchJson("/auth/logout", {
                method: "POST",
            }).catch((err) => {
                // The local session is cleared regardless, but the failure must not vanish.
                console.warn("Logout request failed; clearing the local session anyway:", err);
            });
        } finally {
            setUser(null);
            setGuest(null);
            setSubscription(null);

            setIsAuthenticated(false);
            setIsLoggedIn(false);
            setIsGuest(false);

            syncWindowSession(null);

            await refreshSession();
        }
    }, [refreshSession]);

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
            isAuthenticated,
            isLoggedIn,
            isGuest,
            isLoading,
            authAvailability,
            refreshSession,
            ensureGuestSession,
            logout,
            isAuthModalOpen,
            authModalView,
            openAuthModal,
            requireAuth,
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
            openAuthModal,
            refreshSession,
            requireAuth,
            requireLogin,
            subscription,
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