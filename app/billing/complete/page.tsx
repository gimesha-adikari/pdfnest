"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BillingCompletePage() {
    const router = useRouter();

    useEffect(() => {
        const t = setTimeout(() => {
            router.replace("/subscribe");
        }, 1500);

        return () => clearTimeout(t);
    }, [router]);

    return (
        <main className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="text-center">
                <h1 className="text-xl font-semibold">Payment complete</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Updating your account…
                </p>
            </div>
        </main>
    );
}