import assert from "node:assert/strict";
import {
  DEFAULT_STUDIO_V2_COLOR_PRESETS,
  isStudioV2ColorSelected,
  normalizeStudioV2Hex,
} from "@/components/studio-v2/StudioV2ColorPicker";

assert.equal(normalizeStudioV2Hex("#fff"), "#FFFFFF");
assert.equal(normalizeStudioV2Hex(" #33aAfF "), "#33AAFF");
assert.equal(normalizeStudioV2Hex("33AAFF"), null);
assert.equal(normalizeStudioV2Hex("#12GG44"), null);
assert.equal(isStudioV2ColorSelected("#fff", "#FFFFFF"), true);
assert.equal(isStudioV2ColorSelected("#000000", "#FFFFFF"), false);
assert.equal(DEFAULT_STUDIO_V2_COLOR_PRESETS.some((preset) => preset.name === "Yellow" && preset.hex === "#FFFF00"), true);
assert.equal(DEFAULT_STUDIO_V2_COLOR_PRESETS.some((preset) => preset.name === "Blue"), true);

console.log("Studio V2 color normalization and preset semantics passed.");
