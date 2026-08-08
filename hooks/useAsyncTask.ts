"use client";

import { useEffect, useRef, useState } from "react";
import { addStoredTask, getStoredTasks, removeStoredTask } from "@/lib/taskStorage";

export interface TaskStatusResponse {
    id: string;
    status: string;
    progress: number;
    resultUrl?: string;
    error?: string;
}

export function useAsyncTask(toolName: string, onComplete?: (downloadUrl: string) => void) {
    const [taskId, setTaskId] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const idempotencyKeyRef = useRef<string>("");
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Restore active task from localStorage on mount
    useEffect(() => {
        const stored = getStoredTasks();
        const existing = stored.find((t) => t.tool === toolName);
        if (!existing) return;

        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        let isMounted = true;

        fetch(`${baseApiUrl}/api/v1/tasks/${existing.taskId}`)
            .then((res) => {
                if (res.status === 404 || res.status === 410) {
                    removeStoredTask(existing.taskId);
                    return null;
                }
                return res.json();
            })
            .then((data: TaskStatusResponse | null) => {
                if (!isMounted || !data) return;
                if (data.status === "COMPLETED" && data.id) {
                    removeStoredTask(data.id);
                    onCompleteRef.current?.(`/api/v1/download/${data.id}`);
                } else if (data.status === "FAILED") {
                    removeStoredTask(existing.taskId);
                } else if (data.status === "PENDING" || data.status === "PROCESSING") {
                    setTaskId(existing.taskId);
                }
            })
            .catch(() => {
                // Network error during recovery check
            });

        return () => {
            isMounted = false;
        };
    }, [toolName]);

    const submitTask = async (endpoint: string, formData: FormData): Promise<string | null> => {
        setIsSubmitting(true);
        setError(null);

        if (!idempotencyKeyRef.current) {
            idempotencyKeyRef.current = crypto.randomUUID();
        }

        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const res = await fetch(`${baseApiUrl}${endpoint}`, {
                    method: "POST",
                    headers: {
                        "Idempotency-Key": idempotencyKeyRef.current,
                    },
                    body: formData,
                });

                if (res.status === 409) {
                    // HTTP 409 Conflict: Request in progress on backend. Wait 2 seconds and retry SAME key.
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
                addStoredTask(newTaskId, toolName);
                idempotencyKeyRef.current = ""; // Reset key for next submission attempt
                setIsSubmitting(false);
                return newTaskId;
            } catch (err) {
                if (attempt === 4) {
                    setIsSubmitting(false);
                    const errMsg = err instanceof Error ? err.message : "Task submission failed";
                    setError(errMsg);
                    idempotencyKeyRef.current = "";
                    return null;
                }
            }
        }

        setIsSubmitting(false);
        return null;
    };

    const resetTask = () => {
        if (taskId) {
            removeStoredTask(taskId);
        }
        setTaskId("");
        setError(null);
        setIsSubmitting(false);
        idempotencyKeyRef.current = "";
    };

    const cancelTask = async (): Promise<void> => {
        if (!taskId) return;
        const currentId = taskId;
        removeStoredTask(currentId);
        setTaskId("");
        setError(null);
        setIsSubmitting(false);
        idempotencyKeyRef.current = "";

        const baseApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        try {
            await fetch(`${baseApiUrl}/api/v1/tasks/${currentId}`, {
                method: "DELETE",
                credentials: "include",
            });
        } catch {
            // Ignore cancellation network errors
        }
    };

    return {
        taskId,
        isSubmitting,
        error,
        submitTask,
        resetTask,
        cancelTask,
    };
}
