"use client";

import React from "react";
import { FileText, RefreshCw, X } from "lucide-react";

interface StudioBannerProps {
    activeFile: File | null;
    totalPages: number;
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    onReset: () => void;
}

export default function StudioBanner({
                                         activeFile,
                                         totalPages,
                                         isSidebarOpen,
                                         onToggleSidebar,
                                         onReset,
                                     }: StudioBannerProps) {
    if (activeFile) {
        return null;
    }

    return (
        <div className="mb-4 flex flex-col gap-4 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
                <div className="flex items-center gap-2">
                    <div className="rounded-2xl bg-indigo-500/10 p-2 text-indigo-500">
                        <FileText size={20} />
                    </div>

                    <h1 className="text-2xl font-black text-[color:var(--foreground)]">
                        Studio
                    </h1>
                </div>

                <p className="mt-2 text-sm text-[color:var(--muted)]">
                    Upload a PDF, preview pages, and use the canvas as the main document workspace.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[var(--card)]"
                >
                    {isSidebarOpen ? <X size={16} /> : <FileText size={16} />}
                    {isSidebarOpen ? "Close panel" : "Open panel"}
                </button>

                <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[var(--card)]"
                >
                    <RefreshCw size={16} />
                    Reset
                </button>
            </div>
        </div>
    );
}