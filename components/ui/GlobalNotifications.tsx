"use client";

import { useEffect, useState } from "react";
import {
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Info,
    X,
} from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
}

const toastStyles: Record<
    ToastType,
    {
        icon: any;
        className: string;
    }
> = {
    success: {
        icon: CheckCircle2,
        className:
            "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    },
    error: {
        icon: XCircle,
        className:
            "border-red-500/30 bg-red-500/10 text-red-400",
    },
    warning: {
        icon: AlertTriangle,
        className:
            "border-amber-500/30 bg-amber-500/10 text-amber-400",
    },
    info: {
        icon: Info,
        className:
            "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
    },
};

export default function GlobalNotifications() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    useEffect(() => {
        window.__GLOBAL_NOTIFY__ = (toast: ToastItem) => {
            setToasts((prev) => [...prev, toast]);

            setTimeout(() => {
                setToasts((prev) =>
                    prev.filter((t) => t.id !== toast.id)
                );
            }, 3500);
        };

        return () => {
            delete window.__GLOBAL_NOTIFY__;
        };
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <div className="fixed top-[88px] right-4 z-[9999] flex flex-col gap-3 w-[340px] pointer-events-none">            {toasts.map((toast) => {
                const Icon = toastStyles[toast.type].icon;

                return (
                    <div
                        key={toast.id}
                        className={`
                            pointer-events-auto
                            rounded-2xl
                            border
                            backdrop-blur-xl
                            shadow-2xl
                            px-4
                            py-3
                            flex
                            items-start
                            gap-3
                            animate-in
                            slide-in-from-right-5
                            fade-in
                            duration-300
                            ${toastStyles[toast.type].className}
                        `}
                    >
                        <Icon size={18} className="mt-0.5 shrink-0" />

                        <div className="flex-1">
                            <p className="text-xs font-bold leading-relaxed">
                                {toast.message}
                            </p>
                        </div>

                        <button
                            onClick={() => removeToast(toast.id)}
                            className="opacity-60 hover:opacity-100 transition"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}