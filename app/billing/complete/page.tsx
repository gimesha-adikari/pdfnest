// app/billing/complete/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function BillingCompletePage() {
    const router = useRouter();
    const { refreshSession, subscription, isLoading } = useAuth();
    const [attempts, setAttempts] = useState(0);

    // Keep asking the backend until the webhook has updated the subscription.
    useEffect(() => {
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const run = async () => {
            await refreshSession();
        };

        void run();

        intervalId = setInterval(() => {
            if (cancelled) return;
            setAttempts((prev) => prev + 1);
            void refreshSession();
        }, 1500);

        timeoutId = setTimeout(() => {
            if (cancelled) return;
            router.replace("/subscribe");
        }, 20000);

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [refreshSession, router]);

    useEffect(() => {
        if (!subscription) return;

        if (subscription.tier === "plus" || subscription.tier === "pro") {
            router.replace("/studio");
        }
    }, [subscription, router]);

    return (
        <main className="min-h-screen flex items-center justify-center px-6 bg-[var(--background)] text-[var(--foreground)]">
            <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 text-center shadow-xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </div>

                <h1 className="text-2xl font-black tracking-tight">Activating your plan</h1>
                <p className="mt-3 text-sm text-[color:var(--muted)] leading-relaxed">
                    Your payment completed. We are updating your account now.
                </p>

                <div className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-[color:var(--muted-foreground)]">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Refreshing account status automatically
                </div>

                <p className="mt-4 text-[11px] text-[color:var(--muted)]">
                    Attempts: {attempts} {isLoading ? "• loading session..." : ""}
                </p>
            </div>
        </main>
    );
}