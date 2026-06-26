"use client";

import {useEffect, Suspense, useState} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { fetchJson } from "@/lib/api";

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

    useEffect(() => {
        const token = searchParams.get("token");

        if (!token) {
            router.replace("/login?verified=0");
            return;
        }
        const verify = async () => {
            try {
                await fetchJson(`/auth/verify-email?token=${encodeURIComponent(token)}`);

                setStatus("success");

                setTimeout(() => {
                    router.replace("/login?verified=1");
                }, 2000);

            } catch {
                setStatus("error");

                setTimeout(() => {
                    router.replace("/login?verified=0");
                }, 2500);
            }
        };

        verify();
    }, [router, searchParams]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
            <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-10 shadow-xl text-center">

                {status === "loading" && (
                    <>
                        <Loader2
                            size={48}
                            className="mx-auto mb-6 animate-spin text-indigo-500"
                        />

                        <h1 className="text-2xl font-black mb-3">
                            Verifying your email...
                        </h1>

                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            Please wait while we verify your email address.
                        </p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <CheckCircle2
                            size={54}
                            className="mx-auto mb-6 text-emerald-500"
                        />

                        <h1 className="text-2xl font-black mb-3">
                            Email Verified!
                        </h1>

                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            Your account has been activated.
                            <br />
                            Redirecting to login...
                        </p>
                    </>
                )}

                {status === "error" && (
                    <>
                        <XCircle
                            size={54}
                            className="mx-auto mb-6 text-red-500"
                        />

                        <h1 className="text-2xl font-black mb-3">
                            Verification Failed
                        </h1>

                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            This verification link is invalid or has expired.
                            <br />
                            Redirecting to login...
                        </p>
                    </>
                )}

            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-500" size={36} />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}