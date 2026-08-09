"use client";

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, XCircle, AlertCircle, CheckCircle2, Upload } from "lucide-react";
import type { TaskStatus } from "@/hooks/useAsyncTask";

export interface PdfProgressTrackerProps {
    taskId: string;
    status?: TaskStatus | string;
    progress?: number;
    error?: string | null;
    isCancelling?: boolean;
    canRestart?: boolean;
    onCancel?: () => void;
    onRestart?: () => void;
    onReupload?: () => void;
    onComplete?: (downloadUrl: string) => void;
}

export function PdfProgressTracker({
    taskId,
    status: externalStatus,
    progress: externalProgress,
    error: externalError,
    isCancelling = false,
    canRestart = false,
    onCancel,
    onRestart,
    onReupload,
    onComplete,
}: PdfProgressTrackerProps) {
    const [internalProgress, setInternalProgress] = useState(0);
    const [internalStatus, setInternalStatus] = useState<string>("Initializing task execution...");
    const [internalError, setInternalError] = useState<string | null>(null);

    // Fallback WebSocket/polling if external status is not provided
    useEffect(() => {
        if (externalStatus) return;
        if (!taskId) return;

        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        const baseWsUrl = baseApiUrl.replace(/^http/, "ws");

        const ws = new WebSocket(`${baseWsUrl}/api/v1/tasks/${taskId}/progress`);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                setInternalProgress(data.progress || 0);
                setInternalStatus(data.status || "Processing task...");
                if (data.error) {
                    setInternalError(data.error);
                }

                if (data.status === "COMPLETED" || data.progress === 100) {
                    onComplete?.(`/api/v1/download/${taskId}`);
                    ws.close();
                }
            } catch (err) {
                console.error("Failed to parse websocket frame context:", err);
            }
        };

        ws.onerror = () => {
            setInternalStatus("Workspace socket loop disconnected unexpectedly.");
        };

        return () => {
            ws.close();
        };
    }, [taskId, externalStatus, onComplete]);

    const status = (externalStatus || internalStatus) as TaskStatus | string;
    const progress = externalProgress !== undefined ? externalProgress : internalProgress;
    const error = externalError !== undefined ? externalError : internalError;

    const isPending = status === "PENDING";
    const isProcessing = status === "PROCESSING" || status === "Initializing task execution..." || status === "Processing task...";
    const isCompleted = status === "COMPLETED";
    const isFailed = status === "FAILED";
    const isCancelled = status === "CANCELLED";

    return (
        <div className="w-full max-w-md p-6 bg-card border border-[color:var(--border)] rounded-2xl shadow-md transition-all">
            {/* Header & Status message */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                    {isCancelling && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
                    {(isPending || isProcessing) && !isCancelling && (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    )}
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    {isFailed && <AlertCircle className="w-4 h-4 text-destructive" />}
                    {isCancelled && <XCircle className="w-4 h-4 text-amber-500" />}

                    <span className="text-sm font-semibold text-[color:var(--foreground)]">
                        {isCancelling
                            ? "Cancelling task..."
                            : isPending
                            ? "Pending in queue..."
                            : isProcessing
                            ? `Processing task (${progress}%)`
                            : isCompleted
                            ? "Task completed!"
                            : isFailed
                            ? "Task failed"
                            : isCancelled
                            ? "Task cancelled"
                            : String(status)}
                    </span>
                </div>

                <span className="text-xs text-muted-foreground font-mono">
                    {progress}%
                </span>
            </div>

            {/* Error detail */}
            {(isFailed || isCancelled) && error && (
                <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg mb-3 break-words">
                    {error}
                </p>
            )}

            {/* Progress Bar */}
            {!isFailed && !isCancelled && (
                <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden mb-4">
                    <div
                        className={`h-full transition-all duration-300 ease-out ${
                            isCompleted ? "bg-green-500" : isCancelling ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 mt-3">
                {(isPending || isProcessing) && onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isCancelling ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Cancelling...
                            </>
                        ) : (
                            <>
                                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                                Cancel Task
                            </>
                        )}
                    </button>
                )}

                {(isFailed || isCancelled) && canRestart && onRestart && (
                    <button
                        type="button"
                        onClick={onRestart}
                        disabled={isCancelling}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-medium rounded-lg text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50 transition-colors shadow-sm"
                    >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Restart Task
                    </button>
                )}

                {(isFailed || isCancelled) && !canRestart && onReupload && (
                    <button
                        type="button"
                        onClick={onReupload}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-medium rounded-lg text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none transition-colors shadow-sm"
                    >
                        <Upload className="w-3.5 h-3.5 mr-1.5" />
                        Re-upload File to Retry
                    </button>
                )}
            </div>
        </div>
    );
}