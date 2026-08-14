"use client";

import { Loader2 } from "lucide-react";
import type { UseMarkupEditorResult } from "@/hooks/useMarkupEditor";

/** Upload/queue/worker progress for the running markup job. */
export default function MarkupJobProgress({ editor }: { editor: UseMarkupEditorResult }) {
    const { job, jobId, jobError, isProcessing, progress, statusText, success } = editor;

    if (success || !(job || jobError || jobId || isProcessing)) return null;

    const isBusy = isProcessing || job?.status === "running" || job?.status === "queued" || (jobId && !job);

    return (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)]/40 p-4">
            <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span className="inline-flex items-center gap-2">
                    {isBusy ? <Loader2 size={14} className="animate-spin text-foreground" /> : null}
                    {statusText}
                </span>
                <span>{Math.round(progress)}%</span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                    className={`h-full rounded-full transition-all ${
                        jobError || job?.status === "failed"
                            ? "bg-red-500"
                            : job?.status === "succeeded"
                                ? "bg-emerald-500"
                                : "bg-foreground"
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                {jobError ||
                    job?.message ||
                    (isProcessing ? "Uploading file to worker..." : "Waiting for job update...")}
            </p>

            {jobId ? (
                <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                    Job ID: <span className="font-mono">{jobId}</span>
                </p>
            ) : null}
        </div>
    );
}
