import assert from "node:assert/strict";
import {
  commitStudioV2MarkupEdit,
  createStudioV2MarkupHistory,
  getMarkupShortcutAction,
  isMarkupShortcutEditableTarget,
  redoStudioV2Markup,
  undoStudioV2Markup,
} from "@/components/studio-v2/StudioV2MarkupHistory";

const box = (id: string) => ({ id, x: 10, y: 20, width: 40, height: 12, page: 1, color: "#FFFF00" });

let history = createStudioV2MarkupHistory();
history = commitStudioV2MarkupEdit(history, [box("one")]);
history = commitStudioV2MarkupEdit(history, [box("one"), box("two")]);
assert.equal(history.past.length, 2);

history = undoStudioV2Markup(history);
assert.deepEqual(history.present.map((item) => item.id), ["one"]);
assert.equal(history.future.length, 1);

history = redoStudioV2Markup(history);
assert.deepEqual(history.present.map((item) => item.id), ["one", "two"]);

history = undoStudioV2Markup(history);
history = commitStudioV2MarkupEdit(history, [box("three")]);
assert.equal(history.future.length, 0, "a new edit invalidates redo");
assert.equal(getMarkupShortcutAction("z", false), "undo");
assert.equal(getMarkupShortcutAction("z", true), "redo");
assert.equal(getMarkupShortcutAction("y", false), "redo");
assert.equal(isMarkupShortcutEditableTarget("INPUT"), true);
assert.equal(isMarkupShortcutEditableTarget("TEXTAREA"), true);
assert.equal(isMarkupShortcutEditableTarget("DIV", true), true);
assert.equal(isMarkupShortcutEditableTarget("DIV"), false);

console.log("Studio V2 markup history tests passed: undo, redo, and redo invalidation.");
