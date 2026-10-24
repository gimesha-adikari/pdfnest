export type JobRequestIdentity = Readonly<{ idempotencyKey: string; requestId: string }>;
export type JobSubmissionAttempt = {
    readonly identity: JobRequestIdentity;
    readonly files: readonly File[];
    readonly parameters: string;
    readonly startedAt: number;
    readonly monotonicStartedAt: number;
    jobId?: string;
};

// Backend PROCESSING reservations last 15 minutes (CREATED lasts 24 hours).
// Stop uncertain resubmission before the shorter TTL can expire; never rotate
// an expired unknown identity silently. An explicit reset starts a new operation.
const UNKNOWN_RETRY_WINDOW_MS = 14 * 60 * 1000;

export class JobSubmissionRecoveryError extends Error {}

/** One component-owned logical operation, plus synchronous creation exclusion. */
export class JobSubmission {
    private pending: JobSubmissionAttempt | null = null;
    private active: JobSubmissionAttempt | null = null;

    begin(files: readonly File[], parameters: string, now = Date.now(), monotonicNow = performance.now()): JobSubmissionAttempt | null {
        if (this.active) return null;
        const same = this.pending && this.pending.parameters === parameters &&
            this.pending.files.length === files.length && this.pending.files.every((file, index) => file === files[index]);
        if (!same) {
            this.pending = {
                files: [...files], parameters, startedAt: now, monotonicStartedAt: monotonicNow,
                identity: { idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() },
            };
        }
        const attempt = this.pending;
        if (!attempt) return null;
        // Wall time covers machine sleep; monotonic time covers wall-clock drift.
        const elapsed = Math.max(now - attempt.startedAt, monotonicNow - attempt.monotonicStartedAt);
        if (!attempt.jobId && (now < attempt.startedAt || monotonicNow < attempt.monotonicStartedAt || elapsed >= UNKNOWN_RETRY_WINDOW_MS)) {
            throw new JobSubmissionRecoveryError("The previous submission outcome is still unknown and its safe retry window has expired. Check your jobs before deliberately starting over.");
        }
        this.active = attempt;
        return attempt;
    }

    accepted(attempt: JobSubmissionAttempt, jobId: string): void {
        if (this.pending === attempt) attempt.jobId = jobId;
    }

    rejected(attempt: JobSubmissionAttempt): void {
        if (this.pending === attempt) this.pending = null;
    }

    finish(attempt: JobSubmissionAttempt): void {
        if (this.active === attempt) this.active = null;
    }

    reset(): boolean {
        if (this.active) return false;
        this.pending = null;
        return true;
    }

    retryAfterTerminalFailure(status: string | undefined): void {
        // Retrieval/auth failures do not turn a SUCCEEDED job into new work.
        if (status === "FAILED" || status === "CANCELLED") this.reset();
    }
}

export function isConfirmedJobRejection(cause: unknown): boolean {
    if (!cause || typeof cause !== "object" || !("status" in cause) || !("code" in cause)) return false;
    const { status, code } = cause;
    return typeof status === "number" && status >= 400 && status < 500 &&
        status !== 408 && status !== 499 && code !== "IDEMPOTENCY_REQUEST_IN_PROGRESS" &&
        code !== "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD";
}
