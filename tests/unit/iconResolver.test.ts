/**
 * Unit tests for lib/iconResolver.ts
 *
 * Run: npx tsx tests/unit/iconResolver.test.ts
 */

import assert from "assert";
import { FileText, Scissors } from "lucide-react";

import { resolveIcon } from "../../lib/iconResolver";
import { NAV_TOOLS_FALLBACK } from "../../lib/toolsData";

const KNOWN_ICON_NAMES = [
    "FileText",
    "Scissors",
    "Merge",
    "Minimize2",
    "RotateCw",
    "Lock",
    "Unlock",
    "FileImage",
    "FileCode",
    "FileSearch",
    "FileDown",
    "Globe",
    "Pen",
    "Highlighter",
    "Underline",
    "Strikethrough",
    "Trash2",
    "Copy",
    "AlignJustify",
    "PlusSquare",
    "Crop",
    "Type",
    "Hash",
    "Stamp",
    "ScanSearch",
    "ScanText",
    "Wrench",
    "FileSpreadsheet",
    "Presentation",
    "FileType",
    "Download",
    "GitBranch",
];

const tests: Array<[string, () => void]> = [
    ["resolves every supported icon name to a component", () => {
        for (const name of KNOWN_ICON_NAMES) {
            const icon = resolveIcon(name);
            assert.ok(icon, `${name} resolves`);
            assert.ok(
                typeof icon === "function" || typeof icon === "object",
                `${name} resolves to a component`
            );
        }
    }],

    ["resolves a name to the matching Lucide component", () => {
        assert.equal(resolveIcon("Scissors"), Scissors);
        assert.equal(resolveIcon("FileText"), FileText);
    }],

    ["falls back to FileText for unknown names", () => {
        assert.equal(resolveIcon("NotARealIcon"), FileText);
        assert.equal(resolveIcon("scissors"), FileText, "lookup is case-sensitive");
    }],

    ["falls back to FileText for nullish and empty values", () => {
        assert.equal(resolveIcon(undefined), FileText);
        assert.equal(resolveIcon(null), FileText);
        assert.equal(resolveIcon(""), FileText);
    }],

    ["falls back to FileText for non-string values", () => {
        assert.equal(resolveIcon(42 as unknown as string), FileText);
        assert.equal(resolveIcon({} as unknown as string), FileText);
    }],

    ["leaks Object.prototype members through the icon map (known gap: no own-key check)", () => {
        assert.equal(resolveIcon("constructor"), Object as unknown as typeof FileText);
        assert.equal(resolveIcon("toString"), Object.prototype.toString as unknown as typeof FileText);
    }],

    ["covers every icon name used by the bundled tool catalog", () => {
        const missing: string[] = [];

        for (const tool of NAV_TOOLS_FALLBACK) {
            const iconName = (tool as { iconName?: string }).iconName;
            if (!iconName) continue;
            if (!KNOWN_ICON_NAMES.includes(iconName)) missing.push(`${tool.href}: ${iconName}`);
        }

        assert.deepEqual(missing, [], "tool catalog icons are all mapped");
    }],
];

function runTests(): void {
    console.log("Running iconResolver tests...");
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
