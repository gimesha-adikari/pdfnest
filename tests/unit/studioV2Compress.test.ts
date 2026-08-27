import assert from "node:assert/strict";
import {
  createStudioCompressState,
  formatStudioBytes,
  studioCompressionMetricsFromResponse,
  studioCompressionSummary,
} from "@/components/studio-v2/studioV2Compress";

const initial = createStudioCompressState("high");
assert.equal(initial.status, "idle");
assert.equal(initial.level, "high");
assert.equal(initial.metrics, null);

const reduced = studioCompressionMetricsFromResponse({
  input_bytes: 10_000,
  output_bytes: 6_000,
  saved_bytes: 999,
  reduction_percent: 99,
});
assert.deepEqual(reduced, {
  inputBytes: 10_000,
  outputBytes: 6_000,
  savedBytes: 4_000,
  reductionPercent: 40,
  outputLargerPercent: 0,
  outputLarger: false,
});
assert.equal(studioCompressionSummary(reduced!), "Reduced by 40.0%");

const expanded = studioCompressionMetricsFromResponse({
  input_bytes: 1_000,
  output_bytes: 1_250,
  saved_bytes: 0,
  reduction_percent: 0,
});
assert.equal(expanded?.savedBytes, 0);
assert.equal(expanded?.reductionPercent, 0);
assert.equal(expanded?.outputLarger, true);
assert.equal(expanded?.outputLargerPercent, 25);
assert.equal(studioCompressionSummary(expanded!), "Output is 25.0% larger");

const zero = studioCompressionMetricsFromResponse({ input_bytes: 0, output_bytes: 12, saved_bytes: 0, reduction_percent: 0 });
assert.equal(zero?.reductionPercent, 0);
assert.equal(studioCompressionSummary(zero!), "No size reduction");
assert.equal(formatStudioBytes(0), "0 B");
assert.equal(formatStudioBytes(1024), "1.0 KB");
assert.equal(formatStudioBytes(1024 * 1024), "1.00 MB");

console.log("Studio V2 compression tests passed: lifecycle baseline, exact metrics, expansion handling, zero-size safety, and formatting.");
