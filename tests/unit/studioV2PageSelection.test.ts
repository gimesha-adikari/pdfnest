import assert from "node:assert/strict";
import { pageIdsForSelection, parseStudioPageSelection, pruneStudioPageSelection, serializeStudioPageSelection, toggleStudioPageSelection } from "@/components/studio-v2/studioV2PageSelection";

const pages = Array.from({ length: 6 }, (_, index) => ({ page_id: `p${index + 1}`, source_page_number: index + 1, is_blank: false, rotation: 0, overlays: [] }));

assert.deepEqual(parseStudioPageSelection("1, 3-5", 6), [1, 3, 4, 5]);
assert.throws(() => parseStudioPageSelection("2,2", 6), /selected more than once/);
assert.throws(() => parseStudioPageSelection("", 6));
assert.throws(() => parseStudioPageSelection("0", 6));
assert.throws(() => parseStudioPageSelection("5-3", 6));
assert.throws(() => parseStudioPageSelection("7", 6));
assert.deepEqual([...pageIdsForSelection([1, 3, 4, 5], pages)], ["p1", "p3", "p4", "p5"]);

let selected = new Set<string>();
let state = toggleStudioPageSelection(pages, selected, "p2", false, null);
selected = state.selected;
state = toggleStudioPageSelection(pages, selected, "p5", true, state.anchorId);
assert.deepEqual([...state.selected], ["p2", "p3", "p4", "p5"]);
assert.equal(serializeStudioPageSelection(state.selected, pages), "2-5");
state = toggleStudioPageSelection(pages, state.selected, "p3", false, state.anchorId);
assert.equal(serializeStudioPageSelection(state.selected, pages), "2,4-5");
assert.deepEqual([...pruneStudioPageSelection(new Set(["p1", "gone"]), pages)], ["p1"]);
console.log("Studio V2 page selection tests passed: parser, stable IDs, click, shift range, canonical sync, and pruning.");
