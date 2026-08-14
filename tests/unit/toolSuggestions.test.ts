/**
 * Unit tests for lib/toolSuggestions.ts
 *
 * Run: npx tsx tests/unit/toolSuggestions.test.ts
 */

import assert from "assert";

import { getSuggestedNextTools } from "../../lib/toolSuggestions";
import { NAV_TOOLS_FALLBACK } from "../../lib/toolsData";

type TestTool = {
    title: string;
    href: string;
    category?: string;
    related?: string[];
    RelatedJson?: string;
};

function hrefs(tools: Array<{ href: string }>): string[] {
    return tools.map((t) => t.href);
}

const catalog: TestTool[] = [
    { title: "Alpha", href: "/alpha", category: "Organize", related: ["/beta", "/gamma"] },
    { title: "Beta", href: "/beta", category: "Organize" },
    { title: "Gamma", href: "/gamma", category: "Organize" },
    { title: "Delta", href: "/delta", category: "Convert" },
    { title: "Epsilon", href: "/epsilon", category: "Convert" },
];

const tests: Array<[string, () => void]> = [
    ["returns nothing for an unknown tool", () => {
        assert.deepEqual(getSuggestedNextTools("/does-not-exist"), []);
        assert.deepEqual(getSuggestedNextTools("/does-not-exist", 3, catalog), []);
    }],

    ["prefers the tool's own related list", () => {
        const result = getSuggestedNextTools("/alpha", 2, catalog);
        assert.deepEqual(hrefs(result), ["/beta", "/gamma"]);
    }],

    ["parses a RelatedJson payload from the CMS shape", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize", RelatedJson: '["/gamma","/beta"]' },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 2, list);
        assert.deepEqual(hrefs(result), ["/gamma", "/beta"]);
    }],

    ["ignores malformed RelatedJson and falls back to the category", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize", RelatedJson: "{oops" },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 2, list);
        assert.deepEqual(hrefs(result), ["/beta", "/gamma"], "same-category tools are used instead");
    }],

    ["never suggests the current tool", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize", related: ["/alpha", "/beta"] },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 3, list);
        assert.ok(!hrefs(result).includes("/alpha"));
    }],

    ["de-duplicates repeated related entries", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize", related: ["/beta", "/beta", "/gamma"] },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 3, list);
        assert.equal(new Set(hrefs(result)).size, hrefs(result).length);
        assert.deepEqual(hrefs(result).slice(0, 2), ["/beta", "/gamma"]);
    }],

    ["skips related entries that are not in the catalog", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Convert", related: ["/missing", "/delta"] },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 1, list);
        assert.deepEqual(hrefs(result), ["/delta"]);
    }],

    ["normalizes related hrefs that are missing a leading slash", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize", related: ["beta"] },
            ...catalog.slice(1),
        ];

        const result = getSuggestedNextTools("/alpha", 1, list);
        assert.deepEqual(hrefs(result), ["/beta"]);
    }],

    ["tops up from the same category when related entries are too few", () => {
        const list: TestTool[] = [
            { title: "Delta", href: "/delta", category: "Convert", related: ["/alpha"] },
            { title: "Alpha", href: "/alpha", category: "Organize" },
            { title: "Epsilon", href: "/epsilon", category: "Convert" },
        ];

        const result = getSuggestedNextTools("/delta", 2, list);
        assert.deepEqual(hrefs(result), ["/alpha", "/epsilon"]);
    }],

    ["matches categories case-insensitively", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "ORGANIZE" },
            { title: "Beta", href: "/beta", category: "organize" },
        ];

        const result = getSuggestedNextTools("/alpha", 1, list);
        assert.deepEqual(hrefs(result), ["/beta"]);
    }],

    ["falls back to any tool when related and category yield too few", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha" },
            { title: "Delta", href: "/delta", category: "Convert" },
        ];

        const result = getSuggestedNextTools("/alpha", 1, list);
        assert.deepEqual(hrefs(result), ["/delta"], "uncategorised tools still get a suggestion");
    }],

    ["respects the limit", () => {
        assert.equal(getSuggestedNextTools("/alpha", 1, catalog).length, 1);
        assert.equal(getSuggestedNextTools("/alpha", 4, catalog).length, 4);
        assert.equal(getSuggestedNextTools("/alpha", 0, catalog).length, 0);
    }],

    ["never returns more suggestions than the catalog can provide", () => {
        const list: TestTool[] = [
            { title: "Alpha", href: "/alpha", category: "Organize" },
            { title: "Beta", href: "/beta", category: "Organize" },
        ];

        assert.deepEqual(hrefs(getSuggestedNextTools("/alpha", 5, list)), ["/beta"]);
    }],

    ["falls back to the bundled catalog when no list is provided", () => {
        const result = getSuggestedNextTools("/merge-pdf");

        assert.equal(result.length, 3);
        assert.ok(!hrefs(result).includes("/merge-pdf"));
        for (const href of hrefs(result)) {
            assert.ok(
                NAV_TOOLS_FALLBACK.some((tool) => tool.href === href),
                `${href} is part of the bundled catalog`
            );
        }
    }],

    ["falls back to the bundled catalog when the provided list is empty", () => {
        const result = getSuggestedNextTools("/merge-pdf", 3, []);
        assert.equal(result.length, 3);
    }],

    ["uses the static hint list for tools without related entries", () => {
        const list: TestTool[] = [
            { title: "Merge", href: "/merge-pdf", category: "Organize" },
            { title: "Reorder", href: "/reorder-pages", category: "Organize" },
            { title: "Compress", href: "/compress-pdf", category: "Optimize" },
            { title: "Split", href: "/split-pdf", category: "Organize" },
        ];

        const result = getSuggestedNextTools("/merge-pdf", 3, list);
        assert.deepEqual(hrefs(result), ["/split-pdf", "/compress-pdf", "/reorder-pages"]);
    }],

    ["skips hint targets that are absent from the catalog", () => {
        const list: TestTool[] = [
            { title: "Unlock", href: "/unlock-pdf", category: "Security" },
            { title: "Sign", href: "/sign-pdf", category: "Security" },
        ];

        const result = getSuggestedNextTools("/unlock-pdf", 2, list);
        assert.deepEqual(hrefs(result), ["/sign-pdf"], "/protect-pdf is not in the catalog and is skipped");
    }],

    ["every bundled tool gets suggestions that exclude itself", () => {
        for (const tool of NAV_TOOLS_FALLBACK) {
            const result = getSuggestedNextTools(tool.href, 3);
            assert.ok(result.length > 0, `${tool.href} has suggestions`);
            assert.ok(!hrefs(result).includes(tool.href), `${tool.href} does not suggest itself`);
            assert.equal(new Set(hrefs(result)).size, result.length, `${tool.href} has no duplicates`);
        }
    }],
];

function runTests(): void {
    console.log("Running toolSuggestions tests...");
    let passed = 0;
    let failed = 0;

    for (const [name, fn] of tests) {
        try {
            fn();
            passed += 1;
            console.log(`  PASS  ${name}`);
        } catch (e) {
            failed += 1;
            console.error(`  FAIL  ${name}`);
            console.error(`        ${(e as Error).message}`);
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests();
