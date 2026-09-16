/**
 * Paddle checkout overlay utilities.
 *
 * Centralises Paddle JS initialisation and exposes an imperative
 * `openPaddleTransactionOverlay` helper that the dashboard and subscribe
 * pages call instead of doing a full-page navigation to the hosted checkout
 * URL.  This prevents the "returned to homepage" regression (BILL-001) that
 * occurs when Paddle's hosted page closes without a configured return URL.
 */

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

/**
 * Lazily initialises the Paddle.js client singleton.
 * Safe to call multiple times – only the first call creates the promise.
 */
export function getPaddle(): Promise<Paddle | undefined> {
    if (!paddlePromise) {
        const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        const env =
            process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox"
                ? "sandbox"
                : "production";

        if (!token) {
            return Promise.reject(new Error("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is missing"));
        }

        paddlePromise = initializePaddle({
            environment: env,
            token,
            checkout: {
                settings: {
                    // After a successful payment the overlay redirects here.
                    successUrl: `${window.location.origin}/billing/complete`,
                },
            },
        });
    }

    return paddlePromise;
}

/**
 * Extracts the Paddle transaction ID from a Paddle checkout URL and opens
 * the checkout as an **overlay** instead of navigating away.
 *
 * Paddle hosted checkout URLs always contain `_ptxn=txn_…` as a query
 * parameter.  We reuse that transaction ID with `paddle.Checkout.open` so
 * the user stays on the current page while the overlay handles payment.
 *
 * @param checkoutUrl - The `checkout_url` value returned by the backend
 *   `/billing/checkout` or `/billing/checkout-credits` endpoints.
 * @throws if the URL does not contain a recognisable `_ptxn` parameter or
 *   if Paddle initialisation fails.
 */
export async function openPaddleTransactionOverlay(checkoutUrl: string): Promise<void> {
    const transactionId = extractPaddleTxn(checkoutUrl);
    if (!transactionId) {
        throw new Error(
            "Paddle checkout URL does not contain a transaction ID (_ptxn). " +
            `URL received: ${checkoutUrl}`
        );
    }

    const paddle = await getPaddle();
    if (!paddle) {
        throw new Error("Paddle failed to initialise.");
    }

    paddle.Checkout.open({ transactionId });
}

/**
 * Parses a `_ptxn` query parameter from a Paddle checkout URL.
 *
 * Returns `null` when no parameter is found so callers can decide how to
 * handle the degraded case.
 *
 * Exported for unit testing.
 */
export function extractPaddleTxn(checkoutUrl: string): string | null {
    try {
        const url = new URL(checkoutUrl);
        return url.searchParams.get("_ptxn");
    } catch {
        // Not a valid URL – fall through to null.
        return null;
    }
}
