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
  displayRectToCanonicalPdfRect,
  canonicalPdfRectToDisplayRect,
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

// Markup authoritative coordinate transformations (displayRectToCanonicalPdfRect / canonicalPdfRectToDisplayRect)
const markupTestPages = [
  { width: 400, height: 600 },
  { width: 612, height: 792 },
];
const testDisplayRects = [
  { x: 30, y: 50, width: 120, height: 70 },
  { x: 0, y: 0, width: 100, height: 50 },
  { x: 150, y: 200, width: 80, height: 160 },
];

for (const testPage of markupTestPages) {
  for (const rotation of [0, 90, 180, 270]) {
    const pageWithRot = { ...testPage, rotation };
    for (const rect of testDisplayRects) {
      const canonical = displayRectToCanonicalPdfRect(pageWithRot, rect);
      const displayRoundTrip = canonicalPdfRectToDisplayRect(pageWithRot, canonical);
      assert.ok(Math.abs(displayRoundTrip.x - rect.x) < 1e-2, `markup x roundtrip at rot ${rotation}: got ${displayRoundTrip.x} expected ${rect.x}`);
      assert.ok(Math.abs(displayRoundTrip.y - rect.y) < 1e-2, `markup y roundtrip at rot ${rotation}: got ${displayRoundTrip.y} expected ${rect.y}`);
      assert.ok(Math.abs(displayRoundTrip.width - rect.width) < 1e-2, `markup width roundtrip at rot ${rotation}`);
      assert.ok(Math.abs(displayRoundTrip.height - rect.height) < 1e-2, `markup height roundtrip at rot ${rotation}`);
    }
  }
}

// Explicit coordinate assertions matching PyMuPDF derotation matrix on 400x600 page:
const p400x600 = { width: 400, height: 600 };
const sampleDisplay = { x: 30, y: 50, width: 120, height: 70 };
// At 0 deg: identical
assert.deepEqual(displayRectToCanonicalPdfRect({ ...p400x600, rotation: 0 }, sampleDisplay), { x: 30, y: 50, width: 120, height: 70 });
// At 90 deg: x=vy(50), y=H-(vx+vw)=600-(30+120)=450, w=vh(70), h=vw(120)
assert.deepEqual(displayRectToCanonicalPdfRect({ ...p400x600, rotation: 90 }, sampleDisplay), { x: 50, y: 450, width: 70, height: 120 });
// At 180 deg: x=W-(vx+vw)=400-(30+120)=250, y=H-(vy+vh)=600-(50+70)=480, w=vw(120), h=vh(70)
assert.deepEqual(displayRectToCanonicalPdfRect({ ...p400x600, rotation: 180 }, sampleDisplay), { x: 250, y: 480, width: 120, height: 70 });
// At 270 deg: x=W-(vy+vh)=400-(50+70)=280, y=vx(30), w=vh(70), h=vw(120)
assert.deepEqual(displayRectToCanonicalPdfRect({ ...p400x600, rotation: 270 }, sampleDisplay), { x: 280, y: 30, width: 70, height: 120 });

// Reverse drag normalization test
const reverseDrag = { x: 150, y: 120, width: -120, height: -70 };
assert.deepEqual(
  displayRectToCanonicalPdfRect({ ...p400x600, rotation: 0 }, reverseDrag),
  displayRectToCanonicalPdfRect({ ...p400x600, rotation: 0 }, sampleDisplay),
);

console.log("Studio V2 geometry tests passed: normalization, bounds, move/resize, zoom-independent rotation roundtrips, non-zero crop origin, and markup rotation coordinate parity.");

