"use client";

import React, { useState } from "react";
import { CloudOff, RefreshCw, X } from "lucide-react";
import { useBackendHealth } from "@/context/BackendHealthContext";

export default function BackendStatusBanner() {
    const { status, isAvailable, checkHealth } = useBackendHealth();
    const [dismissed, setDismissed] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    // Only show when explicitly offline and not dismissed
    if (status !== "offline" || dismissed) {
        return null;
    }

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            await checkHealth(true);
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div
            id="backend-status-banner"
            role="status"
            aria-live="polite"
            className="w-full bg-amber-500/10 border-b border-amber-500/20 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs transition-all animate-in fade-in"
        >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                    <CloudOff size={15} className="text-amber-500 shrink-0" />
                    <span>
                        <strong>PDFNest cloud service is offline.</strong> Local browser tools are fully functional.
                    </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 font-semibold transition cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={11} className={isRetrying ? "animate-spin" : ""} />
                        <span>{isRetrying ? "Checking..." : "Retry"}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="p-1 rounded hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition cursor-pointer"
                        aria-label="Dismiss banner"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
