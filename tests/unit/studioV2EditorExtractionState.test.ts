import assert from "assert";
import {
  editorCompileError,
  editorExtractionStartError,
  editorExtractionSubmissionFailure,
  editorExtractionView,
  shouldPollEditorExtraction,
} from "@/lib/studio-v2/editorExtractionState";

console.log("Running Studio V2 editor extraction failure-state tests...");

assert.strictEqual(editorCompileError, "Unable to compile the edited PDF. Please try again.", "compile failures must use controlled user-facing copy");

const failure = editorExtractionSubmissionFailure();
assert.deepStrictEqual(failure, {
  busy: false,
  error: editorExtractionStartError,
  job: null,
}, "a rejected submitJob must clear the busy/no-job state and use controlled copy");
assert.strictEqual(editorExtractionView({ busy: failure.busy, hasJob: false, hasState: false, error: failure.error }), "failure", "a failed submission must render an error, not waiting");
assert.strictEqual(shouldPollEditorExtraction(null, false), false, "a failed submission without a job ID must not poll");
assert.strictEqual(editorExtractionView({ busy: false, hasJob: false, hasState: false, error: null }), "waiting", "waiting is reserved for a non-error no-layout state");
assert.strictEqual(shouldPollEditorExtraction({ status: "queued" }, false), true, "a durable queued job should poll");
assert.strictEqual(shouldPollEditorExtraction({ status: "succeeded" }, false), false, "terminal jobs must not poll");

console.log("Studio V2 editor extraction failure-state tests passed.");
