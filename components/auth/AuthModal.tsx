"use client";

import React, { useState } from "react";
import { X, Mail, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import GoogleLoginButton from "./GoogleLoginButton";

export default function AuthModal() {
    const { isAuthModalOpen, closeAuthModal, handleAuthModalSuccess, refreshSession } = useAuth();

    const [isLoginView, setIsLoginView] = useState(false); // Default to Sign Up
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState(""); // NEW: Track registration success
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isAuthModalOpen) return null;

    const toggleView = () => {
        setIsLoginView(!isLoginView);
        setError("");
        setSuccessMessage("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMessage("");
        setIsSubmitting(true);

        try {
            if (!isLoginView) {
                await fetchJson("/auth/register", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                });

                setSuccessMessage(
                    `We've sent a verification email to ${email}. Please verify your email before signing in.`
                );

                setPassword("");

                setTimeout(() => {
                    setIsLoginView(true);
                }, 1500);
            } else {
                await fetchJson("/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                });

                await refreshSession();
                handleAuthModalSuccess();
            }
        } catch (err: any) {
            const msg = err.message || "";

            if (msg.toLowerCase().includes("verify")) {
                setError(
                    "Please verify your email first. Check your inbox or request another verification email."
                );
            } else {
                setError(msg || `Failed to ${isLoginView ? "log in" : "sign up"}.`);
            }        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md bg-[var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">

                <button
                    onClick={closeAuthModal}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--border)] transition-colors text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                >
                    <X size={20} />
                </button>

                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-black tracking-tight text-[color:var(--foreground)]">
                        {isLoginView ? "Welcome back" : "Unlock Platen PDF"}
                    </h2>
                    <p className="text-sm text-[color:var(--muted-foreground)] mt-1">
                        {isLoginView ? "Sign in to process your file." : "Create a free account to process this file instantly."}
                    </p>
                </div>

                {/* Registration Success Message */}
                {successMessage && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium flex items-start gap-2">
                        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center font-medium">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 mb-6">
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
                            placeholder={isLoginView ? "Password" : "Create a password"}
                            minLength={6}
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
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : (isLoginView ? "Sign In" : "Sign Up")}
                    </button>
                </form>

                <div className="relative flex items-center justify-center mb-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[color:var(--border)]"></div></div>
                    <span className="relative bg-[var(--card)] px-4 text-xs font-semibold text-[color:var(--muted-foreground)] uppercase">Or</span>
                </div>

                <div className="w-full mb-6">
                    <GoogleLoginButton onSuccessCallback={handleAuthModalSuccess} />
                </div>

                <div className="text-sm text-[color:var(--muted-foreground)] text-center">
                    {isLoginView ? "Don't have an account? " : "Already have an account? "}
                    <button
                        type="button"
                        onClick={toggleView}
                        className="font-semibold text-indigo-500 hover:underline"
                    >
                        {isLoginView ? "Sign up" : "Log in"}
                    </button>
                </div>
            </div>
        </div>
    );
}