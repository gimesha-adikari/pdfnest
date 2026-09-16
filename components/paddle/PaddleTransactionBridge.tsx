"use client";

import { useEffect, useRef } from "react";
import { getPaddle } from "@/lib/paddle";

/**
 * PaddleTransactionBridge — mounts once inside the site layout.
 *
 * On each page load it checks for a `?_ptxn=…` query parameter and opens
 * the Paddle checkout overlay for that transaction ID.  The parameter is
 * removed from the URL before the overlay is shown so a page refresh does
 * not re-open the checkout.
 *
 * The companion `openPaddleTransactionOverlay` helper in `lib/paddle.ts`
 * allows imperative code (e.g. the dashboard credit-pack buttons) to trigger
 * the same overlay without a full-page navigation.
 */
export default function PaddleTransactionBridge() {
    const openedTxnRef = useRef<string | null>(null);

    useEffect(() => {
        const run = async () => {
            const params = new URLSearchParams(window.location.search);
            const transactionId = params.get("_ptxn");

            if (!transactionId) return;
            if (openedTxnRef.current === transactionId) return;

            openedTxnRef.current = transactionId;

            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("_ptxn");
            window.history.replaceState({}, "", cleanUrl.toString());

            const paddle = await getPaddle();
            if (!paddle) return;

            paddle.Checkout.open({ transactionId });
        };

        void run();
    }, []);

    return null;
}