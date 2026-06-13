"use client";

type ToastType = "success" | "error" | "info" | "warning";

type ToastPayload = {
    id: string;
    message: string;
    type: ToastType;
};

declare global {
    interface Window {
        __GLOBAL_NOTIFY__?: (toast: ToastPayload) => void;
    }
}

export const notify = (
    message: string,
    type: ToastType = "success"
) => {
    if (typeof window === "undefined") return;

    window.__GLOBAL_NOTIFY__?.({
        id: crypto.randomUUID(),
        message,
        type,
    });
};