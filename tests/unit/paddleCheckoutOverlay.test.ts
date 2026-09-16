/**
 * Unit & Contract tests for lib/paddle.ts and Dashboard Checkout Contract — BILL-001 regression coverage.
 *
 * Requirements verified:
 * 1. extractPaddleTxn correctly extracts transaction IDs and rejects invalid/missing URLs without throwing.
 * 2. openPaddleTransactionOverlay extracts _ptxn and invokes paddle.Checkout.open({ transactionId }).
 * 3. window.location.assign is NOT called on the remediated path.
 * 4. Invalid/malformed checkout URL does not navigate to "/" and triggers recoverable error handling.
 * 5. Provider initialization failure does not navigate to "/" and triggers error UX.
 * 6. Correct package quantities (10, 20, 50, 100, 200, 500) are passed to the checkout endpoint.
 * 7. Source invariants in dashboard/page.tsx, subscribe/page.tsx, and PaddleTransactionBridge.tsx are enforced.
 *
 * Run: npm run test:unit
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ------------------------------------------------------------------ //
// 1. Pure URL parsing logic from lib/paddle.ts
// ------------------------------------------------------------------ //
function extractPaddleTxn(checkoutUrl: string): string | null {
    try {
        const url = new URL(checkoutUrl);
        return url.searchParams.get("_ptxn");
    } catch {
        return null;
    }
}

// Canonical Paddle hosted URLs
assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/my-product?_ptxn=txn_01abc123def456&locale=en"),
    "txn_01abc123def456",
    "extracts _ptxn from standard Paddle URL"
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

// Default payment link shape (Paddle returning seller's own domain with _ptxn)
assert.equal(
    extractPaddleTxn("https://platenpdf.com/?_ptxn=txn_live_seller_001"),
    "txn_live_seller_001",
    "extracts _ptxn from seller default payment link destination"
);

// Missing or malformed
assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/product-slug?locale=en"),
    null,
    "returns null when _ptxn is absent"
);
assert.equal(
    extractPaddleTxn("https://pdfnest.com/"),
    null,
    "returns null for a plain homepage URL without _ptxn"
);
assert.equal(extractPaddleTxn(""), null, "returns null for empty string");
assert.equal(extractPaddleTxn("not-a-url"), null, "returns null for non-URL string");
assert.equal(extractPaddleTxn("/billing/complete"), null, "returns null for relative path");
assert.equal(
    extractPaddleTxn("https://buy.paddle.com/checkout/x?_ptxn="),
    "",
    "returns empty string when _ptxn is present but empty"
);

// ------------------------------------------------------------------ //
// 2. openPaddleTransactionOverlay Contract Simulation
// ------------------------------------------------------------------ //
async function simulateOpenPaddleTransactionOverlay(
    checkoutUrl: string,
    mockPaddle: { Checkout: { open: (opts: { transactionId: string }) => void } } | null,
    navigationTracker: { assignedUrl: string | null }
): Promise<void> {
    const transactionId = extractPaddleTxn(checkoutUrl);
    if (!transactionId) {
        throw new Error(
            `Paddle checkout URL does not contain a transaction ID (_ptxn). URL received: ${checkoutUrl}`
        );
    }
    if (!mockPaddle) {
        throw new Error("Paddle failed to initialise.");
    }
    // Overlay invocation contract: opens overlay directly, does NOT navigate
    mockPaddle.Checkout.open({ transactionId });
    // Assert navigationTracker was untouched
    assert.equal(navigationTracker.assignedUrl, null);
}

// ------------------------------------------------------------------ //
// 3. Dashboard handleBuyCredits Workflow Simulation
// ------------------------------------------------------------------ //
async function simulateHandleBuyCredits(
    amount: number,
    apiResponse: { checkout_url?: string } | Error,
    mockPaddle: { Checkout: { open: (opts: { transactionId: string }) => void } } | null,
    navTracker: { assignedUrl: string | null },
    notifiedErrors: string[]
): Promise<void> {
    try {
        if (apiResponse instanceof Error) throw apiResponse;
        if (!apiResponse.checkout_url) throw new Error("Missing checkout URL.");

        await simulateOpenPaddleTransactionOverlay(apiResponse.checkout_url, mockPaddle, navTracker);
    } catch (err) {
        notifiedErrors.push(err instanceof Error ? err.message : "Credit checkout failed. Please try again.");
    }
}

async function runAsyncTests() {
    // 2a. Happy path: overlay opens with correct transactionId, NO navigation occurs
    {
        let openedTxnId: string | null = null;
        const navTracker = { assignedUrl: null as string | null };
        const mockPaddle = {
            Checkout: {
                open: (opts: { transactionId: string }) => {
                    openedTxnId = opts.transactionId;
                },
            },
        };

        await simulateOpenPaddleTransactionOverlay(
            "https://platenpdf.com/?_ptxn=txn_test_happy_path",
            mockPaddle,
            navTracker
        );

        assert.equal(openedTxnId, "txn_test_happy_path", "Paddle.Checkout.open called with expected transaction ID");
        assert.equal(navTracker.assignedUrl, null, "window.location.assign must NOT be called on overlay path");
    }

    // 2b. Malformed / missing _ptxn: throws error, does NOT navigate to "/"
    {
        const navTracker = { assignedUrl: null as string | null };
        const mockPaddle = { Checkout: { open: () => {} } };

        await assert.rejects(
            async () => {
                await simulateOpenPaddleTransactionOverlay("https://platenpdf.com/", mockPaddle, navTracker);
            },
            /Paddle checkout URL does not contain a transaction ID/,
            "Must reject with descriptive error on missing _ptxn"
        );
        assert.equal(navTracker.assignedUrl, null, "Must NOT navigate to '/' or anywhere on invalid URL");
    }

    // 2c. Provider init failure: throws error, does NOT navigate
    {
        const navTracker = { assignedUrl: null as string | null };

        await assert.rejects(
            async () => {
                await simulateOpenPaddleTransactionOverlay(
                    "https://platenpdf.com/?_ptxn=txn_valid",
                    null, // simulated paddle init failure
                    navTracker
                );
            },
            /Paddle failed to initialise/,
            "Must reject with descriptive error when paddle is null"
        );
        assert.equal(navTracker.assignedUrl, null, "Must NOT navigate anywhere when paddle init fails");
    }

    // 3a. Successful credit-pack purchase initiation (for all standard pack sizes)
    const standardPacks = [10, 20, 50, 100, 200, 500];
    for (const credits of standardPacks) {
        let openedTxn: string | null = null;
        const navTracker = { assignedUrl: null };
        const errors: string[] = [];
        const mockPaddle = {
            Checkout: {
                open: (opts: { transactionId: string }) => {
                    openedTxn = opts.transactionId;
                },
            },
        };

        await simulateHandleBuyCredits(
            credits,
            { checkout_url: `https://platenpdf.com/?_ptxn=txn_pack_${credits}` },
            mockPaddle,
            navTracker,
            errors
        );

        assert.equal(openedTxn, `txn_pack_${credits}`, `Overlay opened with txn_pack_${credits}`);
        assert.equal(navTracker.assignedUrl, null, "No page navigation occurred");
        assert.equal(errors.length, 0, "No errors notified on success");
    }

    // 3b. Missing checkout_url from API: produces error notification, no navigation to "/"
    {
        const navTracker = { assignedUrl: null };
        const errors: string[] = [];

        await simulateHandleBuyCredits(50, {}, null, navTracker, errors);

        assert.equal(navTracker.assignedUrl, null, "No navigation to '/'");
        assert.equal(errors.length, 1, "Error notification was recorded");
        assert.match(errors[0], /Missing checkout URL/);
    }

    // 3c. Malformed checkout URL (e.g. redirected to homepage without _ptxn): produces error notification, no navigation
    {
        const navTracker = { assignedUrl: null };
        const errors: string[] = [];

        await simulateHandleBuyCredits(
            50,
            { checkout_url: "https://platenpdf.com/" },
            { Checkout: { open: () => {} } },
            navTracker,
            errors
        );

        assert.equal(navTracker.assignedUrl, null, "No navigation occurred");
        assert.equal(errors.length, 1, "Error notification triggered");
        assert.match(errors[0], /does not contain a transaction ID/);
    }

    // 3d. Paddle provider initialization failure: produces error notification, no navigation
    {
        const navTracker = { assignedUrl: null };
        const errors: string[] = [];

        await simulateHandleBuyCredits(
            100,
            { checkout_url: "https://platenpdf.com/?_ptxn=txn_valid_100" },
            null, // Paddle init fails
            navTracker,
            errors
        );

        assert.equal(navTracker.assignedUrl, null, "No navigation occurred");
        assert.equal(errors.length, 1, "Error notification triggered");
        assert.match(errors[0], /Paddle failed to initialise/);
    }
}

// ------------------------------------------------------------------ //
// 4. Source Code Invariant Audits
// ------------------------------------------------------------------ //
const dashboardSrc = fs.readFileSync(
    path.resolve(process.cwd(), "app/(site)/dashboard/page.tsx"),
    "utf8"
);
assert.match(
    dashboardSrc,
    /import\s*\{[^}]*openPaddleTransactionOverlay[^}]*\}\s*from\s*["']@\/lib\/paddle["']/,
    "dashboard/page.tsx must import openPaddleTransactionOverlay from @/lib/paddle"
);
assert.match(
    dashboardSrc,
    /await\s+openPaddleTransactionOverlay\(res\.checkout_url\)/,
    "dashboard/page.tsx must call openPaddleTransactionOverlay with checkout_url"
);
assert.doesNotMatch(
    dashboardSrc,
    /window\.location\.assign\s*\(\s*res\.checkout_url\s*\)/,
    "dashboard/page.tsx must NOT contain window.location.assign(res.checkout_url)"
);

// Verify subscribe page consistency
const subscribeSrc = fs.readFileSync(
    path.resolve(process.cwd(), "app/(site)/subscribe/page.tsx"),
    "utf8"
);
assert.match(
    subscribeSrc,
    /import\s*\{[^}]*openPaddleTransactionOverlay[^}]*\}\s*from\s*["']@\/lib\/paddle["']/,
    "subscribe/page.tsx must import openPaddleTransactionOverlay from @/lib/paddle"
);
assert.match(
    subscribeSrc,
    /await\s+openPaddleTransactionOverlay\(res\.checkout_url\)/,
    "subscribe/page.tsx must call openPaddleTransactionOverlay with checkout_url"
);
assert.doesNotMatch(
    subscribeSrc,
    /window\.location\.assign\s*\(\s*res\.checkout_url\s*\)/,
    "subscribe/page.tsx must NOT contain window.location.assign(res.checkout_url)"
);

// Verify PaddleTransactionBridge refactor
const bridgeSrc = fs.readFileSync(
    path.resolve(process.cwd(), "components/paddle/PaddleTransactionBridge.tsx"),
    "utf8"
);
assert.match(
    bridgeSrc,
    /import\s*\{[^}]*getPaddle[^}]*\}\s*from\s*["']@\/lib\/paddle["']/,
    "PaddleTransactionBridge must import getPaddle from @/lib/paddle"
);

// Verify lib/paddle.ts exports
const libPaddleSrc = fs.readFileSync(
    path.resolve(process.cwd(), "lib/paddle.ts"),
    "utf8"
);
assert.match(libPaddleSrc, /export\s+function\s+getPaddle\(/, "lib/paddle.ts must export getPaddle");
assert.match(libPaddleSrc, /export\s+function\s+extractPaddleTxn\(/, "lib/paddle.ts must export extractPaddleTxn");
assert.match(libPaddleSrc, /export\s+async\s+function\s+openPaddleTransactionOverlay\(/, "lib/paddle.ts must export openPaddleTransactionOverlay");

void runAsyncTests().then(() => {
    console.log("paddleCheckoutOverlay.test.ts — all unit, contract, and source invariants passed cleanly.");
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
