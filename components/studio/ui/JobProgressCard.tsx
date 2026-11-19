import type {EditorJobRecord} from "@/lib/editorJobs";
import {AlertTriangle, CheckCircle2, Loader2} from "lucide-react";

export default function JobProgressCard({
                             title,
                             job,
                             active,
                             description,
                             accent = "indigo",
                             phase,
                         }: {
    title: string;
    job: (Pick<EditorJobRecord, "id" | "message"> & { status: EditorJobRecord["status"] | "checking"; progress?: number }) | null;
    active: boolean;
    description: string;
    accent?: "indigo" | "emerald" | "rose";
    phase?: "uploading" | "submitting" | "checking" | "failed";
}) {
    const status = phase === "failed" ? "failed" : job?.status ?? phase ?? (active ? "preparing" : "idle");
    const progress = job?.progress === undefined ? null : Math.max(0, Math.min(100, job.progress));
    const statusLabel = {
        preparing: "Preparing",
        uploading: "Uploading PDF",
        submitting: "Submitting extraction",
        checking: "Checking status",
        queued: "Queued",
        running: "Running",
        cancel_requested: "Cancelling",
        succeeded: "Done",
        failed: "Failed",
        cancelled: "Cancelled",
        idle: "Idle",
    }[status];

    const icon =
        status === "succeeded" ? (
            <CheckCircle2 size={20} />
        ) : status === "failed" || status === "cancelled" ? (
            <AlertTriangle size={20} />
        ) : (
            <Loader2 className={active ? "animate-spin" : undefined} size={20} />
        );

    const outerClass =
        status === "succeeded"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : status === "failed" || status === "cancelled"
                ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "border-border bg-card text-foreground";

    const barClass =
        accent === "emerald"
            ? "bg-emerald-500"
            : accent === "rose"
                ? "bg-rose-500"
                : "bg-indigo-500";

    return (
        <div role="status" className={`mb-5 rounded-2xl border p-4 shadow-sm ${outerClass}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-background/80">
                        {icon}
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold">{title}</h4>
                        <p className="mt-1 text-xs opacity-90">
                            {phase === "failed" ? description : job?.message || description}
                        </p>
                    </div>
                </div>

                <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {statusLabel}
                    </p>
                    {progress !== null && <p className="mt-1 text-lg font-bold">{progress}%</p>}
                </div>
            </div>

            {progress !== null && <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className={`h-full rounded-full transition-all duration-300 ${barClass}`} style={{ width: `${progress}%` }} />
            </div>}
            {job?.id && <p className="mt-3 text-right text-[11px] opacity-80" title={job.id}>
                Job {job.id.slice(0, 8)}
            </p>}
        </div>
    );
}
