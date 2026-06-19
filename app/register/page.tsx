"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import GoogleLoginButton from "@/components/auth/GoogleLoginButton";
import { ArrowLeft, CheckCircle2, Mail, Lock, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/api";

export default function RegisterPage() {
    const { isAuthenticated, isLoading: isAuthLoading, refreshSession } = useAuth();
    const router = useRouter();

    // Form State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isAuthLoading && isAuthenticated) {
            router.push("/");
        }
    }, [isAuthenticated, isAuthLoading, router]);

    const handleManualRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsSubmitting(true);

        try {
            // 1. Create the account
            await fetchJson("/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });

            // 2. Automatically log them in to get the auth_token cookie
            await fetchJson("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });

            // 3. Sync the frontend state
            await refreshSession();
        } catch (err: any) {
            setError(err.message || "Failed to create account. Email may already be in use.");
        } finally {
            setIsSubmitting(false);
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
        <div className="min-h-screen flex flex-col md:flex-row bg-[var(--background)]">
            {/* Left Side - Branding & Benefits */}
            <div className="hidden md:flex md:w-1/2 bg-indigo-500/5 border-r border-[color:var(--border)] flex-col justify-center p-12 lg:p-24 relative">
                <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-sm font-medium text-[color:var(--muted-foreground)] hover:text-indigo-500 transition-colors">
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <div className="max-w-md">
                    <div className="relative h-12 w-12 mb-6 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg">
                        <span className="text-xl font-black text-white">PN</span>
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-[color:var(--foreground)] mb-6">
                        Start managing your PDFs like a pro.
                    </h1>
                    <ul className="space-y-4">
                        <li className="flex items-center gap-3 text-[color:var(--muted-foreground)]">
                            <CheckCircle2 className="text-indigo-500" size={20} />
                            <span>Process up to 5 files daily for free</span>
                        </li>
                        <li className="flex items-center gap-3 text-[color:var(--muted-foreground)]">
                            <CheckCircle2 className="text-indigo-500" size={20} />
                            <span>Secure, local-first file locking</span>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Right Side - Sign Up Form */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
                <Link href="/" className="md:hidden absolute top-8 left-6 flex items-center gap-2 text-sm font-medium text-[color:var(--muted-foreground)]">
                    <ArrowLeft size={16} /> Back
                </Link>

                <div className="w-full max-w-sm flex flex-col items-stretch">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-black tracking-tight text-[color:var(--foreground)] mb-2">Create your account</h2>
                        <p className="text-sm text-[color:var(--muted-foreground)]">Join PDFNest to unlock your daily quota.</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center font-medium">
                            {error}
                        </div>
                    )}

                    {/* Manual Register Form */}
                    <form onSubmit={handleManualRegister} className="space-y-4 mb-6">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted-foreground)]" size={18} />
                            <input
                                type="email"
                                placeholder="Email address"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted-foreground)]" size={18} />
                            <input
                                type="password"
                                placeholder="Create a password"
                                minLength={6}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-[var(--card)] border border-[color:var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold flex justify-center items-center gap-2 disabled:opacity-70 transition-colors"
                        >
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Sign Up"}
                        </button>
                    </form>

                    <div className="relative flex items-center justify-center mb-6">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[color:var(--border)]"></div></div>
                        <span className="relative bg-[var(--background)] px-4 text-xs font-semibold text-[color:var(--muted-foreground)] uppercase">Or</span>
                    </div>

                    <div className="w-full mb-8">
                        <GoogleLoginButton />
                    </div>

                    <div className="text-sm text-[color:var(--muted-foreground)] text-center">
                        Already have an account? <Link href="/login" className="font-semibold text-indigo-500 hover:underline">Log in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}