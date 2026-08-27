import assert from "node:assert/strict";
import { getStudioV2PopoverPosition } from "../../components/studio-v2/studioV2PopoverPosition";

const trigger = { top: 48, bottom: 80, left: 100, right: 180 };

assert.deepEqual(
  getStudioV2PopoverPosition({
    triggerRect: trigger,
    popoverWidth: 240,
    popoverHeight: 180,
    viewportWidth: 1280,
    viewportHeight: 800,
  }),
  { top: 88, left: 100, width: 240, placement: "below" },
);

assert.deepEqual(
  getStudioV2PopoverPosition({
    triggerRect: { ...trigger, top: 720, bottom: 752 },
    popoverWidth: 240,
    popoverHeight: 180,
    viewportWidth: 1280,
    viewportHeight: 800,
  }),
  { top: 532, left: 100, width: 240, placement: "above" },
);

const rightCollision = getStudioV2PopoverPosition({
  triggerRect: { ...trigger, left: 1180, right: 1260 },
  popoverWidth: 240,
  popoverHeight: 180,
  viewportWidth: 1280,
  viewportHeight: 800,
});
assert.equal(rightCollision.left, 1020);
assert.equal(rightCollision.left + rightCollision.width, 1260);

const leftCollision = getStudioV2PopoverPosition({
  triggerRect: { ...trigger, left: 2, right: 82 },
  popoverWidth: 240,
  popoverHeight: 180,
  viewportWidth: 1280,
  viewportHeight: 800,
});
assert.equal(leftCollision.left, 12);

const narrowViewport = getStudioV2PopoverPosition({
  triggerRect: { ...trigger, left: 2, right: 82 },
  popoverWidth: 420,
  popoverHeight: 700,
  viewportWidth: 300,
  viewportHeight: 500,
});
assert.equal(narrowViewport.width, 276);
assert.equal(narrowViewport.left, 12);
assert.equal(narrowViewport.top, 12);
assert.equal(narrowViewport.placement, "clamped");

console.log("studioV2PopoverPosition.test.ts passed");
