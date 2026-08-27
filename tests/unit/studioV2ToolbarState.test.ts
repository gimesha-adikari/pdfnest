import assert from "node:assert/strict";
import { toggleToolbarPopover } from "@/components/studio-v2/studioV2ToolbarState";

assert.equal(toggleToolbarPopover(null, "watermark"), "watermark");
assert.equal(toggleToolbarPopover("watermark", "pageNumbers"), "pageNumbers");
assert.equal(toggleToolbarPopover("pageNumbers", "pageNumbers"), null);
assert.equal(toggleToolbarPopover("compress", "more"), "more");

console.log("Studio V2 toolbar popover state tests passed: sibling replacement and same-trigger close.");
