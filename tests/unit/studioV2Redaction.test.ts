import assert from "node:assert/strict";
import { studioV2RedactionBoxToPayload, redactionBoxHasPracticalSize } from "@/components/studio-v2/StudioV2Redaction";

const page = {
  page_id: "page-1",
  source_page_number: 1,
  is_blank: false,
  rotation: 90,
  crop_box: [50, 100, 550, 700],
  dimensions: { width: 600, height: 800 },
  overlays: [],
};

const box = (rect: { x: number; y: number; width: number; height: number }) => ({
  id: "area-1",
  pageId: "page-1",
  page: 1,
  rect,
});

const payload = studioV2RedactionBoxToPayload(box({ x: 60, y: 40, width: 120, height: 80 }), page);
assert.deepEqual(payload, {
  id: "area-1",
  page_id: "page-1",
  page: 1,
  x: 0.1,
  y: 0.08,
  width: 0.2,
  height: 0.16,
});
assert.equal(redactionBoxHasPracticalSize(box({ x: 0, y: 0, width: 3, height: 3 })), true);
assert.equal(redactionBoxHasPracticalSize(box({ x: 0, y: 0, width: 2, height: 3 })), false);

assert.throws(
  () => studioV2RedactionBoxToPayload(box({ x: 500, y: 0, width: 120, height: 20 }), page),
  /inside the visible page/,
);
assert.throws(
  () => studioV2RedactionBoxToPayload({ ...box({ x: 0, y: 0, width: 20, height: 20 }), pageId: "foreign" }, page),
  /different page/,
);

console.log("Studio V2 redaction tests passed: typed boxes, page association, normalization, and bounds.");
