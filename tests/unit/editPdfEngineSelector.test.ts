/**
 * Tests for Standalone PDF Editor engine resolution semantics.
 *
 * Requirements:
 * - "v2" -> v2
 * - "V2" -> v2
 * - undefined -> v2
 * - null -> v2
 * - missing -> v2
 * - "" -> v2
 * - "   " -> v2
 * - "legacy" -> legacy
 * - "LEGACY" -> legacy
 * - "  legacy  " -> legacy
 * - Any unknown value -> v2 (fallback to default)
 *
 * Run: npx tsx tests/unit/editPdfEngineSelector.test.ts
 */

import assert from "node:assert/strict";
import { resolveEditPdfEditorEngine } from "../../lib/editPdfEngine";

function runTests() {
  console.log("Running Standalone Editor Engine Selector tests...");

  // 1. Explicit V2 variants
  assert.equal(resolveEditPdfEditorEngine("v2"), "v2", "'v2' must resolve to v2");
  assert.equal(resolveEditPdfEditorEngine("V2"), "v2", "'V2' must resolve to v2");
  assert.equal(resolveEditPdfEditorEngine("  v2  "), "v2", "'  v2  ' must resolve to v2");

  // 2. Default fallback variants (missing, undefined, null, empty, whitespace)
  assert.equal(resolveEditPdfEditorEngine(undefined), "v2", "undefined must resolve to default v2");
  assert.equal(resolveEditPdfEditorEngine(null), "v2", "null must resolve to default v2");
  assert.equal(resolveEditPdfEditorEngine(), "v2", "missing argument must resolve to default v2");
  assert.equal(resolveEditPdfEditorEngine(""), "v2", "empty string must resolve to default v2");
  assert.equal(resolveEditPdfEditorEngine("   "), "v2", "whitespace string must resolve to default v2");

  // 3. Unknown values must resolve to default v2
  assert.equal(resolveEditPdfEditorEngine("unknown"), "v2", "'unknown' must resolve to default v2");
  assert.equal(resolveEditPdfEditorEngine("custom"), "v2", "'custom' must resolve to default v2");

  // 4. Explicit Legacy rollback variants
  assert.equal(resolveEditPdfEditorEngine("legacy"), "legacy", "'legacy' must resolve to legacy");
  assert.equal(resolveEditPdfEditorEngine("LEGACY"), "legacy", "'LEGACY' must resolve to legacy");
  assert.equal(resolveEditPdfEditorEngine("  legacy  "), "legacy", "'  legacy  ' must resolve to legacy");
  assert.equal(resolveEditPdfEditorEngine("  LEGACY  "), "legacy", "'  LEGACY  ' must resolve to legacy");

  console.log("All Standalone Editor Engine Selector tests passed successfully!");
}

runTests();
