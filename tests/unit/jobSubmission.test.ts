import assert from "node:assert/strict";
import { createSearchablePdfV2Job, SearchablePdfV2ApiError } from "@/lib/searchablePdfV2";
import { submitOcrAwareMarkup, OcrAwareMarkupError } from "@/lib/ocrAwareMarkupV2";
import { markPdfInputPreparation } from "@/lib/security/pdfInputPreparation";
import { JobSubmission, JobSubmissionRecoveryError, isConfirmedJobRejection } from "@/lib/jobSubmission";
const jobId = "123e4567-e89b-12d3-a456-426614174000";
const originalFetch = globalThis.fetch;
const a = new File(["synthetic"], "page.png", { type: "image/png" });
const unprepared = new File(["other"], a.name, { type: a.type });
markPdfInputPreparation(a, { sourceProtected: false, bytesState: "plain", preparedOn: "none", processingMode: "auto", cloudSubmissionInitiated: false });
function response(): Response { return new Response(JSON.stringify({ job_id: jobId, status: "QUEUED" }), { status: 202 }); }
async function main(): Promise<void> {
    for (const engine of ["searchable", "markup"] as const) {
        const submission = new JobSubmission();
        const headers: Headers[] = [];
        let behavior: "lost" | "busy" | "pending" | "server" | "malformed" | "ok" = "lost";
        globalThis.fetch = async (_input, init) => {
            headers.push(new Headers(init?.headers));
            if (behavior === "lost") throw new TypeError("accepted response lost");
            if (behavior === "busy") return new Response(JSON.stringify({ code: "SERVER_BUSY" }), { status: 429 });
            if (behavior === "pending") return new Response(JSON.stringify({ code: "IDEMPOTENCY_REQUEST_IN_PROGRESS" }), { status: 409 });
            if (behavior === "server") return new Response(JSON.stringify({ code: "TASK_STORAGE_UNAVAILABLE" }), { status: 503 });
            if (behavior === "malformed") return new Response("invalid-json", { status: 202 });
            return response();
        };
        const run = async () => {
            const attempt = submission.begin([a], "same-options");
            if (!attempt) return;
            try {
                const id = attempt.identity;
                const job = engine === "markup" ? await submitOcrAwareMarkup("highlight", a, "test", "smart", "eng", "#FFFF00", undefined, id) : await createSearchablePdfV2Job([a], "eng", "AUTO", id.idempotencyKey, id.requestId);
                submission.accepted(attempt, job.job_id);
            } catch (cause) {
                if (isConfirmedJobRejection(cause)) submission.rejected(attempt);
            } finally { submission.finish(attempt); }
        };
        await Promise.all([run(), run()]);
        assert.equal(headers.length, 1, `${engine}: synchronous overlap makes one POST`);
        for (const next of ["pending", "server", "malformed", "ok"] as const) { behavior = next; await run(); }
        for (const header of headers) {
            assert.equal(header.get("Idempotency-Key"), headers[0].get("Idempotency-Key"));
            assert.equal(header.get("X-Request-ID"), headers[0].get("X-Request-ID"));
        }
        submission.retryAfterTerminalFailure("SUCCEEDED");
        const recovery = submission.begin([a], "same-options")!;
        assert.equal(recovery.jobId, jobId, "succeeded result retrieval failure preserves accepted job and avoids another POST");
        const active = submission.begin([a], "same-options"); assert.equal(active, null);
        submission.finish(recovery);
        submission.retryAfterTerminalFailure("FAILED");
        const afterFailure = submission.begin([a], "same-options")!;
        assert.notEqual(afterFailure.identity.idempotencyKey, recovery.identity.idempotencyKey);
        submission.finish(afterFailure); submission.reset(); headers.length = 0;
        behavior = "busy"; await run(); behavior = "ok"; await run();
        assert.equal(headers.length, 2);
        assert.notEqual(headers[0].get("Idempotency-Key"), headers[1].get("Idempotency-Key"), "actual confirmed 429 permits a new operation");
        submission.reset(); headers.length = 0;
        behavior = "lost"; await run(); submission.reset(); behavior = "ok"; await run();
        assert.notEqual(headers[0].get("Idempotency-Key"), headers[1].get("Idempotency-Key"), "explicit reset after uncertainty deliberately starts a new operation");
        // A separate operation tests confirmed rejection and explicit reset.
        const rejected = new JobSubmission();
        const first = rejected.begin([a], "same")!;
        rejected.rejected(first); rejected.finish(first);
        const retry = rejected.begin([a], "same")!;
        assert.notEqual(first.identity.idempotencyKey, retry.identity.idempotencyKey);
        assert.equal(rejected.reset(), false, "reset cannot invalidate in-flight ownership");
        rejected.finish(retry); assert.equal(rejected.reset(), true);
        const reset = rejected.begin([a], "same")!;
        assert.notEqual(retry.identity.idempotencyKey, reset.identity.idempotencyKey);
        rejected.finish(reset);
        const replacement = rejected.begin([unprepared], "same")!;
        assert.notEqual(reset.identity.idempotencyKey, replacement.identity.idempotencyKey);
        rejected.finish(replacement);
        const changed = rejected.begin([unprepared], "different-options")!;
        assert.notEqual(replacement.identity.idempotencyKey, changed.identity.idempotencyKey);
        console.log(`PASS: ${engine} single-flight, stable IDs through lost response/409/503/malformed 202, accepted-job recovery, confirmed-rejection/reset/replacement identities`);
    }
    assert.equal(isConfirmedJobRejection(new OcrAwareMarkupError("SERVER_BUSY", "", 429)), true);
    assert.equal(isConfirmedJobRejection(new SearchablePdfV2ApiError("IDEMPOTENCY_REQUEST_IN_PROGRESS", "", 409)), false);
    assert.equal(isConfirmedJobRejection(new SearchablePdfV2ApiError("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD", "", 422)), false);
    const expired = new JobSubmission(); const attempt = expired.begin([a], "same", 0)!; expired.finish(attempt);
    assert.throws(() => expired.begin([a], "same", 14 * 60 * 1000), JobSubmissionRecoveryError);
    const slept = new JobSubmission(); const sleeping = slept.begin([a], "same", 1000, 1000)!; slept.finish(sleeping);
    assert.throws(() => slept.begin([a], "same", 1000 + 15 * 60 * 1000, 1001), JobSubmissionRecoveryError);
    const rollback = new JobSubmission(); const beforeRollback = rollback.begin([a], "same", 1000, 1000)!; rollback.finish(beforeRollback);
    assert.throws(() => rollback.begin([a], "same", 999, 1001), JobSubmissionRecoveryError);
    console.log("PASS: uncertain retry TTL fails closed before backend reservation expiry");
}
void main().finally(() => { globalThis.fetch = originalFetch; }).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
