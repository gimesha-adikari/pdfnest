import assert from "assert";
import { NAV_TOOLS_FALLBACK, TOTAL_TOOL_COUNT, OFFLINE_TOOL_COUNT, isToolAvailableOffline, ToolItem } from "@/lib/toolsData";
import { normalizeTool } from "@/lib/server/tools";

console.log("Running Tool Normalization & Capability Inheritance Unit Tests...");

// 1. Test Static Fallback Normalization
const staticNormalized = NAV_TOOLS_FALLBACK.map(normalizeTool).filter((t): t is ToolItem => t !== null);
assert.strictEqual(staticNormalized.length, TOTAL_TOOL_COUNT, `Expected ${TOTAL_TOOL_COUNT} normalized tools from static fallback`);

const staticOffline = staticNormalized.filter(isToolAvailableOffline);
assert.strictEqual(staticOffline.length, OFFLINE_TOOL_COUNT, `Expected ${OFFLINE_TOOL_COUNT} offline tools from static fallback`);

// 2. Test Raw CMS Payload WITHOUT Capability Metadata (Simulating Go backend DynamicToolItem DB records)
const rawCmsPayload = NAV_TOOLS_FALLBACK.map((tool, index) => ({
    id: index + 1,
    title: `CMS ${tool.title}`,
    description: `CMS description for ${tool.title}`,
    href: tool.href,
    category: tool.category,
    isActive: true,
    // Note: No capability, clientCapable, or toolPolicy properties exist in raw CMS DB response
}));

const cmsNormalized = rawCmsPayload.map(normalizeTool).filter((t): t is ToolItem => t !== null);
assert.strictEqual(cmsNormalized.length, TOTAL_TOOL_COUNT, `Expected ${TOTAL_TOOL_COUNT} normalized tools from CMS payload`);

// Verify that CMS-owned marketing content is preserved
assert.strictEqual(cmsNormalized[0].title, `CMS ${NAV_TOOLS_FALLBACK[0].title}`);
assert.strictEqual(cmsNormalized[0].description, `CMS description for ${NAV_TOOLS_FALLBACK[0].title}`);

// Verify that runtime capability metadata was inherited from the static registry
for (const tool of cmsNormalized) {
    assert.notStrictEqual(tool.capability, undefined, `Tool ${tool.href} must have capability metadata`);
    assert.notStrictEqual(tool.clientCapable, undefined, `Tool ${tool.href} must have clientCapable flag`);
    assert.notStrictEqual(tool.toolPolicy, undefined, `Tool ${tool.href} must have toolPolicy`);
}

// 3. Verify Offline Filter on Normalized CMS Tools
const cmsOffline = cmsNormalized.filter(isToolAvailableOffline);
assert.strictEqual(
    cmsOffline.length,
    OFFLINE_TOOL_COUNT,
    `Expected exactly ${OFFLINE_TOOL_COUNT} offline-capable tools from normalized CMS payload, got ${cmsOffline.length}`
);

// Verify expected offline tools are present
const offlineHrefs = new Set(cmsOffline.map((t) => t.href));
assert.ok(offlineHrefs.has("/merge-pdf"), "Merge PDF must be offline-capable");
assert.ok(offlineHrefs.has("/split-pdf"), "Split PDF must be offline-capable");
assert.ok(offlineHrefs.has("/rotate-pdf"), "Rotate PDF must be offline-capable");
assert.ok(offlineHrefs.has("/watermark-pdf"), "Watermark PDF must be offline-capable");
assert.ok(offlineHrefs.has("/add-page-numbers"), "Add Page Numbers must be offline-capable");
assert.ok(offlineHrefs.has("/add-text"), "Add Text must be offline-capable");
assert.ok(offlineHrefs.has("/images-to-pdf"), "Images to PDF must be offline-capable");
assert.ok(offlineHrefs.has("/crop-pdf"), "Crop PDF must be offline-capable");
assert.ok(offlineHrefs.has("/pdf-to-images"), "PDF to Images must be offline-capable");
assert.ok(offlineHrefs.has("/unlock-pdf"), "Unlock PDF must be offline-capable");
assert.ok(offlineHrefs.has("/lock-pdf"), "Protect/Lock PDF must be offline-capable");
assert.ok(offlineHrefs.has("/pdf-to-text"), "PDF to Text must be offline-capable");
assert.ok(offlineHrefs.has("/compress-pdf"), "Compress PDF must be offline-capable");
assert.ok(offlineHrefs.has("/highlight-pdf"), "Highlight PDF must be offline-capable");
assert.ok(offlineHrefs.has("/underline-pdf"), "Underline PDF must be offline-capable");
assert.ok(offlineHrefs.has("/strikeout-pdf"), "Strikeout PDF must be offline-capable");
assert.ok(offlineHrefs.has("/code-to-pdf"), "Code to PDF must be offline-capable");
assert.ok(offlineHrefs.has("/markdown-to-pdf"), "Markdown to PDF must be offline-capable");
assert.ok(offlineHrefs.has("/edit-metadata"), "Edit Metadata must be offline-capable (with fallback)");
assert.ok(offlineHrefs.has("/studio"), "Studio must be offline-capable (hybrid workspace)");

// Verify backend-required tools are NOT in offline set
assert.ok(!offlineHrefs.has("/edit-pdf"), "Edit PDF must NOT be offline-capable");
assert.ok(!offlineHrefs.has("/word-to-pdf"), "Word to PDF must NOT be offline-capable");
assert.ok(!offlineHrefs.has("/redact-pdf"), "Redact PDF must NOT be offline-capable");

// 4. Test Precedence: Explicit CMS Capability Overrides Static Registry
const cmsWithExplicitOverride = {
    id: 99,
    title: "Custom Tool",
    href: "/merge-pdf",
    category: "organize",
    capability: {
        clientExecutable: false,
        workspaceOffline: false,
        requiresBackend: true,
        offlineReason: "Temporarily disabled by admin",
    },
};

const normalizedOverride = normalizeTool(cmsWithExplicitOverride);
assert.ok(normalizedOverride !== null);
assert.strictEqual(normalizedOverride.capability?.workspaceOffline, false, "Explicit CMS capability must override static fallback");
assert.strictEqual(normalizedOverride.capability?.offlineReason, "Temporarily disabled by admin");

console.log("All Tool Normalization & Capability Inheritance Unit Tests passed successfully! ✓");
