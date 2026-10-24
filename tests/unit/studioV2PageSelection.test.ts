import assert from "node:assert/strict";
import { acceptVisibleStudioPageId, mostVisibleStudioPage, pageIdsForSelection, parseStudioPageSelection, pruneStudioPageSelection, serializeStudioPageSelection, toggleStudioPageSelection } from "@/components/studio-v2/studioV2PageSelection";

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

async function layoutSelectionRegression() {
  const selection = await import("@/components/studio-v2/studioV2PageSelection");
  assert.equal(typeof selection.pageToKeepVisibleAfterLayoutChange, "function", "page reordering must preserve the selected logical page before visible-page observation");
  const keep = selection.pageToKeepVisibleAfterLayoutChange;
  assert.equal(keep(["p1", "p2", "p3", "p4"], ["p1", "p2", "p4", "p3"], "p4"), "p4");
  assert.equal(keep(["p1", "p2", "p4", "p3"], ["p1", "p4", "p2", "p3"], "p4"), "p4", "repeated Earlier must act on the same page");
  assert.equal(keep(["p1", "p4", "p2", "p3"], ["p4", "p1", "p2", "p3"], "p4"), "p4");
  assert.equal(keep(["p1", "p2", "p3"], ["p1", "p3"], "p3"), "p3", "keep the explicit next selection after deletion");
  assert.equal(keep(["p1", "p2"], ["p1", "p2"], "p2"), null, "normal scrolling must not be recentered on every selection change");
  assert.equal(keep(null, ["p1", "p2"], "p2"), null, "initial navigation keeps its existing scroll contract");
  assert.equal(keep(["p1", "p2"], ["p1"], "p2"), null, "never scroll to a deleted page");
  assert.equal(keep(["p1"], ["new1"], "p1"), null, "materialization must not revive old PageIDs");
  assert.equal(keep(["p1"], ["p1", "p2"], null), null);
  assert.equal(mostVisibleStudioPage([
    { pageId: "p2", overlap: 32, centerDistance: 58 },
    { pageId: "p3", overlap: 128, centerDistance: 2 },
  ]), "p3", "the DOM observer still identifies the page currently occupying the viewport");
  assert.equal(acceptVisibleStudioPageId("p2", "p3"), null, "ignore the adjacent page while a reorder is restoring p2");
  assert.equal(acceptVisibleStudioPageId("p2", "p2"), "p2", "accept the intended page once it is visible");
  assert.equal(acceptVisibleStudioPageId(null, "p3"), "p3", "resume ordinary scroll-driven selection after restoration");
  console.log("Studio page layout regression passed: stable PageID across reorder/deletion without scroll locking.");
}
void layoutSelectionRegression();
