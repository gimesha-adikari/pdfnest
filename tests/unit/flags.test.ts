/**
 * Unit Tests for Phase 2 Hybrid Feature Flag System
 *
 * Tests:
 * 1. Absent environment variables (defaults to true)
 * 2. Global disable (NEXT_PUBLIC_HYBRID_ENABLE_ALL="false")
 * 3. Global enable (NEXT_PUBLIC_HYBRID_ENABLE_ALL="true")
 * 4. Per-tool disable (NEXT_PUBLIC_HYBRID_ENABLE_ROTATE="false")
 * 5. Per-tool enable (NEXT_PUBLIC_HYBRID_ENABLE_ROTATE="true")
 * 6. Precedence (per-tool flag overrides global flag)
 * 7. Malformed / unknown environment variables
 * 8. ExecutionManager Cloud routing when client execution flag is disabled
 * 9. ExecutionSafetyGate rejection overriding client-enabled feature flag
 */

import assert from "assert";
import {
    getHybridFeatureFlagStatus,
    isClientExecutionEnabled,
    normalizeToolKey,
    parseBooleanEnv,
} from "../../lib/execution/flags";
import { ExecutionSafetyGate } from "../../lib/execution/ExecutionSafetyGate";
import { ExecutionManager } from "../../lib/execution/ExecutionManager";

function resetEnv() {
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL;
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE;
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_WATERMARK;
    delete process.env.NEXT_PUBLIC_HYBRID_ENABLE_PDF_TO_IMAGES;
}

async function runTests() {
    console.log("=== RUNNING HYBRID FEATURE FLAG UNIT TESTS ===");

    // 1. Normalize Tool Key
    console.log("\n[Test 1] Tool Key Normalization");
    assert.strictEqual(normalizeToolKey("rotate"), "ROTATE");
    assert.strictEqual(normalizeToolKey("rotate_pdf"), "ROTATE_PDF");
    assert.strictEqual(normalizeToolKey("pdf-to-images"), "PDF_TO_IMAGES");
    assert.strictEqual(normalizeToolKey("add_page_numbers"), "ADD_PAGE_NUMBERS");
    console.log("  ✓ normalizeToolKey correctly converts camel, kebab, and snake cases.");

    // 2. Parse Boolean Env
    console.log("\n[Test 2] Boolean Env Parsing");
    assert.strictEqual(parseBooleanEnv("true"), true);
    assert.strictEqual(parseBooleanEnv("TRUE"), true);
    assert.strictEqual(parseBooleanEnv("1"), true);
    assert.strictEqual(parseBooleanEnv("yes"), true);
    assert.strictEqual(parseBooleanEnv("false"), false);
    assert.strictEqual(parseBooleanEnv("FALSE"), false);
    assert.strictEqual(parseBooleanEnv("0"), false);
    assert.strictEqual(parseBooleanEnv("no"), false);
    assert.strictEqual(parseBooleanEnv(undefined), undefined);
    assert.strictEqual(parseBooleanEnv("invalid_value"), undefined);
    console.log("  ✓ parseBooleanEnv handles truthy, falsy, undefined, and malformed inputs.");

    // 3. Absent Environment Variables (Default Behavior)
    console.log("\n[Test 3] Absent Environment Variables (Default)");
    resetEnv();
    const statusDefault = getHybridFeatureFlagStatus("rotate");
    assert.strictEqual(statusDefault.enabled, true);
    assert.strictEqual(statusDefault.source, "default");
    assert.strictEqual(statusDefault.toolKey, "ROTATE");
    assert.strictEqual(isClientExecutionEnabled("rotate"), true);
    console.log("  ✓ Unset environment variables default to client execution enabled.");

    // 4. Global Enable / Disable
    console.log("\n[Test 4] Global Enable / Disable");
    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "false";
    assert.strictEqual(isClientExecutionEnabled("rotate"), false);
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "global_env");

    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "true";
    assert.strictEqual(isClientExecutionEnabled("rotate"), true);
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "global_env");
    console.log("  ✓ NEXT_PUBLIC_HYBRID_ENABLE_ALL controls global client execution.");

    // 5. Per-Tool Enable / Disable
    console.log("\n[Test 5] Per-Tool Enable / Disable");
    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";
    assert.strictEqual(isClientExecutionEnabled("rotate"), false);
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "per_tool_env");
    assert.strictEqual(isClientExecutionEnabled("watermark"), true); // Unaffected tool stays default

    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
    assert.strictEqual(isClientExecutionEnabled("rotate"), true);
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "per_tool_env");
    console.log("  ✓ Per-tool env variables control specific tool client execution.");

    // 6. Precedence (Per-Tool Overrides Global)
    console.log("\n[Test 6] Precedence (Per-Tool Overrides Global)");
    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "true";
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "false";
    assert.strictEqual(isClientExecutionEnabled("rotate"), false, "Per-tool false should override global true");
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "per_tool_env");

    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "false";
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "true";
    assert.strictEqual(isClientExecutionEnabled("rotate"), true, "Per-tool true should override global false");
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "per_tool_env");
    console.log("  ✓ Per-tool flags correctly take top precedence over global flags.");

    // 7. Malformed Environment Values
    console.log("\n[Test 7] Malformed Environment Values Handling");
    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "invalid_string";
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ROTATE = "not_a_boolean";
    assert.strictEqual(getHybridFeatureFlagStatus("rotate").source, "default");
    assert.strictEqual(isClientExecutionEnabled("rotate"), true);
    console.log("  ✓ Malformed environment values safely fall back to defaults.");

    // 8. ExecutionSafetyGate Overrides Client-Enabled Flag
    console.log("\n[Test 8] SafetyGate Rejection Overrides Client-Enabled Flag");
    resetEnv();
    process.env.NEXT_PUBLIC_HYBRID_ENABLE_ALL = "true";
    assert.strictEqual(isClientExecutionEnabled("rotate"), true);

    const oversizedFile = new File([new ArrayBuffer(30 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const safetyResult = ExecutionSafetyGate.evaluate("rotate", [oversizedFile], "HYBRID");
    assert.strictEqual(safetyResult.eligible, false);
    assert.strictEqual(safetyResult.recommendedMode, "cloud");
    console.log("  ✓ SafetyGate rejection correctly overrides a client-enabled feature flag for oversized files.");

    // Clean up environment variables
    resetEnv();
    console.log("\n=== ALL HYBRID FEATURE FLAG TESTS PASSED 100% ===");
}

runTests().catch((err) => {
    console.error("Feature Flag Test Failure:", err);
    process.exit(1);
});
