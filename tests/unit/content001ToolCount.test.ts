/**
 * CONTENT-001 deterministic contract for the About-page tool count.
 *
 * The PDF-tools highlight must derive its displayed count from the same
 * canonical value as the top statistic, even when CMS title data is stale.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const root = process.cwd();
    const aboutSource = fs.readFileSync(
        path.resolve(root, "app/(site)/about/page.tsx"),
        "utf8"
    );
    const toolsDataSource = fs.readFileSync(
        path.resolve(root, "lib/toolsData.ts"),
        "utf8"
    );
    assert.match(
        toolsDataSource,
        /export const TOTAL_TOOL_COUNT\s*=\s*39\b/,
        "the qualified catalog fallback count must remain 39"
    );
    assert.match(
        aboutSource,
        /const resolvedToolCount = resolveAboutToolCount\(totalCount\);/,
        "About must resolve one shared count value"
    );
    assert.match(
        aboutSource,
        /value:\s*resolvedToolCount \+ "\+",\s*label:\s*"PDF Tools Available"/,
        "the top statistic must use the shared count"
    );
    assert.match(
        aboutSource,
        /resolveAboutHighlightTitle\(item,\s*resolvedToolCount\)/,
        "the highlight title must use the shared count"
    );
    assert.doesNotMatch(
        aboutSource,
        /\{item\.title\}/,
        "the highlight heading must not render the CMS title directly"
    );
    const helperSource = fs.readFileSync(
        path.resolve(root, "lib/aboutToolCount.ts"),
        "utf8"
    );
    assert.match(
        helperSource,
        /item\.icon_type === "file"/,
        "the PDF-tools highlight must be identified by its stable icon type"
    );
    assert.doesNotMatch(
        helperSource,
        /37\+\s*PDF Tools/,
        "the count helper must not retain the stale CMS number"
    );

    const { NAV_TOOLS_FALLBACK } = await import("../../lib/toolsData");
    const {
        resolveAboutHighlightTitle,
        resolveAboutToolCount,
    } = await import("../../lib/aboutToolCount");

    assert.equal(
        NAV_TOOLS_FALLBACK.length,
        39,
        "the active fallback catalog must contain 39 tools"
    );
    assert.equal(resolveAboutToolCount(39), 39);
    assert.equal(resolveAboutToolCount(40), 40);
    assert.equal(
        resolveAboutHighlightTitle(
            { title: "37+ PDF Tools", icon_type: "file" },
            39
        ),
        "39+ PDF Tools",
        "stale CMS text must not override the canonical count"
    );
    assert.equal(
        resolveAboutHighlightTitle(
            { title: "37+ PDF Tools", icon_type: "file" },
            40
        ),
        "40+ PDF Tools",
        "future catalog drift must update the rendered count"
    );
    assert.equal(
        resolveAboutHighlightTitle(
            { title: "PDF Tools", icon_type: "file" },
            39
        ),
        "39+ PDF Tools",
        "the semantic CMS title must still render the canonical count"
    );
    assert.equal(
        resolveAboutHighlightTitle(
            { title: "PDF Tools", icon_type: "file" },
            40
        ),
        "40+ PDF Tools",
        "the semantic CMS title must continue to follow future catalog drift"
    );
    assert.equal(
        resolveAboutHighlightTitle(
            { title: "Virtual Document Studio", icon_type: "layers" },
            39
        ),
        "Virtual Document Studio",
        "unrelated CMS highlight titles must remain unchanged"
    );

    console.log("CONTENT-001 dynamic About tool-count contract passed.");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
