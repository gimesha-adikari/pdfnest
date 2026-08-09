"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
    addStoredTask,
    getStoredTasks,
    removeStoredTask,
    updateStoredTask,
} from "@/lib/taskStorage";

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

    // Restore active task from localStorage on mount
    useEffect(() => {
        const stored = getStoredTasks();
        const existing = stored.find((t) => t.tool === toolName);
        if (!existing) return;

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

                setTaskId(existing.taskId);

                if (data.status === "COMPLETED") {
                    setStatus("COMPLETED");
                    setProgress(100);
                    onCompleteRef.current?.(`/api/v1/download/${data.id || existing.taskId}`);
                } else if (data.status === "FAILED") {
                    setStatus("FAILED");
                    setError(data.error || "Task failed");
                    updateStoredTask(existing.taskId, { status: "FAILED", error: data.error });
                } else if (data.status === "CANCELLED") {
                    setStatus("CANCELLED");
                    setError(data.error || "Task was cancelled");
                    updateStoredTask(existing.taskId, { status: "CANCELLED", error: data.error });
                } else if (data.status === "PENDING" || data.status === "PROCESSING") {
                    setStatus(data.status);
                    setProgress(data.progress || 0);
                }
            })
            .catch(() => {
                // Network error during recovery check
            });

        return () => {
            isMounted = false;
        };
    }, [toolName, getBaseApiUrl]);

    // Polling effect for active tasks (PENDING / PROCESSING)
    useEffect(() => {
        if (!taskId) return;
        if (status !== "PENDING" && status !== "PROCESSING") return;

        let isMounted = true;
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`${getBaseApiUrl()}/api/v1/tasks/${taskId}`);
                if (!isMounted) return;

                if (res.status === 404 || res.status === 410) {
                    setStatus("FAILED");
                    setError("Task expired or no longer available.");
                    removeStoredTask(taskId);
                    clearInterval(intervalId);
                    return;
                }

                if (!res.ok) return;

                const data: TaskStatusResponse = await res.json();
                if (!isMounted) return;

                setProgress(data.progress || 0);

                if (data.status === "COMPLETED") {
                    setStatus("COMPLETED");
                    setProgress(100);
                    updateStoredTask(taskId, { status: "COMPLETED" });
                    onCompleteRef.current?.(`/api/v1/download/${data.id || taskId}`);
                    clearInterval(intervalId);
                } else if (data.status === "FAILED") {
                    setStatus("FAILED");
                    const errStr = data.error || "Task processing failed.";
                    setError(errStr);
                    updateStoredTask(taskId, { status: "FAILED", error: errStr });
                    clearInterval(intervalId);
                } else if (data.status === "CANCELLED") {
                    setStatus("CANCELLED");
                    const errStr = data.error || "Task was cancelled.";
                    setError(errStr);
                    updateStoredTask(taskId, { status: "CANCELLED", error: errStr });
                    clearInterval(intervalId);
                } else {
                    setStatus(data.status);
                }
            } catch {
                // Ignore transient polling fetch error
            }
        }, 1000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
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

        // Always generate a new idempotency key for fresh submission
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
                    // HTTP 409 Conflict: Retry same idempotency key
                    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
                    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }

                if (res.status === 422) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || "Idempotency key reused with a different payload");
                }

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || errData.error || `Server error (${res.status})`);
                }

                const data: { taskId: string } = await res.json();
                const newTaskId = data.taskId;

                setTaskId(newTaskId);
                setStatus("PENDING");
                setProgress(0);
                addStoredTask(newTaskId, toolName, "PENDING");
                idempotencyKeyRef.current = ""; // Clear for next logical submission
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
            }
        }

        setIsSubmitting(false);
        return null;
    };

    const cancelTask = async (): Promise<void> => {
        if (!taskId || isCancelling) return;
        if (status !== "PENDING" && status !== "PROCESSING") return;

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
                    onCompleteRef.current?.(`/api/v1/download/${taskId}`);
                }
                updateStoredTask(taskId, { status: finalStatus, error: data.error });
            } else if (res.status === 409 || res.status === 404 || res.status === 410) {
                // Task was completed/gone before cancellation processed; fetch actual status
                const checkRes = await fetch(`${getBaseApiUrl()}/api/v1/tasks/${taskId}`);
                if (checkRes.ok) {
                    const data: TaskStatusResponse = await checkRes.json();
                    setStatus(data.status);
                    if (data.status === "COMPLETED") {
                        setProgress(100);
                        onCompleteRef.current?.(`/api/v1/download/${taskId}`);
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
        } finally {
            setIsCancelling(false);
        }
    };

    const restartTask = async (): Promise<string | null> => {
        if (status !== "FAILED" && status !== "CANCELLED") return null;
        if (isSubmitting || isCancelling) return null;
        if (!lastSubmissionRef.current) return null;

        // Clear current task state before creating a NEW task
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
        if (taskId) {
            removeStoredTask(taskId);
        }
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
