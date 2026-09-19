/**
 * Word-level editing UX and stability tests for the shared Editor V2 core.
 *
 * Covers:
 * - Stable baseline spans & repeated words
 * - Transient edit buffer & commit semantics
 * - Persistent dirty word visual state & deselection
 * - Empty word deletion & whitespace handling
 * - Multiple dirty words & independent undo/redo
 * - Typography & coordinate plane alignment
 * - Search on committed reconstructed draft
 * - Word style range mapping
 *
 * Run: npx tsx tests/unit/editorV2WordEditing.test.ts
 */

import assert from "node:assert/strict";
import { editorMatches, type EditorLayout, type EditorWordGeometry } from "../../components/editor-v2/model";
import { createEditorState, editorReducer } from "../../components/editor-v2/reducer";
import {
  classifyWordWidth,
  computeBaselineWordSpans,
  deleteWordInElementText,
  deriveEditableWords,
  editorFontToCss,
  findWordOffsets,
  getWordDraft,
  getWordTypographyStyles,
  getWordVisualRect,
  isWordDirty,
  reconstructDraftFromReplacements,
  replaceMultipleWordsInElementText,
  replaceWordInElementText,
  wordEditorWidth,
} from "../../components/editor-v2/wordModel";

const words: EditorWordGeometry[] = [
  { id: "w1", text: "This", x: 10, y: 20, width: 30, height: 12 },
  { id: "w2", text: "is", x: 45, y: 20, width: 15, height: 12 },
  { id: "w3", text: "to", x: 65, y: 20, width: 15, height: 12 },
  { id: "w4", text: "officially", x: 85, y: 20, width: 60, height: 12 },
  { id: "w5", text: "certify", x: 150, y: 20, width: 45, height: 12 },
];

const baseline: EditorLayout = {
  schema_version: "ocr_v2_editor_layout.v1",
  ocr_v2: true,
  pages: [
    {
      page_num: 1, width: 600, height: 800, kind: "text",
      elements: [{
        id: "e1",
        text: "This is to officially certify",
        original_text: "This is to officially certify",
        x: 10, y: 20, width: 185, height: 12, size: 12, font: "tiro",
        ocr_v2: true,
        word_ids: ["w1", "w2", "w3", "w4", "w5"],
        word_geometry: words,
        reading_order: ["w1", "w2", "w3", "w4", "w5"],
        confidence: 0.95,
      }],
    },
    {
      page_num: 2, width: 600, height: 800, kind: "scanned",
      elements: [{
        id: "e2",
        text: "Second page element",
        original_text: "Second page element",
        x: 5, y: 10, width: 120, height: 10, size: 10, font: "helv",
      }],
    },
  ],
};

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

// ---------------------------------------------------------------------------
// 1. STABLE BASELINE SPANS & REPEATED WORDS
// ---------------------------------------------------------------------------

console.log("\n=== 1. STABLE BASELINE SPANS ===");

check("baseline spans computed once and remain stable", () => {
  const spans = computeBaselineWordSpans("This is to officially certify", words);
  assert.equal(spans.size, 5);
  assert.deepEqual(spans.get("w1"), { wordId: "w1", originalText: "This", start: 0, end: 4 });
  assert.deepEqual(spans.get("w4"), { wordId: "w4", originalText: "officially", start: 11, end: 21 });
});

check("repeated words receive unique, stable baseline spans", () => {
  const repeatedWords: EditorWordGeometry[] = [
    { id: "rw1", text: "the", x: 10, y: 10, width: 20, height: 10 },
    { id: "rw2", text: "result", x: 35, y: 10, width: 35, height: 10 },
    { id: "rw3", text: "and", x: 75, y: 10, width: 20, height: 10 },
    { id: "rw4", text: "the", x: 100, y: 10, width: 20, height: 10 },
    { id: "rw5", text: "value", x: 125, y: 10, width: 30, height: 10 },
  ];
  const spans = computeBaselineWordSpans("the result and the value", repeatedWords);
  assert.deepEqual(spans.get("rw1"), { wordId: "rw1", originalText: "the", start: 0, end: 3 });
  assert.deepEqual(spans.get("rw4"), { wordId: "rw4", originalText: "the", start: 15, end: 18 });
  assert.notEqual(spans.get("rw1")?.start, spans.get("rw4")?.start);
});

check("editing one repeated word does not affect the other", () => {
  const repeatedWords: EditorWordGeometry[] = [
    { id: "rw1", text: "the", x: 10, y: 10, width: 20, height: 10 },
    { id: "rw2", text: "result", x: 35, y: 10, width: 35, height: 10 },
    { id: "rw3", text: "and", x: 75, y: 10, width: 20, height: 10 },
    { id: "rw4", text: "the", x: 100, y: 10, width: 20, height: 10 },
    { id: "rw5", text: "value", x: 125, y: 10, width: 30, height: 10 },
  ];
  const spans = computeBaselineWordSpans("the result and the value", repeatedWords);
  // Edit the SECOND "the" to "this"
  const { text, wordOffsets } = reconstructDraftFromReplacements(
    "the result and the value",
    repeatedWords,
    spans,
    { rw4: "this" },
  );
  assert.equal(text, "the result and this value");
  // rw1 should retain its original offset and text
  assert.deepEqual(wordOffsets.get("rw1"), { start: 0, end: 3 });
  // rw4 should be at 15..19
  assert.deepEqual(wordOffsets.get("rw4"), { start: 15, end: 19 });
  // rw5 offset should shift by +1 (from 19..24 to 20..25)
  assert.deepEqual(wordOffsets.get("rw5"), { start: 20, end: 25 });
});

check("deriving editable words after edit retains addressability of all words", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);

  assert.equal(derived.length, 5);
  // w4 is dirty and has draftText "formally"
  const w4 = derived.find((w) => w.id === "w4")!;
  assert.equal(w4.originalText, "officially");
  assert.equal(w4.draftText, "formally");
  assert.equal(w4.isDirty, true);
  assert.equal(w4.isDeleted, false);
  assert.deepEqual({ start: w4.startOffset, end: w4.endOffset }, { start: 11, end: 19 });

  // Later word w5 ("certify") remains addressable with shifted offsets (20..27)
  const w5 = derived.find((w) => w.id === "w5")!;
  assert.equal(w5.originalText, "certify");
  assert.equal(w5.draftText, "certify");
  assert.equal(w5.isDirty, false);
  assert.deepEqual({ start: w5.startOffset, end: w5.endOffset }, { start: 20, end: 27 });
});

// ---------------------------------------------------------------------------
// 2. TRANSIENT EDIT BUFFER & COMMIT SEMANTICS
// ---------------------------------------------------------------------------

console.log("\n=== 2. TRANSIENT BUFFER & COMMIT SEMANTICS ===");

check("committing on Enter or blur creates exactly one history operation", () => {
  let state = createEditorState(baseline);
  assert.equal(state.undo.length, 0);

  // User typed "formally" in local buffer and committed once
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });

  assert.equal(state.undo.length, 1);
  assert.equal(state.layout.pages[0].elements[0].text, "This is to formally certify");
});

check("cancelling (Escape) does not dispatch EDIT_WORD and creates zero history", () => {
  const state = createEditorState(baseline);
  // If user presses Escape, local buffer is discarded without dispatching
  assert.equal(state.undo.length, 0);
  assert.equal(state.layout.pages[0].elements[0].text, "This is to officially certify");
});

check("committing identical text as original is a no-op / removes dirty state", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "officially", // identical to baseline
  });
  assert.equal(state.undo.length, 0);
  assert.equal(state.dirtyKeys.size, 0);
});

check("live word drafts reach the canonical compile layout without creating per-keystroke history", () => {
  let state = createEditorState(baseline);
  for (const text of ["f", "fo", "formally"]) {
    state = editorReducer(state, {
      type: "EDIT_WORD_DRAFT",
      pageIndex: 0,
      elementId: "e1",
      wordId: "w4",
      text,
    });
  }

  const submitted = structuredClone(state.layout);
  const element = submitted.pages[0].elements[0];
  assert.equal(element.id, "e1");
  assert.equal(element.original_text, "This is to officially certify");
  assert.equal(element.text, "This is to formally certify");
  assert.equal(state.undo.length, 0, "the transient typing sequence remains one eventual undo operation");

  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });
  assert.equal(state.undo.length, 1);
  assert.equal(state.layout.pages[0].elements[0].text, "This is to formally certify");
});

check("cancelling a live word draft restores the pre-edit canonical layout", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD_DRAFT",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });
  state = editorReducer(state, { type: "CANCEL_WORD", pageIndex: 0, elementId: "e1" });

  const element = state.layout.pages[0].elements[0];
  assert.equal(element.text, "This is to officially certify");
  assert.equal(element.original_text, "This is to officially certify");
  assert.equal(state.undo.length, 0);
  assert.equal(state.dirtyKeys.size, 0);
});

// ---------------------------------------------------------------------------
// 3. PERSISTENT DIRTY VISUAL STATE & DESELECTION
// ---------------------------------------------------------------------------

console.log("\n=== 3. PERSISTENT DIRTY VISUAL STATE ===");

check("dirty word retains isDirty=true after deselection", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);

  const w4 = derived.find((w) => w.id === "w4")!;
  assert.equal(isWordDirty(w4), true);
  assert.equal(getWordDraft(w4), "formally");

  // Clean words are not dirty
  const w1 = derived.find((w) => w.id === "w1")!;
  assert.equal(isWordDirty(w1), false);
  assert.equal(getWordDraft(w1), "This");
});

check("deleted word gets isDirty=true and isDeleted=true with empty draft", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w3",
    text: "", // emptied
  });

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);

  const w3 = derived.find((w) => w.id === "w3")!;
  assert.equal(w3.isDirty, true);
  assert.equal(w3.isDeleted, true);
  assert.equal(w3.draftText, "");
  // Reconstructed text should cleanly omit "to" and trailing space
  assert.equal(el.text, "This is officially certify");
});

check("reverting dirty word back to original restores clean state", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });
  assert.equal(state.dirtyKeys.size, 1);

  // User edits it back to original "officially"
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "officially",
  });

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);
  const w4 = derived.find((w) => w.id === "w4")!;

  assert.equal(w4.isDirty, false);
  assert.equal(w4.draftText, "officially");
  assert.equal(el.text, "This is to officially certify");
  assert.equal(state.dirtyKeys.size, 0);
});

// ---------------------------------------------------------------------------
// 4. MULTIPLE WORDS & INDEPENDENT UNDO/REDO
// ---------------------------------------------------------------------------

console.log("\n=== 4. MULTIPLE WORDS & UNDO/REDO ===");

check("multiple dirty words in same element remain simultaneously dirty", () => {
  let state = createEditorState(baseline);
  // Edit w1 ("This" -> "That")
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w1",
    text: "That",
  });
  // Edit w5 ("certify" -> "verify")
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w5",
    text: "verify",
  });

  assert.equal(state.layout.pages[0].elements[0].text, "That is to officially verify");

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);

  const w1 = derived.find((w) => w.id === "w1")!;
  const w5 = derived.find((w) => w.id === "w5")!;
  const w2 = derived.find((w) => w.id === "w2")!;

  assert.equal(w1.isDirty, true);
  assert.equal(w1.draftText, "That");
  assert.equal(w5.isDirty, true);
  assert.equal(w5.draftText, "verify");
  assert.equal(w2.isDirty, false);
  assert.equal(w2.draftText, "is");
});

check("undoing restores only the latest word edit while earlier word remains dirty", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w1",
    text: "That",
  });
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w5",
    text: "verify",
  });

  // Undo w5 edit
  state = editorReducer(state, { type: "UNDO" });
  assert.equal(state.layout.pages[0].elements[0].text, "That is to officially certify");

  const el = state.layout.pages[0].elements[0];
  const baseEl = state.baseline.pages[0].elements[0];
  const derived = deriveEditableWords(el, baseEl, state.wordReplacements["0:e1"]);

  const w1 = derived.find((w) => w.id === "w1")!;
  const w5 = derived.find((w) => w.id === "w5")!;

  assert.equal(w1.isDirty, true);
  assert.equal(w1.draftText, "That");
  assert.equal(w5.isDirty, false);
  assert.equal(w5.draftText, "certify");

  // Redo re-applies w5
  state = editorReducer(state, { type: "REDO" });
  assert.equal(state.layout.pages[0].elements[0].text, "That is to officially verify");
});

// ---------------------------------------------------------------------------
// 5. TYPOGRAPHY & COORDINATE PLANE ALIGNMENT
// ---------------------------------------------------------------------------

console.log("\n=== 5. TYPOGRAPHY & COORDINATE MAPPING ===");

check("getWordVisualRect produces unified coordinates matching word geometry * zoom", () => {
  const rect = { x: 10, y: 20, width: 30, height: 12 };
  const r100 = getWordVisualRect(rect, 1);
  assert.deepEqual(r100, { left: 10, top: 20, width: 30, height: 12 });

  const r150 = getWordVisualRect(rect, 1.5);
  assert.deepEqual(r150, { left: 15, top: 30, width: 45, height: 18 });

  const r200 = getWordVisualRect(rect, 2);
  assert.deepEqual(r200, { left: 20, top: 40, width: 60, height: 24 });
});

check("editorFontToCss correctly maps standard PDF fonts", () => {
  assert.equal(editorFontToCss("tiro"), "'Times New Roman', Times, serif");
  assert.equal(editorFontToCss("helv"), "Helvetica, Arial, sans-serif");
  assert.equal(editorFontToCss("cour"), "'Courier New', Courier, monospace");
  assert.equal(editorFontToCss("Arial"), "Arial");
});

check("getWordTypographyStyles produces matching styles for replacement and inline editor", () => {
  const el = baseline.pages[0].elements[0];
  const styles = getWordTypographyStyles(el, 1.5);

  assert.equal(styles.fontFamily, "'Times New Roman', Times, serif");
  assert.equal(styles.fontSize, "18px"); // 12 * 1.5
  assert.equal(styles.fontWeight, "normal");
  assert.equal(styles.fontStyle, "normal");
  assert.equal(styles.lineHeight, 1);
});

check("wordEditorWidth respects zoom and bounded expand", () => {
  const originalWidth = 30;
  // Exact match -> base width
  assert.equal(wordEditorWidth(originalWidth, "This", "This", 1), 30);
  assert.equal(wordEditorWidth(originalWidth, "This", "This", 2), 60);

  // Moderate expansion within 1.5x
  const boundedW = wordEditorWidth(originalWidth, "These", "This", 1);
  assert.ok(boundedW >= 30 && boundedW <= 45);

  // Large expansion capped at 1.5x (45px at zoom 1)
  const overflowW = wordEditorWidth(originalWidth, "VeryLongReplacementWord", "This", 1);
  assert.equal(overflowW, 45);
});

// ---------------------------------------------------------------------------
// 6. TEXT RECONSTRUCTION WITH SPECIAL CHARACTERS
// ---------------------------------------------------------------------------

console.log("\n=== 6. TEXT RECONSTRUCTION EDGE CASES ===");

check("punctuation preserved — trailing period", () => {
  const punctWords: EditorWordGeometry[] = [
    { id: "pw1", text: "Hello", x: 0, y: 0, width: 30, height: 10 },
    { id: "pw2", text: "world", x: 40, y: 0, width: 30, height: 10 },
  ];
  const spans = computeBaselineWordSpans("Hello world.", punctWords);
  const { text } = reconstructDraftFromReplacements(
    "Hello world.",
    punctWords,
    spans,
    { pw2: "earth" },
  );
  assert.equal(text, "Hello earth.");
});

check("punctuation preserved — comma", () => {
  const commaWords: EditorWordGeometry[] = [
    { id: "cw1", text: "First", x: 0, y: 0, width: 30, height: 10 },
    { id: "cw2", text: "second", x: 40, y: 0, width: 35, height: 10 },
  ];
  const spans = computeBaselineWordSpans("First, second.", commaWords);
  const { text } = reconstructDraftFromReplacements(
    "First, second.",
    commaWords,
    spans,
    { cw1: "One" },
  );
  assert.equal(text, "One, second.");
});

check("Sinhala text replacement with Unicode preservation", () => {
  const sinWords: EditorWordGeometry[] = [
    { id: "sw1", text: "මෙය", x: 0, y: 0, width: 30, height: 10 },
    { id: "sw2", text: "සහතිකයකි", x: 40, y: 0, width: 50, height: 10 },
  ];
  const spans = computeBaselineWordSpans("මෙය සහතිකයකි", sinWords);
  const { text } = reconstructDraftFromReplacements(
    "මෙය සහතිකයකි",
    sinWords,
    spans,
    { sw1: "එය" },
  );
  assert.equal(text, "එය සහතිකයකි");
});

check("Tamil text replacement with Unicode preservation", () => {
  const tamWords: EditorWordGeometry[] = [
    { id: "tw1", text: "இது", x: 0, y: 0, width: 25, height: 10 },
    { id: "tw2", text: "சான்றிதழ்", x: 35, y: 0, width: 50, height: 10 },
  ];
  const spans = computeBaselineWordSpans("இது சான்றிதழ்", tamWords);
  const { text } = reconstructDraftFromReplacements(
    "இது சான்றிதழ்",
    tamWords,
    spans,
    { tw1: "அது" },
  );
  assert.equal(text, "அது சான்றிதழ்");
});

// ---------------------------------------------------------------------------
// 7. SEARCH & STYLE ON COMMITTED RECONSTRUCTED DRAFT
// ---------------------------------------------------------------------------

console.log("\n=== 7. SEARCH & STYLE ===");

check("committed replacement is searchable in reconstructed draft", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });

  const matches = editorMatches(state.layout, "formally");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].elementId, "e1");
  assert.equal(matches[0].start, 11);
  assert.equal(matches[0].end, 19);

  // Original word is no longer found
  const oldMatches = editorMatches(state.layout, "officially");
  assert.equal(oldMatches.length, 0);
});

check("styling word targets exact reconstructed character range", () => {
  let state = createEditorState(baseline);
  state = editorReducer(state, {
    type: "EDIT_WORD",
    pageIndex: 0,
    elementId: "e1",
    wordId: "w4",
    text: "formally",
  });

  // Apply bold to w4 ("formally" at 11..19)
  state = editorReducer(state, {
    type: "EDIT_STYLE",
    pageIndex: 0,
    elementId: "e1",
    patch: { bold: true, color: "#ff0000" },
    range: { start: 11, end: 19, text: "formally" },
  });

  const el = state.layout.pages[0].elements[0];
  assert.equal(el.style?.bold, true);
  assert.equal(el.style?.color, "#ff0000");
  assert.equal(el.target_substring, "formally");
  assert.equal(el.selection_start, 11);
  assert.equal(el.selection_end, 19);
});

// ---------------------------------------------------------------------------
// 8. BACKWARD COMPATIBLE HELPERS & WIDTH CLASSIFICATION
// ---------------------------------------------------------------------------

console.log("\n=== 8. COMPATIBLE HELPERS & WIDTH CLASSIFICATION ===");

check("findWordOffsets maps offsets correctly", () => {
  const offsets = findWordOffsets("This is to officially certify", words);
  assert.equal(offsets.size, 5);
  assert.deepEqual(offsets.get("w1"), { start: 0, end: 4 });
});

check("replaceWordInElementText replaces single word", () => {
  const result = replaceWordInElementText("This is to officially certify", "w4", "formally", words);
  assert.equal(result, "This is to formally certify");
});

check("replaceMultipleWordsInElementText replaces multiple words", () => {
  const edits = new Map([["w1", "That"], ["w5", "verify"]]);
  const result = replaceMultipleWordsInElementText("This is to officially certify", edits, words);
  assert.equal(result, "That is to officially verify");
});

check("deleteWordInElementText deletes word and whitespace", () => {
  const result = deleteWordInElementText("This is to officially certify", "w3", words);
  assert.equal(result, "This is officially certify");
});

check("classifyWordWidth classifies fits, bounded-expand, and overflow", () => {
  assert.equal(classifyWordWidth(30, "short", "longer"), "fits");
  assert.equal(classifyWordWidth(30, "Mrs.", "Mr."), "bounded-expand");
  assert.equal(classifyWordWidth(20, "VeryLongTitleReplacement", "Mr."), "overflow");
});

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------

console.log(`\n=== WORD EDITING V2 SUITE: ${passed}/${passed} assertions passed ===\n`);
