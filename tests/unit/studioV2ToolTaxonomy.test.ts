import assert from "node:assert/strict";
import { STUDIO_V2_CATEGORY_SECTIONS, studioV2CategoryHasSection } from "../../components/studio-v2/studioV2ToolTaxonomy";

for (const category of ["pages", "organize", "edit", "annotate", "layers"] as const) {
  assert.ok(STUDIO_V2_CATEGORY_SECTIONS[category].length > 0, `${category} must have an intentional inspector surface`);
}

assert.equal(studioV2CategoryHasSection("pages", "page"), false);
assert.equal(studioV2CategoryHasSection("pages", "markup"), false);
assert.equal(studioV2CategoryHasSection("organize", "text"), false);
assert.equal(studioV2CategoryHasSection("edit", "text"), true);
assert.equal(studioV2CategoryHasSection("edit", "signature"), true);
assert.equal(studioV2CategoryHasSection("annotate", "markup"), true);
assert.equal(studioV2CategoryHasSection("annotate", "metadata"), false);
assert.equal(studioV2CategoryHasSection("layers", "layers"), true);
assert.equal(studioV2CategoryHasSection("layers", "crop"), false);

console.log("studioV2ToolTaxonomy.test.ts passed");
