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
}

declare global {
    interface Window {
        __GLOBAL_NOTIFY__?: (toast: ToastPayload) => void;
    }
}

function createId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

    const title =
        error.title ||
        (error.code === "DAILY_LIMIT_REACHED"
            ? "Daily limit reached"
            : error.code === "HOURLY_LIMIT_REACHED"
                ? "Usage limit reached"
                : error.code === "MONTHLY_LIMIT_REACHED"
                    ? "Monthly allowance reached"
                    : error.code === "CREDITS_EXHAUSTED"
                        ? "No credits remaining"
                        : "Request failed");

    notify(error.message || "Request failed.", "error", {
        title,
        description: error.description,
        duration: 7000,
        action:
            error.upgradeRecommended
                ? {
                    label: "Upgrade plan",
                    onClick: () => {
                        window.location.href = "/subscribe";
                    },
                }
                : undefined,
    });
}