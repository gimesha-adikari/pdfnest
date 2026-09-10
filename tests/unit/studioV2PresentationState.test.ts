import assert from "node:assert/strict";
import { nextStudioMobileSheetOpen, normalizeStudioCommandQuery, shouldDismissStudioMobileSheet, studioPageContext } from "@/components/studio-v2/studioV2PresentationState";

const pages = [
  { page_id: "durable-a", source_page_number: 9, is_blank: false, rotation: 0, overlays: [] },
  { page_id: "durable-b", source_page_number: 3, is_blank: false, rotation: 90, overlays: [] },
];

assert.equal(nextStudioMobileSheetOpen("annotate"), true);
assert.equal(nextStudioMobileSheetOpen("pages"), false);
assert.equal(nextStudioMobileSheetOpen("organize"), false);
assert.equal(shouldDismissStudioMobileSheet("more"), true);
assert.equal(shouldDismissStudioMobileSheet("command"), true);
assert.equal(shouldDismissStudioMobileSheet("page-navigator"), true);
assert.equal(shouldDismissStudioMobileSheet("editor"), true);
assert.equal(normalizeStudioCommandQuery("Export / Final-PDF!"), "exportfinalpdf");
assert.deepEqual(studioPageContext(pages, "durable-b"), { selectedIndex: 1, label: "Page 2 of 2" });
assert.deepEqual(studioPageContext(pages, "missing"), { selectedIndex: -1, label: "Page 1 of 2" });
console.log("Studio V2 presentation state tests passed: contextual sheets, normalized commands, durable page display.");
