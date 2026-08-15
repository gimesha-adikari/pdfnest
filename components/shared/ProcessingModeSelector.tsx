"use client";

import { Cpu, HardDrive, Zap, CloudOff } from "lucide-react";
import { ProcessingMode, ToolPolicy } from "@/lib/execution/types";
import { useBackendHealth } from "@/context/BackendHealthContext";

interface ProcessingModeSelectorProps {
    mode: ProcessingMode;
    onChange: (mode: ProcessingMode) => void;
    toolPolicy?: ToolPolicy;
    disabled?: boolean;
}

export function ProcessingModeSelector({
    mode,
    onChange,
    toolPolicy = "CLIENT_PREFERRED",
    disabled = false,
}: ProcessingModeSelectorProps) {
    const { status } = useBackendHealth();
    const isCloudOffline = status === "offline";
    const isCloudOnly = toolPolicy === "BACKEND_ONLY" || toolPolicy === "SECURITY_CRITICAL_BACKEND";

    if (isCloudOnly) {
        return (
            <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[color:var(--background)]/50">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--foreground)]">
                    {isCloudOffline ? (
                        <CloudOff size={16} className="text-amber-500" />
                    ) : (
                        <Zap size={16} className="text-amber-500" />
                    )}
                    <span>
                        {isCloudOffline ? "Cloud Server Engine Offline" : "Cloud Server Engine Required"}
                    </span>
                </div>
                <p className="text-xs text-[color:var(--muted)] mt-1">
                    {isCloudOffline
                        ? "This tool requires server-side binary processing, but the PDFNest backend is currently unavailable."
                        : "This tool requires server-side binary processing and runs on Platen Cloud."}
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[color:var(--background)]/50 space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[color:var(--foreground)] flex items-center gap-2">
                    <Cpu size={16} className="text-indigo-500" />
                    Execution Venue
                </label>
                <span className="text-xs text-indigo-500 font-medium px-2 py-0.5 rounded-full bg-indigo-500/10">
                    {mode === "auto" ? "Auto (Recommended)" : mode === "device" ? "My Device (Free)" : "Cloud Server"}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2 p-1 bg-[color:var(--card)] rounded-xl border border-[color:var(--border)]">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("auto")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                        mode === "auto"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <Zap size={13} />
                    <span>Auto</span>
                </button>

                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("device")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                        mode === "device"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <Cpu size={13} />
                    <span>Device</span>
                </button>

                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange("cloud")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
                        mode === "cloud"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                >
                    <HardDrive size={13} />
                    <span>Cloud</span>
                </button>
            </div>

            {mode === "cloud" && isCloudOffline ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                        <CloudOff size={14} className="text-amber-500 shrink-0" />
                        <span>Cloud processing is currently unavailable.</span>
                    </div>
                    <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80">
                        The backend service is offline or unreachable. Switch to Auto or Device mode to process locally in your browser.
                    </p>
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => onChange("device")}
                            className="px-2.5 py-1 rounded bg-amber-500 text-white font-semibold text-[11px] hover:brightness-105 transition cursor-pointer"
                        >
                            Switch to Device
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange("auto")}
                            className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200 font-semibold text-[11px] hover:bg-amber-500/30 transition cursor-pointer"
                        >
                            Switch to Auto
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-[color:var(--muted)]">
                    {mode === "auto" && "Runs locally on your device for free when safe; automatically uses cloud for large files."}
                    {mode === "device" && "Runs 100% locally in your browser. Uses 0 server credits and keeps data private."}
                    {mode === "cloud" && "Executes on Platen high-performance cloud engine. Consumes account plan credits."}
                </p>
            )}
        </div>
    );
}
