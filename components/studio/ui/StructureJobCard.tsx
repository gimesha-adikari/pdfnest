"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { JobRecord } from "@/lib/structureJobs";

interface StructureJobCardProps {
    title: string;
    job: JobRecord | null;
    progress: number;
    statusLabel: string;
    error: string | null;
    isSubmitting: boolean;
    onReset?: () => void;
}

export default function StructureJobCard({
                                             title,
                                             job,
                                             progress,
                                             statusLabel,
                                             error,
                                             isSubmitting,
                                             onReset,
                                         }: StructureJobCardProps) {
    const message =
        error ||
        job?.message ||
        (isSubmitting ? "Uploading file to worker..." : "Waiting for a job to start...");

    const colorClass =
        job?.status === "failed" || error
            ? "bg-red-500"
            : job?.status === "succeeded"
                ? "bg-emerald-500"
                : "bg-foreground";

    return (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{message}</p>
                </div>

                {onReset ? (
                    <button
                        type="button"
                        onClick={onReset}
                        className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                    >
                        <RefreshCw size={13} />
                        Reset
                    </button>
                ) : null}
            </div>

            <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                        {job?.status === "failed" || error ? (
                            <AlertTriangle size={14} className="text-red-500" />
                        ) : isSubmitting || job?.status === "running" || job?.status === "queued" ? (
                            <Loader2 size={14} className="animate-spin text-foreground" />
                        ) : null}
                        {statusLabel}
                    </span>
                    <span>{Math.round(progress)}%</span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={`h-full rounded-full transition-all ${colorClass}`}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                </div>

                {job?.id ? (
                    <p className="text-[11px] text-muted-foreground">
                        Job ID: <span className="font-mono">{job.id}</span>
                    </p>
                ) : null}
            </div>
        </div>
    );
}