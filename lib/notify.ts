"use client";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastAction = {
    label: string;
    onClick: () => void;
};

export type ToastPayload = {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
    description?: string;
    duration?: number;
    action?: ToastAction;
};

export interface BackendError {
    code: string;
    message: string;
    title?: string;
    description?: string;
    window?: string;
    resetAt?: string;
    upgradeRecommended?: boolean;
    remainingCredits?: number;
    requestedUnits?: number;
    tool?: string;
    suggestedAction?: "register" | "upgrade" | "manage" | "contact" | "wait";
}

type PlatenSession = {
    authenticated?: boolean;
    type?: "guest" | "user";
    tier?: "guest" | "free" | "plus" | "pro";
    isGuest?: boolean;
    isLoggedIn?: boolean;
    billingPolicy?: {
        mode: "normal" | "free";
        processing_unit_limits_enforced: boolean;
        purchases_enabled: boolean;
    } | null;
};

declare global {
    interface Window {
        __GLOBAL_NOTIFY__?: (toast: ToastPayload) => void;
        __PLATEN_SESSION__?: PlatenSession;
        __PLATEN_OPEN_AUTH_MODAL__?: (mode?: "login" | "register") => void;
    }
}

function createId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getPlatenSession(): PlatenSession | null {
    if (typeof window === "undefined") return null;
    return window.__PLATEN_SESSION__ ?? null;
}

function openAuthModal(mode: "login" | "register") {
    if (typeof window === "undefined") return;
    window.__PLATEN_OPEN_AUTH_MODAL__?.(mode);
}

function isUsageLimitCode(code: string): boolean {
    return [
        "HOURLY_LIMIT_REACHED",
        "DAILY_LIMIT_REACHED",
        "MONTHLY_LIMIT_REACHED",
        "CREDITS_EXHAUSTED",
        "SUBSCRIPTION_REQUIRED",
        "BILLING_ERROR",
    ].includes(code);
}

function resolveBillingAction(error: BackendError): ToastAction | undefined {
    const session = getPlatenSession();

    if (
        error.code === "PURCHASES_DISABLED" ||
        (session?.billingPolicy?.mode === "free" && isUsageLimitCode(error.code))
    ) {
        return undefined;
    }

    const isGuest = session?.isGuest === true || session?.tier === "guest";
    const tier = session?.tier;
    const purchasesEnabled = session?.billingPolicy?.purchases_enabled === true;

    if (
        !isUsageLimitCode(error.code) &&
        !error.upgradeRecommended &&
        !error.suggestedAction
    ) {
        return undefined;
    }

    switch (error.suggestedAction) {
        case "register":
            return {
                label: "Create free account",
                onClick: () => openAuthModal("register"),
            };

        case "upgrade":
            if (!purchasesEnabled) return undefined;
            return {
                label: "Upgrade plan",
                onClick: () => {
                    window.location.href = "/subscribe";
                },
            };

        case "manage":
            return {
                label: "Manage plan",
                onClick: () => {
                    window.location.href = "/account/subscription";
                },
            };

        case "contact":
            return {
                label: "Contact support",
                onClick: () => {
                    window.location.href = "/contact";
                },
            };

        case "wait":
            return undefined;
    }


    if (isGuest) {
        return {
            label: "Create free account",
            onClick: () => openAuthModal("register"),
        };
    }

    if (tier === "free" || tier === "plus") {
        if (!purchasesEnabled) return undefined;
        return {
            label: "Upgrade plan",
            onClick: () => {
                window.location.href = "/subscribe";
            },
        };
    }

    if (tier === "pro") {
        return {
            label: "Contact support",
            onClick: () => {
                window.location.href = "/contact";
            },
        };
    }

    return undefined;
}

export function notify(
    message: string,
    type: ToastType = "success",
    options: Omit<ToastPayload, "id" | "message" | "type"> = {}
) {
    if (typeof window === "undefined") return;

    window.__GLOBAL_NOTIFY__?.({
        id: createId(),
        message,
        type,
        ...options,
    });
}

export function notifyBackendError(error: BackendError | null | undefined) {
    if (!error) {
        notify("Something went wrong.", "error");
        return;
    }

    const session = getPlatenSession();
    const isGuest =
        session?.type === "guest" ||
        session?.isGuest === true ||
        session?.tier === "guest";
    const freeBillingQuotaError =
        session?.billingPolicy?.mode === "free" && isUsageLimitCode(error.code);
    const purchaseDisabled = error.code === "PURCHASES_DISABLED";

    const title =
        error.title ||
        (purchaseDisabled
            ? "Purchases unavailable"
            : freeBillingQuotaError
                ? "Processing is currently free"
                : error.code === "DAILY_LIMIT_REACHED"
            ? "Daily limit reached"
            : error.code === "HOURLY_LIMIT_REACHED"
                ? "Usage limit reached"
                : error.code === "MONTHLY_LIMIT_REACHED"
                    ? "Monthly allowance reached"
                    : error.code === "CREDITS_EXHAUSTED"
                        ? "No credits remaining"
                        : error.code === "SUBSCRIPTION_REQUIRED"
                            ? "Subscription required"
                            : "Request failed");

    const action = purchaseDisabled ? undefined : resolveBillingAction(error);

    const description =
        error.description ||
        (purchaseDisabled || freeBillingQuotaError
            ? "Processing is currently free for everyone. No purchase is needed."
            : isGuest
            ? "Create a free account to continue with higher usage."
            : session?.tier === "pro"
                ? "You are already on the highest plan. Contact support or wait for the limit reset."
                : session?.billingPolicy?.purchases_enabled === true
                    ? "Upgrade your plan to continue."
                    : "Purchase availability is unknown. Refresh your account and try again.");

    notify(error.message || "Request failed.", "error", {
        title,
        description,
        duration: 7000,
        action,
    });
}

export function notifyHybridFallback(reason?: string) {
    if (typeof window === "undefined") return;

    notify("Processed using Cloud fallback", "info", {
        title: "Cloud Fallback Engaged",
        description: "Your browser couldn't safely process this file locally, so it was processed securely in the cloud.",
        duration: 5000,
    });
}
