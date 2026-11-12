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
