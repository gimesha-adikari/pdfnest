/**
 * Unit regression tests for components/pdf/PdfToolHero.tsx
 *
 * Run: npx tsx tests/unit/pdfToolHero.test.ts
 */

import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hash, PenTool } from "lucide-react";
import PdfToolHero from "../../components/pdf/PdfToolHero";

const tests: Array<[string, () => void]> = [
    [
        "renders successfully when icon is passed as a JSX Element (<Hash />)",
        () => {
            const html = renderToStaticMarkup(
                React.createElement(PdfToolHero, {
                    title: "Configure Page Numbers",
                    description: "Embed automatic sequential pagination elements",
                    icon: React.createElement(Hash, { size: 32, className: "text-blue-500" }),
                })
            );
            assert.ok(html.includes("Configure Page Numbers"), "Title is rendered");
            assert.ok(html.includes("Embed automatic sequential pagination elements"), "Description is rendered");
            assert.ok(html.includes("<svg"), "Hash SVG icon element is rendered");
            assert.ok(html.includes("text-blue-500"), "JSX element custom class is preserved");
        },
    ],
    [
        "renders successfully when icon is passed as a Lucide component function (Hash)",
        () => {
            const html = renderToStaticMarkup(
                React.createElement(PdfToolHero, {
                    title: "Configure Page Numbers",
                    description: "Embed automatic sequential pagination elements",
                    icon: Hash,
                })
            );
            assert.ok(html.includes("Configure Page Numbers"), "Title is rendered");
            assert.ok(html.includes("<svg"), "Component SVG icon is rendered");
            assert.ok(html.includes("text-[var(--primary)]"), "Default theme class is applied");
        },
    ],
    [
        "renders successfully when icon is omitted (undefined)",
        () => {
            const html = renderToStaticMarkup(
                React.createElement(PdfToolHero, {
                    title: "Rotate PDF",
                    description: "Rotate individual pages",
                })
            );
            assert.ok(html.includes("Rotate PDF"), "Title is rendered");
            assert.ok(html.includes("Rotate individual pages"), "Description is rendered");
            assert.ok(!html.includes("<svg"), "No SVG icon is rendered when icon is omitted");
        },
    ],
    [
        "renders successfully when icon is passed as a JSX Element (<PenTool />) from Sign PDF",
        () => {
            const html = renderToStaticMarkup(
                React.createElement(PdfToolHero, {
                    title: "e-Sign PDF Document",
                    description: "Place your signature on any page.",
                    icon: React.createElement(PenTool, { size: 32, className: "text-indigo-500" }),
                })
            );
            assert.ok(html.includes("e-Sign PDF Document"), "Title is rendered");
            assert.ok(html.includes("<svg"), "PenTool SVG icon is rendered");
            assert.ok(html.includes("text-indigo-500"), "PenTool custom class is preserved");
        },
    ],
];

function runTests(): void {
    console.log("Running PdfToolHero regression tests...");
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
