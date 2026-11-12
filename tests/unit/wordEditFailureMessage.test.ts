import assert from "node:assert/strict";
import { wordEditFailureMessage } from "../../components/editor-v2/wordEditErrors";

assert.match(
  wordEditFailureMessage("NATIVE_FONT_UNSUPPORTED", null),
  /font|typeface/i,
  "unsupported native fonts should tell the user why the edit was refused"
);
assert.match(
  wordEditFailureMessage("TEXT_READING_ORDER_UNSUPPORTED", null),
  /reading order|text order/i,
  "text-order refusals should explain why the exact target cannot be exported"
);
assert.match(
  wordEditFailureMessage("NATIVE_GRAPHICS_OVERLAP", null),
  /graphic|line|image/i,
  "overlapping page content should be identified"
);
assert.match(
  wordEditFailureMessage("UNKNOWN_PHASE4_FAILURE", null),
  /no downloadable PDF/i,
  "unknown worker failures should still fail closed"
);
assert.match(
  wordEditFailureMessage("UNSUPPORTED_REPLACEMENT_TEXT", null),
  /script|Sinhala|Tamil|language/i,
  "unsupported language or script replacements should be described without implying English-only input"
);
assert.match(
  wordEditFailureMessage("SCRIPT_SCAN_STYLE_UNRESOLVED", null),
  /scan|font size|baseline|typography/i,
  "complex script scan refusals should explain the missing alignment evidence"
);
assert.match(
  wordEditFailureMessage("UNSUPPORTED_IMAGE_TRANSFORM", null),
  /image|transform|rotation|shear/i,
  "unsupported image placements should explain the geometry refusal"
);
