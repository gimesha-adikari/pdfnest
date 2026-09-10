import assert from "node:assert/strict";
import { nextStudioMobileSheetOpen, normalizeStudioCommandQuery, shouldDismissStudioMobileSheet, studioPageContext, studioResponsiveSurface } from "@/components/studio-v2/studioV2PresentationState";

const pages = [
  { page_id: "durable-a", source_page_number: 9, is_blank: false, rotation: 0, overlays: [] },
  { page_id: "durable-b", source_page_number: 3, is_blank: false, rotation: 90, overlays: [] },
];

assert.equal(nextStudioMobileSheetOpen("annotate"), true);
assert.equal(nextStudioMobileSheetOpen("pages"), false);
assert.equal(nextStudioMobileSheetOpen("organize"), true);
assert.equal(nextStudioMobileSheetOpen("edit"), true);
assert.equal(nextStudioMobileSheetOpen("layers"), true);
assert.equal(shouldDismissStudioMobileSheet("more"), true);
assert.equal(shouldDismissStudioMobileSheet("command"), true);
assert.equal(shouldDismissStudioMobileSheet("page-navigator"), true);
assert.equal(shouldDismissStudioMobileSheet("editor"), true);
assert.equal(normalizeStudioCommandQuery("Export / Final-PDF!"), "exportfinalpdf");
assert.deepEqual(studioPageContext(pages, "durable-b"), { selectedIndex: 1, label: "Page 2 of 2" });
assert.deepEqual(studioPageContext(pages, "missing"), { selectedIndex: -1, label: "Page 1 of 2" });
assert.equal(studioResponsiveSurface(390), "mobile-sheet");
assert.equal(studioResponsiveSurface(768), "tablet-bottom");
assert.equal(studioResponsiveSurface(1024), "laptop-overlay");
assert.equal(studioResponsiveSurface(1399), "laptop-overlay");
assert.equal(studioResponsiveSurface(1400), "desktop-docked");
console.log("Studio V2 presentation state tests passed: contextual sheets, normalized commands, durable page display, prototype breakpoints.");
