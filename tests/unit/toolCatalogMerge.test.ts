import assert from "assert";
import { ToolItem, NAV_TOOLS_FALLBACK } from "@/lib/toolsData";
import { mergeToolCatalog, getToolCanonicalKey, normalizeTool } from "@/lib/server/tools";

function runTests() {
    console.log("--- Running Tool Catalog Merge Unit Tests ---");

    // Test 1: Backend-only tool + toolsData static tool
    {
        const backendTools: ToolItem[] = [
            { title: "Tool A", description: "Backend Tool A", href: "/tool-a", category: "organize" },
        ];
        const staticTools: ToolItem[] = [
            { title: "Tool B", description: "Static Tool B", href: "/tool-b", category: "convert" },
        ];

        const merged = mergeToolCatalog(backendTools, staticTools);
        assert.strictEqual(merged.length, 2, "Test 1: Merged catalog length should be 2");
        assert.strictEqual(merged[0].href, "/tool-a", "Test 1: First tool should be backend Tool A");
        assert.strictEqual(merged[1].href, "/tool-b", "Test 1: Second tool should be static Tool B");
        console.log("✔ Test 1 Passed: Backend-only tool + static-only tool merged cleanly");
    }

    // Test 2: Duplicate tool (Backend precedence)
    {
        const backendTools: ToolItem[] = [
            { title: "Backend Version of Merge PDF", description: "DB Version", href: "/merge-pdf", category: "organize" },
        ];
        const staticTools: ToolItem[] = [
            { title: "Static Merge PDF", description: "Static Version", href: "/merge-pdf", category: "organize" },
        ];

        const merged = mergeToolCatalog(backendTools, staticTools);
        assert.strictEqual(merged.length, 1, "Test 2: Duplicate tool should be deduplicated to 1 item");
        assert.strictEqual(merged[0].title, "Backend Version of Merge PDF", "Test 2: Backend tool must take precedence over static tool");
        console.log("✔ Test 2 Passed: Backend version takes precedence on duplicate ID");
    }

    // Test 3: Backend has multiple tools + static toolsData
    {
        const backendTools: ToolItem[] = [
            { title: "Tool A", description: "A", href: "/tool-a", category: "organize" },
            { title: "Tool B", description: "B", href: "/tool-b", category: "edit" },
            { title: "Tool C", description: "C", href: "/tool-c", category: "convert" },
        ];
        const staticTools: ToolItem[] = [
            { title: "Tool A", description: "Static A", href: "/tool-a", category: "organize" },
            { title: "Tool B", description: "Static B", href: "/tool-b", category: "edit" },
            { title: "Tool C", description: "Static C", href: "/tool-c", category: "convert" },
            { title: "Tool D", description: "Static D", href: "/tool-d", category: "security" },
        ];

        const merged = mergeToolCatalog(backendTools, staticTools);
        assert.strictEqual(merged.length, 4, "Test 3: Total merged count should be 4");
        assert.deepStrictEqual(merged.map(t => t.href), ["/tool-a", "/tool-b", "/tool-c", "/tool-d"], "Test 3: Order should preserve backend order then append static D");
        console.log("✔ Test 3 Passed: Multiple backend + static tools merged in correct order");
    }

    // Test 4: Empty backend array
    {
        const backendTools: ToolItem[] = [];
        const staticTools: ToolItem[] = [
            { title: "Tool A", description: "Static A", href: "/tool-a", category: "organize" },
            { title: "Tool B", description: "Static B", href: "/tool-b", category: "convert" },
        ];

        const merged = mergeToolCatalog(backendTools, staticTools);
        assert.strictEqual(merged.length, 2, "Test 4: Merged list should match static list when backend is empty");
        console.log("✔ Test 4 Passed: Empty backend array returns static catalog");
    }

    // Test 5: PDF → Markdown presence
    {
        const staticNormalized = NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);
        const mockBackendTools: ToolItem[] = [
            { title: "Merge PDF", description: "Merge", href: "/merge-pdf", category: "organize" },
            { title: "Split PDF", description: "Split", href: "/split-pdf", category: "organize" },
        ];

        const merged = mergeToolCatalog(mockBackendTools, staticNormalized);
        const pdfToMd = merged.find(t => t.href === "/pdf-to-markdown");
        assert.ok(pdfToMd, "Test 5: pdf-to-markdown must be present in merged catalog even when absent from backend");
        assert.strictEqual(pdfToMd.title, "PDF to Markdown", "Test 5: pdf-to-markdown title should match static entry");
        assert.strictEqual(pdfToMd.href, "/pdf-to-markdown", "Test 5: pdf-to-markdown route must be /pdf-to-markdown");
        console.log("✔ Test 5 Passed: pdf-to-markdown is present in merged catalog when absent from backend");
    }

    // Test 6: No duplicate IDs assertion
    {
        const staticNormalized = NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);
        const mockBackendTools: ToolItem[] = staticNormalized.slice(0, 10).map(t => ({
            ...t,
            title: `Backend ${t.title}`,
        }));

        const merged = mergeToolCatalog(mockBackendTools, staticNormalized);
        const keys = merged.map(getToolCanonicalKey);
        const uniqueKeys = new Set(keys);

        assert.strictEqual(uniqueKeys.size, merged.length, "Test 6: All tool keys in merged catalog must be unique");
        assert.strictEqual(merged.length, staticNormalized.length, "Test 6: Merged total length should equal full static catalog size");
        console.log("✔ Test 6 Passed: No duplicate tool keys in merged catalog");
    }

    console.log("--- All Tool Catalog Merge Unit Tests Passed ---");
}

runTests();
