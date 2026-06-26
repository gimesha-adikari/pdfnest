"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import { ArrowLeft, Mail, Lock, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/api";

function LoginContent() {
    const { isAuthenticated, isLoading: isAuthLoading, refreshSession } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const callbackUrl = searchParams.get("callbackUrl") || "/";
    const verified = searchParams.get("verified");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isResending, setIsResending] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (verified === "1") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSuccess("✅ Email verified successfully. You can now sign in.");
        }

        if (verified === "0") {
            setError("Verification link is invalid or has expired.");
        }
    }, [verified]);
    useEffect(() => {
        if (!isAuthLoading && isAuthenticated) {
            router.push(callbackUrl);
        }
    }, [isAuthenticated, isAuthLoading, router, callbackUrl]);

    const handleManualLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            await fetchJson("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });

            await refreshSession();
        } catch (err: any) {
            const msg = err.message || "";

            if (msg.toLowerCase().includes("verify")) {
                setError(
                    "Please verify your email before signing in."
                );
            } else {
                setError(msg || "Failed to log in.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResend = async () => {
        if (!email) {
            setError("Enter your email first.");
            return;
        }

        setIsResending(true);

        try {
            await fetchJson("/auth/resend-verification", {
                method: "POST",
                body: JSON.stringify({
                    email,
                }),
            });

            setSuccess(
                "Verification email has been sent again."
            );
            setError("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsResending(false);
        }
    };

    if (isAuthLoading || isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 relative">
            <Link
                href="/"
                className="absolute top-8 left-8 flex items-center gap-2 text-sm font-medium text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors"
            >
                <ArrowLeft size={16} />
                Back to Home
            </Link>

            <div className="w-full max-w-md bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl flex flex-col">

                <div className="mb-6 flex flex-col items-center text-center">
                    <div className="relative h-14 w-14 mb-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center">
                        <span className="text-xl font-black text-indigo-500">PN</span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">
                        Welcome back
                    </h1>
                    <p className="text-sm text-[color:var(--muted-foreground)] mt-1">
                        Sign in to lift your daily PDF limits.
                    </p>
                </div>

                {success && (
                    <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center text-sm text-emerald-600">
                        {success}
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleManualLogin} className="space-y-4 mb-6">
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted-foreground)]" size={18} />
                        <input
                            type="email"
                            placeholder="Email address"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted-foreground)]" size={18} />
                        <input
                            type="password"
                            placeholder="Password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold transition-colors flex justify-center items-center gap-2 disabled:opacity-70"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Sign In"}
                    </button>

                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isResending}
                            className="text-sm font-medium text-indigo-500 hover:underline"
                        >
                            {isResending
                                ? "Sending..."
                                : "Resend verification email"}
                        </button>
                    </div>
                </form>

                <div className="relative flex items-center justify-center mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[color:var(--border)]"></div>
                    </div>
                    <span className="relative bg-[var(--card)] px-4 text-xs font-semibold text-[color:var(--muted-foreground)] uppercase tracking-wider">
                        Or continue with
                    </span>
                </div>

                <div className="w-full">
                    <GoogleLoginButton />
                </div>

                <div className="mt-6 text-sm text-[color:var(--muted-foreground)] text-center">
                    Don&#39;t have an account?{" "}
                    <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-semibold text-indigo-500 hover:underline">
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[var(--background)]"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>}>
            <LoginContent />
        </Suspense>
    );
}