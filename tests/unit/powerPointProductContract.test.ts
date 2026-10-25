import assert from "node:assert/strict";
import { NAV_TOOLS_FALLBACK } from "../../lib/toolsData";
import { normalizeTool } from "../../lib/server/tools";

const bundled = NAV_TOOLS_FALLBACK.find(tool => tool.href === "/pdf-to-powerpoint");
assert.ok(bundled);
assert.match(bundled.description, /image/i, "the description must disclose image-based slides");
assert.match(bundled.seoDescription!, /image/i);
assert.doesNotMatch(JSON.stringify(bundled), /fully editable|entirely editable|fluid, selectable|extracted and placed|extract vector/i);
assert.match(JSON.stringify(bundled.faq), /not individually editable/i);
assert.match(JSON.stringify(bundled.faq), /one slide per PDF page/i);
const staleCMS = normalizeTool({
    ...bundled,
    title: "Fully editable PDF slides",
    description: "Entirely editable text and graphic structures",
    seoTitle: "Editable PowerPoint",
    seoDescription: "Fully editable PowerPoint slides",
    keywords: ["extract vector presentation decks"],
    features: ["Editable text boxes"],
    faq: [{ question: "Can I edit the text?", answer: "Everything is editable" }],
});
assert.ok(staleCMS);
for (const key of ["title", "description", "seoTitle", "seoDescription", "keywords", "faq", "features"] as const) {
    assert.deepEqual(staleCMS[key], bundled[key], `stale CMS ${key} must not override the implemented product contract`);
}
assert.equal(staleCMS.href, "/pdf-to-powerpoint");
assert.equal(staleCMS.toolPolicy, "BACKEND_ONLY");
assert.equal(staleCMS.clientCapable, false);
assert.equal(staleCMS.accept, ".pdf");
assert.equal(staleCMS.multiple, false);
const other = normalizeTool({ title: "Custom merge title", href: "/merge-pdf", category: "organize", description: "Custom description", faq: [{ question: "Custom question", answer: "Custom answer" }] });
assert.equal(other!.description, "Custom description", "unrelated CMS content retains precedence");
assert.equal(other!.faq![0].answer, "Custom answer");
console.log("PASS: image-based PPTX description, SEO, FAQ, stale-CMS protection and unchanged conversion route/policy");
