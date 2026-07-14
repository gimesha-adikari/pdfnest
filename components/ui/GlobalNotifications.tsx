"use client";

import { useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Info,
    ArrowRight,
    X,
    XCircle,
    type LucideIcon,
} from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastAction = {
    label: string;
    onClick: () => void;
};

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
    description?: string;
    duration?: number; // ms
    action?: ToastAction;
}

type NotifyHandler = (toast: ToastItem) => void;

declare global {
    interface Window {
        __GLOBAL_NOTIFY__?: NotifyHandler;
    }
}

type ToastStyle = {
    icon: LucideIcon;
    iconWrap: string;
    accent: string;
    ring: string;
    titleClass: string;
    badgeClass: string;
};

const toastStyles: Record<ToastType, ToastStyle> = {
    success: {
        icon: CheckCircle2,
        iconWrap: "bg-emerald-500/12 text-emerald-400 ring-emerald-500/15",
        accent: "bg-emerald-500",
        ring: "focus-visible:ring-emerald-400/40",
        titleClass: "text-emerald-50",
        badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    },
    error: {
        icon: XCircle,
        iconWrap: "bg-red-500/12 text-red-400 ring-red-500/15",
        accent: "bg-red-500",
        ring: "focus-visible:ring-red-400/40",
        titleClass: "text-red-50",
        badgeClass: "border-red-500/20 bg-red-500/10 text-red-300",
    },
    warning: {
        icon: AlertTriangle,
        iconWrap: "bg-amber-500/12 text-amber-400 ring-amber-500/15",
        accent: "bg-amber-500",
        ring: "focus-visible:ring-amber-400/40",
        titleClass: "text-amber-50",
        badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    },
    info: {
        icon: Info,
        iconWrap: "bg-indigo-500/12 text-indigo-400 ring-indigo-500/15",
        accent: "bg-indigo-500",
        ring: "focus-visible:ring-indigo-400/40",
        titleClass: "text-indigo-50",
        badgeClass: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    },
};

function getDuration(toast: ToastItem): number {
    if (typeof toast.duration === "number") return toast.duration;

    switch (toast.type) {
        case "error":
            return 7000;
        case "warning":
            return 5500;
        case "info":
            return 4200;
        case "success":
        default:
            return 3500;
    }
}

function getToastLabel(type: ToastType): string {
    switch (type) {
        case "success":
            return "Success";
        case "error":
            return "Error";
        case "warning":
            return "Warning";
        case "info":
        default:
            return "Info";
    }
}

function createId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function GlobalNotifications() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timersRef = useRef<
        Map<
            string,
            {
                timerId: number;
                remaining: number;
                startedAt: number;
                paused: boolean;
            }
        >
    >(new Map());

    const clearToastTimer = (id: string) => {
        const current = timersRef.current.get(id);
        if (!current) return;

        window.clearTimeout(current.timerId);
        timersRef.current.delete(id);
    };

    const scheduleToastRemoval = (toast: ToastItem, remaining: number) => {
        clearToastTimer(toast.id);

        // eslint-disable-next-line react-hooks/purity
        const startedAt = Date.now();
        const timerId = window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            timersRef.current.delete(toast.id);
        }, Math.max(0, remaining));

        timersRef.current.set(toast.id, {
            timerId,
            remaining,
            startedAt,
            paused: false,
        });
    };

    const removeToast = (id: string) => {
        clearToastTimer(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const pauseToast = (id: string) => {
        const timer = timersRef.current.get(id);
        if (!timer || timer.paused) return;

        window.clearTimeout(timer.timerId);
        // eslint-disable-next-line react-hooks/purity
        timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
        timer.paused = true;
        timersRef.current.set(id, timer);
    };

    const resumeToast = (toast: ToastItem) => {
        const timer = timersRef.current.get(toast.id);
        if (!timer || !timer.paused) return;

        scheduleToastRemoval(toast, timer.remaining);
    };

    useEffect(() => {
        const handler: NotifyHandler = (toast) => {
            const nextToast = {
                ...toast,
                id: toast.id || createId(),
            };

            setToasts((prev) => [nextToast, ...prev].slice(0, 5));
            scheduleToastRemoval(nextToast, getDuration(nextToast));
        };

        window.__GLOBAL_NOTIFY__ = handler;

        return () => {
            delete window.__GLOBAL_NOTIFY__;
            timersRef.current.forEach((timer) => {
                window.clearTimeout(timer.timerId);
            });
            timersRef.current.clear();
        };
    }, []);

    return (
        <div className="fixed right-4 top-[88px] z-[9999] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-none">
            {toasts.map((toast, index) => {
                const style = toastStyles[toast.type];
                const Icon = style.icon;
                const duration = getDuration(toast);

                return (
                    <div
                        key={toast.id}
                        role="status"
                        aria-live={toast.type === "error" ? "assertive" : "polite"}
                        onMouseEnter={() => pauseToast(toast.id)}
                        onMouseLeave={() => resumeToast(toast)}
                        className={[
                            "group pointer-events-auto relative overflow-hidden rounded-[20px] border border-white/10 bg-zinc-950/95 backdrop-blur-2xl",
                            "shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
                            "transition-all duration-300 ease-out",
                            "hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_28px_100px_rgba(0,0,0,0.5)]",
                            "animate-[toastIn_240ms_ease-out]",
                        ].join(" ")}
                        style={{
                            zIndex: 10000 - index,
                        }}
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.03),transparent_28%)] pointer-events-none" />
                        <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-white/20 via-white/5 to-transparent pointer-events-none" />
                        <div className={["absolute inset-y-0 left-0 w-1.5", style.accent, "pointer-events-none"].join(" ")} />

                        <div className="relative flex items-start gap-3 px-4 py-4">
                            <div
                                className={[
                                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1",
                                    style.iconWrap,
                                ].join(" ")}
                            >
                                <Icon size={18} />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={[
                                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em]",
                                            style.badgeClass,
                                        ].join(" ")}
                                    >
                                        {getToastLabel(toast.type)}
                                    </span>

                                    {toast.type === "error" && toast.description ? (
                                        <span className="text-[11px] text-white/40">
                                            Billing
                                        </span>
                                    ) : null}
                                </div>

                                {toast.title ? (
                                    <p className={["mt-2 text-[15px] font-semibold tracking-[-0.01em] leading-5", style.titleClass].join(" ")}>
                                        {toast.title}
                                    </p>
                                ) : null}

                                <p className={[
                                    toast.title ? "mt-1.5" : "mt-2",
                                    "text-[13px] leading-5 text-zinc-200/90",
                                ].join(" ")}>
                                    {toast.message}
                                </p>

                                {toast.description ? (
                                    <p className="mt-2 text-[12px] leading-5 text-zinc-400">
                                        {toast.description}
                                    </p>
                                ) : null}

                                <div className="mt-3 flex items-center gap-2">
                                    {toast.action ? (
                                        <button
                                            type="button"
                                            onClick={toast.action.onClick}
                                            className={[
                                                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all",
                                                "border-white/10 bg-white/5 text-white/90 hover:bg-white/10 hover:border-white/15",
                                                "focus:outline-none focus:ring-2 focus:ring-offset-0",
                                                style.ring,
                                            ].join(" ")}
                                        >
                                            <span>{toast.action.label}</span>
                                            <ArrowRight size={13} />
                                        </button>
                                    ) : null}

                                    <span className="text-[11px] text-zinc-500">
                                        Auto-dismisses in {Math.ceil(duration / 1000)}s
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                                aria-label="Dismiss notification"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="relative h-[2px] w-full overflow-hidden bg-white/5">
                            <div
                                className={[
                                    "h-full origin-left",
                                    style.accent,
                                    "group-hover:[animation-play-state:paused]",
                                    "animate-[toastProgress_linear_forwards]",
                                ].join(" ")}
                                style={{
                                    animationDuration: `${duration}ms`,
                                }}
                            />
                        </div>
                    </div>
                );
            })}

            <style jsx global>{`
                @keyframes toastIn {
                    0% {
                        opacity: 0;
                        transform: translateX(16px) translateY(-4px) scale(0.98);
                        filter: blur(2px);
                    }
                    100% {
                        opacity: 1;
                        transform: translateX(0) translateY(0) scale(1);
                        filter: blur(0);
                    }
                }

                @keyframes toastProgress {
                    from {
                        transform: scaleX(1);
                    }
                    to {
                        transform: scaleX(0);
                    }
                }
            `}</style>
        </div>
    );
}