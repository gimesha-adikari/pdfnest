import assert from "node:assert/strict";
import {
  canonicalStudioV2CropToVisibleRect,
  canonicalStudioV2OverlayToVisibleRect,
  clampStudioV2Rect,
  getStudioV2VisiblePageSize,
  getStudioV2TextOverlaySize,
  moveStudioV2Rect,
  normalizeStudioV2Rect,
  resizeStudioV2Rect,
  resizeStudioV2RectWithAspectRatio,
  visibleStudioV2RectToCanonicalCrop,
  visibleStudioV2RectToCanonicalOverlay,
} from "@/components/studio-v2/StudioV2Geometry";

const page = {
  dimensions: { width: 600, height: 800 },
  cropBox: [50, 100, 550, 700],
};
const visibleRect = { x: 100, y: 120, width: 200, height: 300 };

assert.deepEqual(normalizeStudioV2Rect({ x: 20, y: 30, width: -10, height: -15 }), { x: 10, y: 15, width: 10, height: 15 });
assert.deepEqual(clampStudioV2Rect({ x: -10, y: 480, width: 700, height: 50 }, { width: 600, height: 500 }, 30), { x: 0, y: 450, width: 600, height: 50 });
assert.deepEqual(moveStudioV2Rect({ x: 100, y: 120, width: 200, height: 300 }, { x: 1000, y: -1000 }, { width: 600, height: 500 }), { x: 400, y: 0, width: 200, height: 300 });
assert.deepEqual(resizeStudioV2Rect({ x: 100, y: 120, width: 200, height: 300 }, "north-west", { x: 150, y: -200 }, { width: 600, height: 500 }, 30), { x: 250, y: 0, width: 50, height: 420 });
assert.deepEqual(resizeStudioV2RectWithAspectRatio({ x: 100, y: 100, width: 180, height: 60 }, "south-east", { x: 60, y: 30 }, { width: 600, height: 500 }, 3), { x: 100, y: 100, width: 270, height: 90 });

for (const rotation of [0, 90, 180, 270]) {
  const rotatedPage = { ...page, rotation };
  const size = getStudioV2VisiblePageSize(rotatedPage);
  assert.deepEqual(size, rotation === 90 || rotation === 270 ? { width: 600, height: 500 } : { width: 500, height: 600 });
  const canonical = visibleStudioV2RectToCanonicalCrop(rotatedPage, visibleRect);
  const roundTrip = canonicalStudioV2CropToVisibleRect(rotatedPage, canonical);
  assert.ok(Math.abs(roundTrip.x - visibleRect.x) < 1e-9, `x roundtrip at ${rotation}`);
  assert.ok(Math.abs(roundTrip.y - visibleRect.y) < 1e-9, `y roundtrip at ${rotation}`);
  assert.ok(Math.abs(roundTrip.width - visibleRect.width) < 1e-9, `width roundtrip at ${rotation}`);
  assert.ok(Math.abs(roundTrip.height - visibleRect.height) < 1e-9, `height roundtrip at ${rotation}`);
}

assert.deepEqual(visibleStudioV2RectToCanonicalCrop({ ...page, rotation: 0 }, visibleRect), [150, 280, 350, 580]);
assert.deepEqual(visibleStudioV2RectToCanonicalCrop({ ...page, rotation: 90 }, visibleRect), [170, 200, 470, 400]);
assert.deepEqual(visibleStudioV2RectToCanonicalCrop({ ...page, rotation: 180 }, visibleRect), [250, 220, 450, 520]);
assert.deepEqual(visibleStudioV2RectToCanonicalCrop({ ...page, rotation: 270 }, visibleRect), [130, 400, 430, 600]);

for (const rotation of [0, 90, 180, 270]) {
  const overlayPage = { ...page, rotation };
  const canonical = [140, 180, 120, 48] as const;
  const visible = canonicalStudioV2OverlayToVisibleRect(overlayPage, [...canonical]);
  const roundTrip = visibleStudioV2RectToCanonicalOverlay(overlayPage, visible);
  roundTrip.forEach((value, index) => assert.ok(Math.abs(value - canonical[index]) < 1e-9, `overlay roundtrip ${rotation}:${index}`));
}
const textSize = getStudioV2TextOverlaySize("Hello\nWorld", 24);
assert.equal(textSize.width, 74);
assert.ok(Math.abs(textSize.height - 57.6) < 1e-9);

console.log("Studio V2 geometry tests passed: normalization, bounds, move/resize, zoom-independent rotation roundtrips, and non-zero crop origin.");
