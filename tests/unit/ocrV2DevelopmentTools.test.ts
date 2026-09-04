import assert from "node:assert/strict";

import {
    OCR_V2_DEDICATED_TOOL_IDS,
    OCR_V2_DEVELOPMENT_TOOLS,
    getOcrV2DevelopmentRouteConfig,
    isHiddenOcrV2PublicHref,
    isOcrV2DevelopmentToolId,
} from "@/lib/ocrV2DevelopmentTools";
import { mergeToolCatalog, normalizeTool } from "@/lib/server/tools";
import { NAV_TOOLS_FALLBACK } from "@/lib/toolsData";

const expectedDedicatedIds = [
    "ocr-text-v2",
    "searchable-pdf-v2",
    "document-extraction-v2",
    "pdf-to-markdown-v2",
    "highlight-pdf-v2",
    "underline-pdf-v2",
    "strikeout-pdf-v2",
];

const expectedDedicatedHrefs: Record<string, string> = {
    "ocr-text-v2": "/ocr-text-v2",
    "searchable-pdf-v2": "/searchable-pdf-v2",
    "document-extraction-v2": "/document-extraction-v2",
    "pdf-to-markdown-v2": "/pdf-to-markdown-v2",
    "highlight-pdf-v2": "/highlight-pdf-v2",
    "underline-pdf-v2": "/underline-pdf-v2",
    "strikeout-pdf-v2": "/strikeout-pdf-v2",
};

assert.deepEqual([...OCR_V2_DEDICATED_TOOL_IDS], expectedDedicatedIds);
assert.equal(new Set(OCR_V2_DEVELOPMENT_TOOLS.map((surface) => surface.id)).size, OCR_V2_DEVELOPMENT_TOOLS.length, "development surface IDs must be unique");
assert.equal(OCR_V2_DEVELOPMENT_TOOLS.length, 10, "the hub inventory must include all current OCR V2-related user-facing surfaces");

for (const id of expectedDedicatedIds) {
    assert.equal(isOcrV2DevelopmentToolId(id), true, `${id} must remain a direct development route`);
    const surface = getOcrV2DevelopmentRouteConfig(id);
    assert.ok(surface, `${id} must have route metadata`);
    assert.equal(surface?.kind, "dedicated");
    assert.equal(surface?.href, expectedDedicatedHrefs[id], `${id} must enter through its base route`);
    assert.equal(surface?.publicHref, expectedDedicatedHrefs[id], `${id} public route must remain its base route`);
    assert.equal(surface?.href.endsWith("/workspace"), false, `${id} hub destination must not enter the workspace directly`);
    assert.equal(isHiddenOcrV2PublicHref(surface?.publicHref || ""), true, `${id} must be hidden from public discovery`);
}

for (const href of Object.values(expectedDedicatedHrefs)) {
    assert.equal(NAV_TOOLS_FALLBACK.some((tool) => tool.href === href), false, `${href} must remain commented out of the public fallback registry`);
}

for (const href of [
    "/edit-pdf",
    "/pdf-to-word",
    "/studio-v2",
    "/highlight-pdf",
    "/underline-pdf",
    "/strikeout-pdf",
    "/pdf-to-markdown",
    "/pdf-to-text",
    "/image-to-searchable-pdf",
]) {
    assert.equal(isHiddenOcrV2PublicHref(href), false, `${href} must retain its public product entry`);
    assert.equal(NAV_TOOLS_FALLBACK.some((tool) => tool.href === href), true, `${href} must remain in the public fallback registry`);
}

assert.equal(isHiddenOcrV2PublicHref("/highlight-pdf-v2?preview=1"), true);
assert.equal(isHiddenOcrV2PublicHref("highlight-pdf-v2/"), true);

const related = normalizeTool({ title: "Temporary tool", href: "/temporary", related: ["/highlight-pdf-v2", "/highlight-pdf"] });
assert.ok(related);
assert.deepEqual(related?.related, ["/highlight-pdf"]);

const merged = mergeToolCatalog(
    [
        { title: "Hidden backend OCR", description: "hidden", href: "/ocr-text-v2", category: "convert" },
        { title: "Legacy Highlight", description: "legacy", href: "/highlight-pdf", category: "edit" },
    ],
    [{ title: "Hidden static OCR", description: "hidden", href: "/strikeout-pdf-v2", category: "edit" }],
);
assert.deepEqual(merged.map((tool) => tool.href), ["/highlight-pdf"]);

const shared = OCR_V2_DEVELOPMENT_TOOLS.find((surface) => surface.id === "general-editor-ocr-v2");
assert.ok(shared);
assert.equal(shared?.href, "/edit-pdf?ocr_v2=1");
assert.equal(shared?.publicHref, "/edit-pdf");
assert.equal(shared?.kind, "shared");

for (const [id, href] of Object.entries({
    "pdf-to-word-ocr-fallback": "/pdf-to-word",
    "studio-v2": "/studio-v2",
})) {
    const surface = OCR_V2_DEVELOPMENT_TOOLS.find((item) => item.id === id);
    assert.ok(surface, `${id} must remain in the development inventory`);
    assert.equal(surface?.href, href);
    assert.equal(surface?.publicHref, href);
}

console.log("OCR V2 development-surface and public-discovery tests passed.");
