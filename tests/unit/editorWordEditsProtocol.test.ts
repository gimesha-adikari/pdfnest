import assert from "node:assert/strict";
import type { EditorLayout } from "../../components/editor-v2/model";
import { createEditorState, editorReducer } from "../../components/editor-v2/reducer";
import { resolveEditorCompileIntent } from "../../components/editor-v2/wordEdits";

const baseline: EditorLayout = {
  schema_version: "ocr_v2_editor_layout.v1",
  word_edit_protocols: ["platen_word_edits.v1"],
  word_edit_baseline: {
    extraction_job_id: "extract-01",
    digest: `sha256:${"a".repeat(64)}`,
    source_sha256: "b".repeat(64),
    engine_fingerprint: `sha256:${"c".repeat(64)}`,
    algorithm_version: "general_editor_word_baseline.v1",
  },
  pages: [
    {
      page_num: 1,
      width: 600,
      height: 800,
      kind: "text",
      elements: [
        {
          id: "line-1",
          text: "the result and the 🚀",
          original_text: "the result and the 🚀",
          x: 10,
          y: 20,
          width: 200,
          height: 12,
          size: 12,
          font: "tiro",
          word_geometry: [
            { id: "word-1", text: "the", x: 10, y: 20, width: 18, height: 12 },
            { id: "word-2", text: "result", x: 32, y: 20, width: 34, height: 12 },
            { id: "word-3", text: "and", x: 70, y: 20, width: 20, height: 12 },
            { id: "word-4", text: "the", x: 94, y: 20, width: 18, height: 12 },
            { id: "word-5", text: "🚀", x: 116, y: 20, width: 14, height: 12 },
          ],
        },
      ],
    },
    {
      page_num: 3,
      width: 600,
      height: 800,
      kind: "text",
      elements: [
        {
          id: "line-3",
          text: "the final line",
          original_text: "the final line",
          x: 10,
          y: 20,
          width: 100,
          height: 12,
          size: 12,
          font: "tiro",
          word_geometry: [
            { id: "word-6", text: "the", x: 10, y: 20, width: 18, height: 12 },
            { id: "word-7", text: "final", x: 32, y: 20, width: 28, height: 12 },
            { id: "word-8", text: "line", x: 64, y: 20, width: 24, height: 12 },
          ],
        },
      ],
    },
  ],
};

function editWord(state: ReturnType<typeof createEditorState>, wordId: string, text: string) {
  return editorReducer(state, { type: "EDIT_WORD", pageIndex: 0, elementId: "line-1", wordId, text });
}

function editWordDraft(state: ReturnType<typeof createEditorState>, wordId: string, text: string) {
  return editorReducer(state, { type: "EDIT_WORD_DRAFT", pageIndex: 0, elementId: "line-1", wordId, text });
}

let state = createEditorState(baseline);
state = editWord(state, "word-1", "this");
state = editWord(state, "word-2", "");
state = editWord(state, "word-4", "that");
state = editWord(state, "word-5", "🧪𠮷");

const firstIntent = resolveEditorCompileIntent(state, "owner/editor/source.pdf");
assert.equal(firstIntent.kind, "word_edits");
if (firstIntent.kind !== "word_edits") throw new Error("expected word-edit intent");
assert.equal(firstIntent.request.edit_protocol, "platen_word_edits.v1");
assert.equal(firstIntent.request.extraction_job_id, "extract-01");
assert.equal(firstIntent.request.source_tracker, "owner/editor/source.pdf");
assert.equal(firstIntent.request.baseline_digest, `sha256:${"a".repeat(64)}`);
assert.deepEqual(firstIntent.request.edits, [
  { page_num: 1, element_id: "line-1", word_id: "word-1", expected_original_text: "the", replacement_text: "this", style_override: null, fit_policy: "preserve_neighbors" },
  { page_num: 1, element_id: "line-1", word_id: "word-2", expected_original_text: "result", replacement_text: "", style_override: null, fit_policy: "preserve_neighbors" },
  { page_num: 1, element_id: "line-1", word_id: "word-4", expected_original_text: "the", replacement_text: "that", style_override: null, fit_policy: "preserve_neighbors" },
  { page_num: 1, element_id: "line-1", word_id: "word-5", expected_original_text: "🚀", replacement_text: "🧪𠮷", style_override: null, fit_policy: "preserve_neighbors" },
]);
assert.equal("pages" in firstIntent.request, false, "the full rebuilt layout is not the word instruction");
assert.deepEqual(JSON.parse(JSON.stringify(firstIntent.request)), firstIntent.request, "Unicode survives JSON round-trip unchanged");

state = editorReducer(state, { type: "UNDO" });
const afterUndo = resolveEditorCompileIntent(state, "owner/editor/source.pdf");
assert.equal(afterUndo.kind, "word_edits");
if (afterUndo.kind === "word_edits") assert.equal(afterUndo.request.edits.some((edit) => edit.word_id === "word-5"), false);
state = editorReducer(state, { type: "REDO" });
const afterRedo = resolveEditorCompileIntent(state, "owner/editor/source.pdf");
assert.equal(afterRedo.kind, "word_edits");
if (afterRedo.kind === "word_edits") assert.equal(afterRedo.request.edits.at(-1)?.replacement_text, "🧪𠮷");

state = editWord(state, "word-1", "the");
const afterRevert = resolveEditorCompileIntent(state, "owner/editor/source.pdf");
assert.equal(afterRevert.kind, "word_edits");
if (afterRevert.kind === "word_edits") assert.equal(afterRevert.request.edits.some((edit) => edit.word_id === "word-1"), false);

let pending = createEditorState(baseline);
pending = editWordDraft(pending, "word-4", "draft-before-blur");
assert.equal(pending.pendingWordEdits["0:line-1"] !== undefined, true);
const beforeBlur = resolveEditorCompileIntent(pending, "owner/editor/source.pdf");
assert.equal(beforeBlur.kind, "word_edits", "the latest inline draft is serializable before blur commits undo history");
if (beforeBlur.kind === "word_edits") assert.equal(beforeBlur.request.edits[0].replacement_text, "draft-before-blur");
pending = editorReducer(pending, { type: "EDIT_WORD", pageIndex: 0, elementId: "line-1", wordId: "word-4", text: "draft-before-blur" });
const afterBlur = resolveEditorCompileIntent(pending, "owner/editor/source.pdf");
assert.equal(afterBlur.kind, "word_edits");
if (afterBlur.kind === "word_edits") assert.deepEqual(afterBlur.request.edits, beforeBlur.kind === "word_edits" ? beforeBlur.request.edits : []);

let lineOnly = createEditorState(baseline);
lineOnly = editorReducer(lineOnly, { type: "EDIT_TEXT", pageIndex: 0, elementId: "line-1", text: "whole line draft" });
const lineIntent = resolveEditorCompileIntent(lineOnly, "owner/editor/source.pdf");
assert.equal(lineIntent.kind, "layout", "whole-line edits stay on the legacy layout callback");

let mixed = createEditorState(baseline);
mixed = editWord(mixed, "word-1", "this");
mixed = editorReducer(mixed, { type: "EDIT_TEXT", pageIndex: 1, elementId: "line-3", text: "another whole line" });
const mixedIntent = resolveEditorCompileIntent(mixed, "owner/editor/source.pdf");
assert.equal(mixedIntent.kind, "error", "mixed word and whole-line snapshots fail closed");

let unsupported = createEditorState({ ...baseline, word_edit_protocols: [] });
unsupported = editorReducer(unsupported, { type: "EDIT_WORD", pageIndex: 0, elementId: "line-1", wordId: "word-1", text: "this" });
assert.equal(resolveEditorCompileIntent(unsupported, "owner/editor/source.pdf").kind, "error");

console.log("Word edit protocol serialization tests passed.");
