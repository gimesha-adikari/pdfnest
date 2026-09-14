"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/api";

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token")?.trim() || "";
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState(token ? "" : "This password reset link is missing its token.");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        if (!token) {
            setError("This password reset link is invalid or has expired.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetchJson<{ message?: string }>("/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({ token, password }),
            });
            setSuccess(response.message || "Password reset successfully. You can now sign in.");
            setPassword("");
            setConfirmPassword("");
            window.setTimeout(() => router.replace("/login?reset=1"), 1800);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "This password reset link is invalid or has expired.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] p-6">
            <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-2xl">
                <Link
                    href="/login"
                    className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                >
                    <ArrowLeft size={16} /> Back to Login
                </Link>

                <div className="mb-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
                        <KeyRound className="text-indigo-500" size={22} />
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">Choose a new password</h1>
                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">Use a password you have not used before.</p>
                </div>

                {success && (
                    <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                        {success}
                    </div>
                )}
                {error && (
                    <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
                        {error}
                    </div>
                )}

                <form onSubmit={submit} className="space-y-4">
                    <label className="block text-sm font-semibold text-[color:var(--foreground)]" htmlFor="reset-password">
                        New password
                    </label>
                    <input
                        id="reset-password"
                        name="new-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <label className="block text-sm font-semibold text-[color:var(--foreground)]" htmlFor="reset-password-confirm">
                        Confirm new password
                    </label>
                    <input
                        id="reset-password-confirm"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting || Boolean(success)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-70"
                    >
                        {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : "Reset password"}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                </div>
            }
        >
            <ResetPasswordContent />
        </Suspense>
    );
}
