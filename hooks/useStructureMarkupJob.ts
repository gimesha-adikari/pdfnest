"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    downloadStructureJob,
    getStructureJobProgress,
    submitStructureJob,
    waitForStructureJob,
    type JobRecord,
    type MarkupAction,
    type MarkupBox,
    type MarkupMode,
} from "@/lib/structureJobs";

type UseStructureMarkupJobArgs = {
    action: MarkupAction;
    file: File | null;
    boxes: MarkupBox[];
    mode: MarkupMode;
    filePassword?: string;
    onComplete: (blob: Blob, job: JobRecord) => Promise<void>;
};

export function useStructureMarkupJob({
                                          action,
                                          file,
                                          boxes,
                                          mode,
                                          filePassword,
                                          onComplete,
                                      }: UseStructureMarkupJobArgs) {
    const storageKey = useMemo(() => `pdfnest:structure:${action}:jobId`, [action]);

    const [jobId, setJobId] = useState("");
    const [job, setJob] = useState<JobRecord | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onCompleteRef = useRef(onComplete);
    const hasHandledSuccessRef = useRef(false);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        const saved = window.localStorage.getItem(storageKey);
        if (saved && !jobId) setJobId(saved);
    }, [jobId, storageKey]);

    useEffect(() => {
        if (!jobId) return;

        const controller = new AbortController();
        hasHandledSuccessRef.current = false;

        void (async () => {
            try {
                const currentJob = await waitForStructureJob(
                    jobId,
                    (nextJob) => {
                        setJob(nextJob);
                        setError(null);
                    },
                    controller.signal,
                    1000
                );

                setJob(currentJob);

                if (currentJob.status === "failed") {
                    throw new Error(currentJob.error || "Processing failed");
                }

                if (currentJob.status !== "succeeded") {
                    return;
                }

                if (hasHandledSuccessRef.current) {
                    return;
                }
                hasHandledSuccessRef.current = true;

                const blob = await downloadStructureJob(jobId);
                await onCompleteRef.current(blob, currentJob);

                window.localStorage.removeItem(storageKey);
                setJobId("");
                setJob(null);
                setUploadProgress(0);
            } catch (err) {
                if ((err as Error)?.name === "AbortError") return;
                setError(err instanceof Error ? err.message : "Processing failed");
            }
        })();

        return () => controller.abort();
    }, [jobId, storageKey]);

    const submit = async () => {
        if (!file) {
            setError("Please select a PDF first.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            setUploadProgress(0);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("boxes", JSON.stringify(boxes));
            formData.append("mode", mode);

            if (filePassword?.trim()) {
                formData.append("file_password", filePassword.trim());
            }

            const endpoint =
                action === "highlight"
                    ? "/api/structure/highlight"
                    : action === "underline"
                        ? "/api/structure/underline"
                        : "/api/structure/strikeout";

            const submission = await submitStructureJob(endpoint, formData, setUploadProgress);

            setJobId(submission.job_id);
            setJob(null);
            window.localStorage.setItem(storageKey, submission.job_id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to queue job");
        } finally {
            setIsSubmitting(false);
        }
    };

    const reset = () => {
        window.localStorage.removeItem(storageKey);
        setJobId("");
        setJob(null);
        setUploadProgress(0);
        setIsSubmitting(false);
        setError(null);
    };

    const progress = getStructureJobProgress(job, uploadProgress);
    const statusLabel =
        job?.status === "running" || job?.status === "queued"
            ? "Processing"
            : isSubmitting
                ? "Uploading"
                : job?.status === "succeeded"
                    ? "Completed"
                    : job?.status === "failed"
                        ? "Failed"
                        : "Idle";

    return {
        jobId,
        job,
        progress,
        statusLabel,
        error,
        isSubmitting,
        submit,
        reset,
    };
}