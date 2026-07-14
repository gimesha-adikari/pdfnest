"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useEffect, useRef } from "react";

let paddlePromise: Promise<Paddle | undefined> | null = null;

function getPaddle() {
    if (!paddlePromise) {
        const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        const env =
            process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox"
                ? "sandbox"
                : "production";

        if (!token) {
            throw new Error("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is missing");
        }

        paddlePromise = initializePaddle({
            environment: env,
            token,
            checkout: {
                settings: {
                    successUrl: `${window.location.origin}/billing/complete`,
                },
            },
        });
    }

    return paddlePromise;
}

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

            paddle.Checkout.open({
                transactionId,
            });
        };

        void run();
    }, []);

    return null;
}