/**
 * Unit tests for the extractPaddleTxn URL parsing logic — BILL-001 regression.
 *
 * extractPaddleTxn underpins openPaddleTransactionOverlay in lib/paddle.ts.
 * We inline the pure implementation here to avoid importing the full Paddle
 * SDK (which requires a browser DOM) in a Node.js test runner.
 *
 * Regression: BILL-001 — Dashboard credit-pack checkout redirected to "/"
 * instead of opening the Paddle checkout overlay.
 *
 * Run: npm run test:unit
 */

import assert from "node:assert/strict";

/**
 * Inline copy of the pure URL-parsing logic from lib/paddle.ts.
 * Kept in sync with the source; any divergence is a test smell.
 */
function extractPaddleTxn(checkoutUrl: string): string | null {
    try {
        const url = new URL(checkoutUrl);
        return url.searchParams.get("_ptxn");
    } catch {
        return null;
    }
}

// ------------------------------------------------------------------ //
// Happy-path: canonical Paddle hosted checkout URLs
// ------------------------------------------------------------------ //

assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/my-product?_ptxn=txn_01abc123def456&locale=en"),
    "txn_01abc123def456",
    "extracts _ptxn from a standard Paddle URL"
);

assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/product-slug?_ptxn=txn_99zzz"),
    "txn_99zzz",
    "extracts _ptxn when it is the only query parameter"
);

assert.equal(
    extractPaddleTxn("https://sandbox-buy.paddle.com/checkout/test?_ptxn=txn_sandbox_01xyz"),
    "txn_sandbox_01xyz",
    "extracts _ptxn from a sandbox Paddle URL"
);

assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/x?locale=fr&_ptxn=txn_001&theme=dark"),
    "txn_001",
    "extracts _ptxn even when other params appear before it"
);

// ------------------------------------------------------------------ //
// Edge cases: missing or malformed URLs
// ------------------------------------------------------------------ //

assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/product-slug?locale=en"),
    null,
    "returns null when _ptxn is absent from the URL"
);

assert.equal(
    // BILL-001 root cause: Paddle hosted page redirected to "/" when no
    // returnUrl was configured on the transaction.
    extractPaddleTxn("https://pdfnest.com/"),
    null,
    "returns null for a plain homepage URL (BILL-001 regression simulation)"
);

assert.equal(
    extractPaddleTxn(""),
    null,
    "returns null for an empty string"
);

assert.equal(
    extractPaddleTxn("not-a-url"),
    null,
    "returns null for a non-URL string"
);

assert.equal(
    // URL constructor requires absolute URLs; relative paths throw → null.
    extractPaddleTxn("/billing/complete"),
    null,
    "returns null for a relative path with no _ptxn"
);

assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/x?_ptxn="),
    "",
    "returns empty string when _ptxn param exists but has no value"
);

console.log("paddleCheckoutOverlay.test.ts — all 10 assertions passed (BILL-001 regression)");
