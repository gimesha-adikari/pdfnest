import assert from "node:assert/strict";
import { clampPageIndex, clampZoom, editorKeyboardIntent, editorMatches, fitWidthZoom, type EditorLayout } from "../../components/editor-v2/model";
import { createEditorState, editorReducer, EDITOR_HISTORY_LIMIT } from "../../components/editor-v2/reducer";

const baseline: EditorLayout = {
  schema_version: "ocr_v2_editor_layout.v1",
  pages: [
    { page_num: 1, width: 600, height: 800, kind: "text", elements: [{ id: "e1", text: "Hello", original_text: "Hello", x: 1, y: 2, width: 30, height: 10, size: 10, font: "helv" }] },
    { page_num: 2, width: 600, height: 800, kind: "scanned", elements: [{ id: "e2", text: "Sinhala text", original_text: "Sinhala text", x: 2, y: 3, width: 40, height: 12, size: 11, font: "helv" }] },
  ],
};

let state = createEditorState(baseline);
state = editorReducer(state, { type: "EDIT_TEXT", pageIndex: 0, elementId: "e1", text: "Changed" });
assert.equal(state.layout.pages[0].elements[0].text, "Changed");
assert.equal(state.dirtyKeys.size, 1);
assert.equal(baseline.pages[0].elements[0].text, "Hello", "the immutable caller baseline is not mutated");
state = editorReducer(state, { type: "EDIT_STYLE", pageIndex: 0, elementId: "e1", patch: { bold: true, color: "#112233" }, range: { start: 0, end: 5, text: "Hello" } });
assert.equal(state.layout.pages[0].elements[0].style?.bold, true);
assert.equal(state.layout.pages[0].elements[0].target_substring, "Hello");
state = editorReducer(state, { type: "UNDO" });
assert.equal(state.layout.pages[0].elements[0].style, undefined);
assert.equal(state.layout.pages[0].elements[0].text, "Changed");
state = editorReducer(state, { type: "UNDO" });
assert.equal(state.layout.pages[0].elements[0].text, "Hello");
assert.equal(state.dirtyKeys.size, 0);
state = editorReducer(state, { type: "REDO" });
state = editorReducer(state, { type: "REDO" });
assert.equal(state.layout.pages[0].elements[0].style?.color, "#112233");
state = editorReducer(state, { type: "UNDO" });
state = editorReducer(state, { type: "EDIT_STYLE", pageIndex: 0, elementId: "e1", patch: { italic: true } });
assert.equal(state.redo.length, 0, "a new edit invalidates the redo branch");

state = editorReducer(state, { type: "RESET" });
assert.equal(state.layout.pages[0].elements[0].text, "Hello");
assert.equal(state.dirtyKeys.size, 0);
assert.equal(state.undo.at(-1)?.kind, "reset");
state = editorReducer(state, { type: "UNDO" });
assert.equal(state.layout.pages[0].elements[0].text, "Changed", "reset is one undoable operation");
assert.equal(state.layout.pages[0].elements[0].style?.italic, true);
state = editorReducer(state, { type: "REDO" });
assert.equal(state.dirtyKeys.size, 0);

for (let i = 0; i < EDITOR_HISTORY_LIMIT + 20; i++) state = editorReducer(state, { type: "EDIT_TEXT", pageIndex: 0, elementId: "e1", text: `v${i}` });
assert.equal(state.undo.length, EDITOR_HISTORY_LIMIT);
assert.deepEqual(editorMatches(baseline, "sINHala"), [{ pageIndex: 1, elementId: "e2", start: 0, end: 7 }]);
const repeated = structuredClone(baseline); repeated.pages[0].elements[0].text = "hello HELLO";
assert.equal(editorMatches(repeated, "hello").length, 2);
assert.deepEqual(editorMatches(baseline, "   "), []);
assert.equal(clampZoom(.1), .5);
assert.equal(clampZoom(3), 2);
assert.equal(fitWidthZoom(664, 600), 1);
assert.equal(fitWidthZoom(32, 600), 1);
assert.equal(clampPageIndex(8, 2), 1);
assert.equal(clampPageIndex(-4, 2), 0);
assert.equal(editorKeyboardIntent({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false }), "UNDO");
assert.equal(editorKeyboardIntent({ key: "Z", ctrlKey: false, metaKey: true, shiftKey: true }), "REDO");
assert.equal(editorKeyboardIntent({ key: "y", ctrlKey: true, metaKey: false, shiftKey: false }), "REDO");
assert.equal(editorKeyboardIntent({ key: "b", ctrlKey: true, metaKey: false, shiftKey: false }), "BOLD");
assert.equal(editorKeyboardIntent({ key: "x", ctrlKey: true, metaKey: false, shiftKey: false }), null);
console.log("Shared Editor V2 core tests passed.");
