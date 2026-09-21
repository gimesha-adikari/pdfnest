import assert from "node:assert/strict";

import {
    OCR_V2_DEDICATED_TOOL_IDS,
    OCR_V2_DEVELOPMENT_TOOLS,
    isHiddenOcrV2PublicHref,
} from "@/lib/ocrV2DevelopmentTools";
import { NAV_TOOLS_FALLBACK, TOTAL_TOOL_COUNT } from "@/lib/toolsData";

const promotedIds = [...OCR_V2_DEDICATED_TOOL_IDS];
const promotedSurfaces = promotedIds.map((id) => {
    const surface = OCR_V2_DEVELOPMENT_TOOLS.find((item) => item.id === id);
    assert.ok(surface, `${id} must have a development registry record`);
    return surface;
});

assert.equal(promotedSurfaces.length, 7);

for (const surface of promotedSurfaces) {
    const activeEntries = NAV_TOOLS_FALLBACK.filter((tool) => tool.href === surface.publicHref);
    assert.equal(activeEntries.length, 1, `${surface.id} must be active exactly once`);

    const [active] = activeEntries;
    assert.equal(surface.discovery, "public-main-catalog", `${surface.id} must no longer be Developing-only`);
    assert.equal(isHiddenOcrV2PublicHref(surface.publicHref), false, `${surface.publicHref} must not be hidden`);
    assert.equal(active.title, surface.title);
    assert.equal(active.description, surface.description);
    assert.equal(active.category, surface.category);
    assert.equal(active.iconName, surface.iconName);
    assert.equal(active.toolPolicy, surface.toolPolicy);
    assert.equal(active.capability?.requiresBackend, true);
}

assert.equal(NAV_TOOLS_FALLBACK.length, TOTAL_TOOL_COUNT);
assert.equal(TOTAL_TOOL_COUNT, 46, "39 existing tools plus 7 promoted OCR V2 tools");

for (const href of ["/edit-pdf", "/pdf-to-word", "/studio-v2"]) {
    assert.equal(
        NAV_TOOLS_FALLBACK.filter((tool) => tool.href === href).length,
        1,
        `${href} must remain a single existing public product entry`,
    );
}

const uniqueHrefs = new Set(NAV_TOOLS_FALLBACK.map((tool) => tool.href));
assert.equal(uniqueHrefs.size, NAV_TOOLS_FALLBACK.length, "the active catalog must not contain duplicate routes");

console.log("Developing-tool promotion catalog contract passed.");
