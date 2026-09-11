import assert from "assert";
import {
  StudioJobClientError,
  studioJobErrorInfo,
  validateStudioJobResponse,
} from "@/lib/studio-v2/api";

console.log("Running Studio job response and diagnostic tests...");

const valid = validateStudioJobResponse({ job: { id: "job-1", status: "queued" } }, "submit");
assert.strictEqual(valid.job.id, "job-1");
assert.strictEqual(valid.job.status, "queued");

assert.throws(
  () => validateStudioJobResponse({ job: { id: "", status: "queued" } }, "submit"),
  (error: unknown) => error instanceof StudioJobClientError && error.category === "submit_invalid_job_response",
);
assert.throws(
  () => validateStudioJobResponse({ job: { id: "job-2", status: "unexpected" } }, "poll"),
  (error: unknown) => error instanceof StudioJobClientError && error.category === "poll_invalid_job_response",
);

const failed = new StudioJobClientError("worker failed", "poll", "poll_failed_job", 200);
assert.deepStrictEqual(studioJobErrorInfo(failed, "poll"), {
  category: "poll_failed_job",
  status: 200,
  code: undefined,
});

console.log("Studio job response and diagnostic tests passed.");
