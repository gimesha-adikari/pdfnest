/**
 * Unit tests for lib/commands.ts
 *
 * Run: npx tsx tests/unit/commands.test.ts
 */

import assert from "assert";

import { Command, getCommands } from "../../lib/commands";
import { NAV_TOOLS_FALLBACK } from "../../lib/toolsData";

function byType(commands: Command[], type: Command["type"]): Command[] {
    return commands.filter((c) => c.type === type);
}

const tests: Array<[string, () => void]> = [
    ["falls back to the bundled tool catalog", () => {
        const commands = getCommands();
        const toolCommands = byType(commands, "tool");

        assert.equal(toolCommands.length, NAV_TOOLS_FALLBACK.length);
        for (const tool of NAV_TOOLS_FALLBACK) {
            assert.ok(
                toolCommands.some((c) => c.href === tool.href && c.title === tool.title),
                `${tool.href} is exposed as a command`
            );
        }
    }],

    ["orders pages first, then tools, then actions", () => {
        const commands = getCommands([{ href: "/only", title: "Only" }]);

        assert.deepEqual(commands.map((c) => c.type), ["page", "page", "page", "tool", "action"]);
    }],

    ["always exposes the static page commands", () => {
        const pages = byType(getCommands(), "page");

        assert.deepEqual(
            pages.map((p) => [p.id, p.href]),
            [
                ["home", "/"],
                ["tools", "/tools"],
                ["about", "/about"],
            ]
        );
    }],

    ["always exposes the theme toggle action without an href", () => {
        const actions = byType(getCommands(), "action");

        assert.equal(actions.length, 1);
        assert.equal(actions[0].id, "theme");
        assert.equal(actions[0].title, "Toggle Theme");
        assert.equal(actions[0].href, undefined);
    }],

    ["maps a provided lowercase tool list", () => {
        const commands = getCommands([
            { href: "/merge-pdf", title: "Merge PDF", description: "Combine files" },
        ]);
        const tool = byType(commands, "tool")[0];

        assert.equal(tool.id, "/merge-pdf");
        assert.equal(tool.href, "/merge-pdf");
        assert.equal(tool.title, "Merge PDF");
        assert.equal(tool.description, "Combine files");
    }],

    ["maps the PascalCase CMS tool shape", () => {
        const commands = getCommands([
            { Href: "/split-pdf", Title: "Split PDF", Description: "Split a file" },
        ]);
        const tool = byType(commands, "tool")[0];

        assert.equal(tool.id, "/split-pdf");
        assert.equal(tool.href, "/split-pdf");
        assert.equal(tool.title, "Split PDF");
        assert.equal(tool.description, "Split a file");
    }],

    ["prefers lowercase fields when both casings are present", () => {
        const commands = getCommands([
            { href: "/a", Href: "/b", title: "Lower", Title: "Upper", description: "lower", Description: "upper" },
        ]);
        const tool = byType(commands, "tool")[0];

        assert.equal(tool.href, "/a");
        assert.equal(tool.title, "Lower");
        assert.equal(tool.description, "lower");
    }],

    ["leaves the description undefined when the tool has none", () => {
        const tool = byType(getCommands([{ href: "/x", title: "X" }]), "tool")[0];

        assert.equal(tool.description, undefined);
    }],

    ["returns only pages and actions for an empty tool list", () => {
        const commands = getCommands([]);

        assert.equal(byType(commands, "tool").length, 0);
        assert.equal(byType(commands, "page").length, 3);
        assert.equal(byType(commands, "action").length, 1);
    }],

    ["every command has an id and a title", () => {
        for (const command of getCommands()) {
            assert.ok(command.id, "command has an id");
            assert.ok(command.title, `command ${command.id} has a title`);
        }
    }],

    ["command ids are unique", () => {
        const ids = getCommands().map((c) => c.id);

        assert.equal(new Set(ids).size, ids.length);
    }],
];

function runTests(): void {
    console.log("Running commands tests...");
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
