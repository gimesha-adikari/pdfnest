"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
    addStoredTask,
    getStoredTasks,
    removeStoredTask,
    updateStoredTask,
} from "@/lib/taskStorage";
import { notify, notifyBackendError } from "@/lib/notify";

export type TaskStatus =
    | "PENDING"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";

export interface TaskStatusResponse {
    id: string;
    status: TaskStatus;
    progress: number;
    resultUrl?: string;
    error?: string;
    downloadToken?: string;
}

function buildDownloadUrl(taskId: string, downloadToken?: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    if (downloadToken) {
        return `${base}/api/v1/download/${taskId}?token=${encodeURIComponent(downloadToken)}`;
    }
    return `${base}/api/v1/download/${taskId}`;
}

export function useAsyncTask(toolName: string, onComplete?: (downloadUrl: string) => void) {
    const [taskId, setTaskId] = useState<string>("");
    const [status, setStatus] = useState<TaskStatus | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    const idempotencyKeyRef = useRef<string>("");
    const onCompleteRef = useRef(onComplete);
    const lastSubmissionRef = useRef<(() => Promise<string | null>) | null>(null);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const getBaseApiUrl = useCallback(() => {
        return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    }, []);

    // Restore an in-flight task after navigation or a browser refresh.
    useEffect(() => {
        const stored = getStoredTasks();
        const existing = stored.find(
            (t) => (t.tool === toolName || (t as any).toolName === toolName) && (t.status === "PENDING" || t.status === "PROCESSING")
        );

        if (!existing) {
            // Clean up any stale completed/failed tasks for this tool
            const stale = stored.filter((t) => t.tool === toolName || (t as any).toolName === toolName);
            stale.forEach((t) => removeStoredTask(t.taskId));
            return;
        }

        let isMounted = true;

        fetch(`${getBaseApiUrl()}/api/v1/tasks/${existing.taskId}`)
            .then((res) => {
                if (res.status === 404 || res.status === 410) {
                    removeStoredTask(existing.taskId);
                    return null;
                }
                return res.json();
            })
            .then((data: TaskStatusResponse | null) => {
                if (!isMounted || !data) return;

                if (data.status === "PENDING" || data.status === "PROCESSING") {
                    setTaskId(existing.taskId);
                    setStatus(data.status);
                    setProgress(data.progress || 0);
                } else {
                    removeStoredTask(existing.taskId);
                }
            })
            .catch((err) => {
                console.warn("Failed to restore the stored task state:", err);
            });

        return () => {
            isMounted = false;
        };
    }, [toolName, getBaseApiUrl]);

    useEffect(() => {
        if (!taskId) return;
        if (status !== "PENDING" && status !== "PROCESSING") return;

        let isMounted = true;
        let timeoutId: ReturnType<typeof setTimeout>;
        let currentInterval = 1000;
        const MAX_INTERVAL = 8000;
        const MAX_CONSECUTIVE_FAILURES = 5;
        let lastProgress = -1;
        let consecutiveFailures = 0;

        const poll = async () => {
            try {
                const res = await fetch(`${getBaseApiUrl()}/api/v1/tasks/${taskId}`);
                if (!isMounted) return;

                if (res.status === 404 || res.status === 410) {
                    setStatus("FAILED");
                    setError("Task expired or no longer available.");
                    removeStoredTask(taskId);
                    return;
                }

                if (!res.ok) {
                    handlePollFailure(new Error(`Status request failed (${res.status})`));
                    return;
                }

                const data: TaskStatusResponse = await res.json();
                if (!isMounted) return;

                consecutiveFailures = 0;
                setProgress(data.progress || 0);

                if (data.status === "COMPLETED") {
                    setStatus("COMPLETED");
                    setProgress(100);
                    updateStoredTask(taskId, { status: "COMPLETED" });
                    onCompleteRef.current?.(buildDownloadUrl(data.id || taskId, data.downloadToken));
                    return;
                } else if (data.status === "FAILED") {
                    setStatus("FAILED");
                    const errStr = data.error || "Task processing failed.";
                    setError(errStr);
                    updateStoredTask(taskId, { status: "FAILED", error: errStr });
                    return;
                } else if (data.status === "CANCELLED") {
                    setStatus("CANCELLED");
                    const errStr = data.error || "Task was cancelled.";
                    setError(errStr);
                    updateStoredTask(taskId, { status: "CANCELLED", error: errStr });
                    return;
                } else {
                    setStatus(data.status);
                }

                // Reset backoff when progress advances, so the UI
                // stays responsive during active processing.
                if ((data.progress || 0) !== lastProgress) {
                    lastProgress = data.progress || 0;
                    currentInterval = 1000;
                } else {
                    currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL);
                }

                scheduleNext();
            } catch (err) {
                if (!isMounted) return;
                handlePollFailure(err);
            }
        };

        // Transient status-request failures are retried; a sustained outage is
        // surfaced instead of leaving the UI polling forever.
        const handlePollFailure = (err: unknown) => {
            consecutiveFailures += 1;
            console.warn(`Task status poll failed (attempt ${consecutiveFailures}):`, err);

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                setStatus("FAILED");
                const message = "Lost contact with the server while processing this task.";
                setError(message);
                updateStoredTask(taskId, { status: "FAILED", error: message });
                return;
            }

            scheduleNext();
        };

        const scheduleNext = () => {
            if (isMounted) {
                timeoutId = setTimeout(poll, currentInterval);
            }
        };

        // Start polling immediately.
        timeoutId = setTimeout(poll, currentInterval);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [taskId, status, getBaseApiUrl]);

    const registerSubmission = (submitFn: () => Promise<string | null>) => {
        lastSubmissionRef.current = submitFn;
    };

    const submitTask = async (
        endpoint: string,
        formData: FormData,
        submitFn?: () => Promise<string | null>
    ): Promise<string | null> => {
        setIsSubmitting(true);
        setError(null);

        if (submitFn) {
            lastSubmissionRef.current = submitFn;
        }

        // Retries reuse this key; a later user submission must not reuse its result.
        idempotencyKeyRef.current = crypto.randomUUID();

        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const res = await fetch(`${getBaseApiUrl()}${endpoint}`, {
                    method: "POST",
                    headers: {
                        "Idempotency-Key": idempotencyKeyRef.current,
                    },
                    body: formData,
                    credentials: "include",
                });

                if (res.status === 409) {
                    // The request may still be creating its task, so retry with the same key.
                    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
                    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }

                if (res.status === 422) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.message || errData.error || "Idempotency key reused with a different payload";
                    setIsSubmitting(false);
                    setError(errMsg);
                    setStatus("FAILED");
                    idempotencyKeyRef.current = "";
                    notifyBackendError(errData) || notify(errMsg, "error");
                    return null;
                }

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errMsg = errData.message || errData.error || errData.description || `Server error (${res.status})`;

                    // Terminal client / billing / quota errors MUST NOT be retried.
                    const NON_RETRYABLE_STATUS_CODES = [400, 401, 402, 403, 404, 413, 422, 429];
                    if (NON_RETRYABLE_STATUS_CODES.includes(res.status)) {
                        setIsSubmitting(false);
                        setError(errMsg);
                        setStatus("FAILED");
                        idempotencyKeyRef.current = "";
                        if (errData && typeof errData === "object" && (errData.code || errData.message)) {
                            notifyBackendError(errData);
                        } else {
                            notify(errMsg, "error");
                        }
                        return null;
                    }

                    throw new Error(errMsg);
                }

                const data: any = await res.json();
                const newTaskId = data.taskId || data.task_id || data.job_id;

                setTaskId(newTaskId);
                setStatus("PENDING");
                setProgress(0);
                addStoredTask(newTaskId, toolName, "PENDING");
                idempotencyKeyRef.current = "";
                setIsSubmitting(false);
                return newTaskId;
            } catch (err) {
                if (attempt === 4) {
                    setIsSubmitting(false);
                    const errMsg = err instanceof Error ? err.message : "Task submission failed";
                    setError(errMsg);
                    setStatus("FAILED");
                    idempotencyKeyRef.current = "";
                    return null;
                }

                console.warn(`Task submission attempt ${attempt + 1} failed, retrying:`, err);
            }
        }

        // Every attempt returned 409, so the task was never confirmed.
        setIsSubmitting(false);
        setStatus("FAILED");
        setError("The server did not confirm this task. Please try again.");
        idempotencyKeyRef.current = "";
        return null;
    };

    const cancelTask = async (): Promise<void> => {
        if (!taskId || isCancelling) return;
        if (status !== "PENDING" && status !== "PROCESSING") return;

        console.log(`[FORENSIC ${new Date().toISOString()}] UI Cancel Clicked for taskId: ${taskId}`);
        setIsCancelling(true);

        try {
            const res = await fetch(`${getBaseApiUrl()}/api/v1/tasks/${taskId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (res.ok) {
                const data: TaskStatusResponse = await res.json().catch(() => ({}) as any);
                const finalStatus = data.status || "CANCELLED";
                setStatus(finalStatus);
                if (finalStatus === "CANCELLED") {
                    setError("Task was cancelled.");
                } else if (finalStatus === "COMPLETED") {
                    setProgress(100);
                    onCompleteRef.current?.(buildDownloadUrl(data.id || taskId, data.downloadToken));
                }
                updateStoredTask(taskId, { status: finalStatus, error: data.error });
            } else if (res.status === 409 || res.status === 404 || res.status === 410) {
                // Cancellation races with completion; resolve the server's terminal state.
                const checkRes = await fetch(`${getBaseApiUrl()}/api/v1/tasks/${taskId}`);
                if (checkRes.ok) {
                    const data: TaskStatusResponse = await checkRes.json();
                    setStatus(data.status);
                    if (data.status === "COMPLETED") {
                        setProgress(100);
                        onCompleteRef.current?.(buildDownloadUrl(data.id || taskId, data.downloadToken));
                    }
                    updateStoredTask(taskId, { status: data.status, error: data.error });
                } else {
                    setStatus("CANCELLED");
                    updateStoredTask(taskId, { status: "CANCELLED" });
                }
            } else {
                throw new Error(`Cancellation failed with status ${res.status}`);
            }
        } catch (err) {
            console.error("Cancellation request error:", err);
            setError(err instanceof Error ? err.message : "Could not cancel this task.");
        } finally {
            setIsCancelling(false);
        }
    };

    const restartTask = async (): Promise<string | null> => {
        if (status !== "FAILED" && status !== "CANCELLED") return null;
        if (isSubmitting || isCancelling) return null;
        if (!lastSubmissionRef.current) return null;

        const oldTaskId = taskId;
        if (oldTaskId) {
            removeStoredTask(oldTaskId);
        }

        setTaskId("");
        setStatus(null);
        setProgress(0);
        setError(null);
        setIsSubmitting(true);

        try {
            const newTaskId = await lastSubmissionRef.current();
            if (newTaskId) {
                setTaskId(newTaskId);
                setStatus("PENDING");
                setProgress(0);
                setError(null);
                addStoredTask(newTaskId, toolName, "PENDING");
                return newTaskId;
            } else {
                setStatus("FAILED");
                setError("Failed to create a new task on restart.");
                return null;
            }
        } catch (err) {
            console.error("Restart task error:", err);
            const errMsg = err instanceof Error ? err.message : "Restart task submission failed";
            setError(errMsg);
            setStatus("FAILED");
            return null;
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetTask = () => {
        try {
            if (taskId) {
                removeStoredTask(taskId);
            }
            const stored = getStoredTasks().filter(
                (t) => t.tool === toolName || (t as any).toolName === toolName || (taskId && t.taskId === taskId)
            );
            stored.forEach((t) => removeStoredTask(t.taskId));
        } catch (_) {}

        setTaskId("");
        setStatus(null);
        setProgress(0);
        setError(null);
        setIsSubmitting(false);
        setIsCancelling(false);
        idempotencyKeyRef.current = "";
        lastSubmissionRef.current = null;
    };

    const canRestart = (status === "FAILED" || status === "CANCELLED") && Boolean(lastSubmissionRef.current);

    return {
        taskId,
        status,
        progress,
        error,
        isSubmitting,
        isCancelling,
        canRestart,
        submitTask,
        cancelTask,
        restartTask,
        resetTask,
        registerSubmission,
        setTaskId,
        setStatus,
        setProgress,
    };
}
