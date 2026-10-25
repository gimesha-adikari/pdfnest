"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw, ArrowLeft, Cpu, Loader2 } from "lucide-react";
import { useBackendHealth } from "@/context/BackendHealthContext";

interface BackendUnavailableNoticeProps {
    toolName?: string;
    suggestedAlternative?: {
        name: string;
        href: string;
    };
    onRetry?: () => void;
}

export default function BackendUnavailableNotice({
    toolName = "This tool",
    suggestedAlternative,
    onRetry,
}: BackendUnavailableNoticeProps) {
    const { status, checkHealth } = useBackendHealth();
    const isPending = status === "unknown" || status === "checking";
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            await checkHealth(true);
            onRetry?.();
        } finally {
            setIsRetrying(false);
        }
    };

    if (status === "online") return null;

    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="backend-unavailable-execution-panel"
            className={`rounded-3xl border p-6 sm:p-8 text-center space-y-4 my-6 animate-in fade-in ${isPending ? "border-[color:var(--border)] bg-[color:var(--card)]" : "border-amber-500/30 bg-amber-500/5"}`}
        >
            <div className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center ${isPending ? "text-[color:var(--muted)]" : "bg-amber-500/10 text-amber-500"}`}>
                {isPending ? <Loader2 size={24} className="animate-spin" aria-hidden="true" /> : <CloudOff size={24} aria-hidden="true" />}
            </div>

            <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                    {isPending ? "Checking service availability…" : "Service Temporarily Unavailable"}
                </h3>
                <p className="text-xs text-[color:var(--muted)] leading-relaxed">
                    {isPending
                        ? `${toolName} requires backend processing. Please wait while availability is checked.`
                        : `${toolName} requires the PDFNest backend processing service, which is currently offline or unreachable.`}
                </p>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isRetrying || isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs transition hover:brightness-105 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                    <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} />
                    <span>{isPending ? "Checking…" : isRetrying ? "Reconnecting..." : "Retry Connection"}</span>
                </button>

                <Link
                    href="/tools"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] text-xs font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--background)] transition"
                >
                    <ArrowLeft size={13} />
                    <span>Browse All Tools</span>
                </Link>
            </div>

            {suggestedAlternative && (
                <div className="mt-4 pt-4 border-t border-amber-500/20 text-xs text-[color:var(--muted)] flex items-center justify-center gap-2">
                    <Cpu size={14} className="text-indigo-500 shrink-0" />
                    <span>
                        Offline alternative available:{" "}
                        <Link
                            href={suggestedAlternative.href}
                            className="text-indigo-500 font-semibold hover:underline"
                        >
                            {suggestedAlternative.name}
                        </Link>
                    </span>
                </div>
            )}
        </div>
    );
}
