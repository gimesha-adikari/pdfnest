"use client";

import React from "react";
import { ShieldCheck, Zap, Sparkles, Server, Flame } from "lucide-react";

export default function AboutPage() {
    const values = [
        {
            icon: <ShieldCheck size={24} className="text-emerald-500" />,
            title: "Secure Server Processing",
            description: "Your files are securely transmitted to our backend API, processed under strict isolated environments, and immediately wiped post-download to maintain privacy."
        },
        {
            icon: <Zap size={24} className="text-amber-500" />,
            title: "Robust Performance",
            description: "By leveraging powerful backend engines, we handle large complex operations, heavy multi-page processing, and document formatting with absolute speed and zero lag."
        },
        {
            icon: <Sparkles size={24} className="text-indigo-500" />,
            title: "No Bloat, Pure Simplicity",
            description: "We hate messy signups, aggressive paywalls, and annoying popups. Just premium, optimized interfaces tailored to get things done cleanly."
        }
    ];

    return (
        <div className="min-h-screen py-16 px-4 max-w-5xl mx-auto sm:px-6 lg:px-8">
            {/* Hero Header Section */}
            <header className="text-center mb-16 animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 mb-4 border border-indigo-500/20">
                    <Flame size={12} /> Meet PDFNest
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-[color:var(--foreground)] sm:text-5xl mb-4">
                    Document tools built for the <span className="bg-gradient-to-r from-indigo-400 to-violet-500 bg-clip-text text-transparent">modern web</span>
                </h1>
                <p className="max-w-2xl mx-auto text-base text-[color:var(--muted)] leading-relaxed">
                    A streamlined platform created to skip the friction of traditional document modification tools. Free, backend-optimized, and accessible from any device.
                </p>
            </header>

            <hr className="border-[color:var(--border)] my-12" />

            {/* Core Values Grid */}
            <section className="mb-20">
                <h2 className="text-2xl font-bold text-[color:var(--foreground)] mb-8 text-center sm:text-left">
                    What makes us different
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {values.map((value, idx) => (
                        <div
                            key={idx}
                            className="p-6 border border-[color:var(--border)] bg-[var(--background)]/40 rounded-2xl backdrop-blur-sm hover:border-[color:var(--muted)]/50 transition-all duration-200"
                        >
                            <div className="p-3 w-fit rounded-xl bg-neutral-500/5 mb-4">
                                {value.icon}
                            </div>
                            <h3 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">
                                {value.title}
                            </h3>
                            <p className="text-sm text-[color:var(--muted)] leading-relaxed">
                                {value.description}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Project Mission Block */}
            <section className="p-8 md:p-12 border border-[color:var(--border)] bg-indigo-500/[0.02] rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

                <div className="max-w-3xl">
                    <h2 className="text-2xl font-bold text-[color:var(--foreground)] mb-4 flex items-center gap-2">
                        <Server size={22} className="text-indigo-500" /> Our Mission
                    </h2>
                    <p className="text-sm md:text-base text-[color:var(--muted)] leading-relaxed mb-6">
                        PDFNest was conceptualized because standard workspace utilities became weighed down by paywalls, unnecessary storage layers, and heavy client-side resource exhaustion. We believe dealing with basic daily formats like PDF extraction, rotation, and numbering should be fast, highly optimized, and robust.
                    </p>
                    <p className="text-sm md:text-base text-[color:var(--muted)] leading-relaxed">
                        By routing operations through a dedicated backend API service layer, we ensure that files are handled with enterprise-grade stability and speed without draining device batteries or computing capacities—keeping this platform seamless for everyone.
                    </p>
                </div>
            </section>
        </div>
    );
}