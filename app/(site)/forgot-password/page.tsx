"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { fetchJson } from "@/lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setIsSubmitting(true);
        try {
            const response = await fetchJson<{ message?: string }>("/auth/request-password-reset", {
                method: "POST",
                body: JSON.stringify({ email }),
            });
            setSuccess(response.message || "If an account exists for that email, a password reset link will be sent shortly.");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "We could not process that request. Please try again.");
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
                        <Mail className="text-indigo-500" size={22} />
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">Forgot your password?</h1>
                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                        Enter your account email and we&apos;ll send a secure reset link if it matches an account.
                    </p>
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
                    <label className="block text-sm font-semibold text-[color:var(--foreground)]" htmlFor="forgot-email">
                        Email address
                    </label>
                    <input
                        id="forgot-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-70"
                    >
                        {isSubmitting ? <Loader2 size={17} className="animate-spin" /> : "Send reset link"}
                    </button>
                </form>
            </div>
        </div>
    );
}
