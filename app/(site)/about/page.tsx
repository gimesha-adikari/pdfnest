"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
    ShieldCheck,
    Rocket,
    Flame,
    Loader2,
    Mail,
    ArrowRight,
} from "lucide-react";
import { fetchJson } from "@/lib/api";

interface AboutData {
    HeroTag: string;
    HeroTitle: string;
    HeroDescription: string;
    StatsJson: string;
    SectionTitle: string;
    SectionSubtitle: string;
    HighlightsJson: string;
    StudioTitle: string;
    StudioDescription: string;
    StudioFeaturesJson: string;
    CanvasTitle: string;
    CanvasDescription: string;
    CanvasFeaturesJson: string;
    SecurityTitle: string;
    SecurityDescription: string;
    RoadmapTitle: string;
    RoadmapDescription: string;
    RoadmapJson: string;
    MissionTitle: string;
    MissionDescription: string;
}

export default function AboutPage() {
    const [data, setData] = useState<AboutData | null>(null);
    const [toolsList, setToolsList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetchJson<AboutData>("/site-content/about"),
            fetchJson<any[]>("/site-content/tools"),
        ])
            .then(([aboutRes, toolsRes]) => {
                setData(aboutRes);
                setToolsList(toolsRes || []);
            })
            .catch((err) => {
                console.error("Backend fetch error:", err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)]">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    const fallbackData: AboutData = {
        HeroTag: "Next-Gen PDF Infrastructure",
        HeroTitle: "Built for Secure & Fast Document Processing",
        HeroDescription: "Platen PDF is an online document engine designed for fast, private, and powerful PDF management directly in your browser or isolated sandbox environments.",
        StatsJson: JSON.stringify([]),
        SectionTitle: "Core Platform Philosophy",
        SectionSubtitle: "Designed with privacy, performance, and simplicity as first principles.",
        HighlightsJson: JSON.stringify([
            { title: "Browser & Isolated Processing", description: "Files are processed inside secure execution containers or locally in your browser." },
            { title: "Automated Data Lifecycle", description: "Uploaded documents and generated files are automatically deleted after processing." },
            { title: "Modular Toolsuite", description: "Comprehensive utilities to merge, split, compress, edit, redact, and convert documents." }
        ]),
        StudioTitle: "PDF Studio Workspace",
        StudioDescription: "A unified interactive editor enabling visual layout reordering, content annotation, and multi-tool chain operations.",
        StudioFeaturesJson: JSON.stringify([
            "Visual drag-and-drop page sorting grid",
            "Multi-tool operation chaining",
            "Real-time page preview & rotation"
        ]),
        CanvasTitle: "Interactive Document Canvas",
        CanvasDescription: "Work with vector overlays, watermark positioning, page number pagination, and document metadata editing.",
        CanvasFeaturesJson: JSON.stringify([
            "Custom text & logo watermarking",
            "Precision pagination positioning",
            "Metadata property editing"
        ]),
        SecurityTitle: "Security & Privacy Guarantee",
        SecurityDescription: "We strictly protect user data. All processing sandboxes clear cache automatically, and no uploaded document content is permanently stored.",
        RoadmapTitle: "Platform Capabilities",
        RoadmapDescription: "Continuously expanding PDF engine utilities.",
        RoadmapJson: JSON.stringify(["Fast OCR Engine", "Batch Conversion", "High-DPI Render", "Cloudflare R2 Sync"]),
        MissionTitle: "Our Mission",
        MissionDescription: "Provide high-performance document tools accessible anywhere without compromising user privacy or file security."
    };

    const activeData = data || fallbackData;

    const totalToolsCount = toolsList.length;
    const uniqueCategories = new Set(
        toolsList.map((t) => (t.Category || t.category || "General").toLowerCase())
    );
    const workspaceCount = uniqueCategories.size;

    const stats = [
        { value: `${Math.max(totalToolsCount - 1, 0)}+`, label: "PDF Tools Available" },
        { value: String(workspaceCount), label: "Workspace Modules" },
        { value: "Free", label: "Plan Available" },
        { value: "Pro", label: "Advanced Workspaces" },
    ];

    const parse = (json: string) => {
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const highlights = parse(activeData.HighlightsJson);
    const studioFeatures = parse(activeData.StudioFeaturesJson);
    const canvasFeatures = parse(activeData.CanvasFeaturesJson);
    const roadmapItems = parse(activeData.RoadmapJson);

    const heroParts = activeData.HeroTitle.trim().split(/\s+/);
    const heroLead =
        heroParts.length > 2 ? heroParts.slice(0, -2).join(" ") : heroParts[0] || "";
    const heroAccent =
        heroParts.length > 2 ? heroParts.slice(-2).join(" ") : heroParts.slice(1).join(" ");

    return (
        <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <header className="text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                        <Flame size={12} />
                        {activeData.HeroTag}
                    </div>

                    <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-6xl">
                        <span className="block">{heroLead}</span>
                        {heroAccent ? (
                            <span className="block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                                {heroAccent}
                            </span>
                        ) : null}
                    </h1>

                    <p className="mx-auto mt-8 max-w-3xl text-base leading-relaxed text-[color:var(--muted)] md:text-lg">
                        {activeData.HeroDescription}
                    </p>

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href="/contact"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                        >
                            <Mail size={16} />
                            Contact Platen PDF
                        </Link>

                        <Link
                            href="/privacy"
                            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--card)]/40 px-5 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:border-indigo-500 hover:text-indigo-500"
                        >
                            Learn more
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </header>

                <section className="mt-16">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        {stats.map((stat, i) => (
                            <div
                                key={i}
                                className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-6 text-center shadow-sm"
                            >
                                <div className="text-3xl font-black">{stat.value}</div>
                                <div className="mt-2 text-sm text-[color:var(--muted)]">
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-24">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-black">{activeData.SectionTitle}</h2>
                        <p className="mt-4 text-[color:var(--muted)]">
                            {activeData.SectionSubtitle}
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        {highlights.map((item: any, i: number) => (
                            <div
                                key={i}
                                className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                            >
                                <h3 className="text-xl font-bold mb-3">
                                    {item.title}
                                </h3>
                                <p className="text-sm leading-7 text-[color:var(--muted)]">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mt-24 grid gap-8 lg:grid-cols-2">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                        <h3 className="text-2xl font-bold mb-4">
                            {activeData.StudioTitle}
                        </h3>
                        <p className="text-[color:var(--muted)] mb-6 leading-relaxed">
                            {activeData.StudioDescription}
                        </p>
                        <ul className="space-y-3 text-sm text-[color:var(--muted)]">
                            {studioFeatures.map((f: string, i: number) => (
                                <li key={i} className="leading-6">
                                    ✓ {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                        <h3 className="text-2xl font-bold mb-4">
                            {activeData.CanvasTitle}
                        </h3>
                        <p className="text-[color:var(--muted)] mb-6 leading-relaxed">
                            {activeData.CanvasDescription}
                        </p>
                        <ul className="space-y-3 text-sm text-[color:var(--muted)]">
                            {canvasFeatures.map((f: string, i: number) => (
                                <li key={i} className="leading-6">
                                    ✓ {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="mt-24 rounded-3xl border border-[color:var(--border)] bg-emerald-500/[0.02] p-10">
                    <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                        <ShieldCheck className="text-emerald-500" />
                        {activeData.SecurityTitle}
                    </h2>
                    <p className="max-w-3xl text-[color:var(--muted)] leading-relaxed">
                        {activeData.SecurityDescription}
                    </p>
                </section>

                <section className="mt-24 grid gap-8 md:grid-cols-2">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-10">
                        <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold">
                            <Rocket className="text-indigo-400" />
                            {activeData.RoadmapTitle}
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                            {roadmapItems.map((item: string, i: number) => (
                                <div
                                    key={i}
                                    className="rounded-2xl border border-[color:var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[color:var(--muted)]"
                                >
                                    🚀 {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-10">
                        <h2 className="mb-6 text-2xl font-bold">
                            {activeData.MissionTitle}
                        </h2>
                        <p className="text-[color:var(--muted)] leading-relaxed">
                            {activeData.MissionDescription}
                        </p>

                        <div className="mt-8 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
                            <p className="text-sm leading-7 text-[color:var(--muted)]">
                                Want to talk to us directly? The contact page is the best place for support,
                                questions, or feedback.
                            </p>
                            <Link
                                href="/contact"
                                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-500 hover:underline"
                            >
                                Contact Platen PDF
                                <ArrowRight size={14} />
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="mt-24 rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-10">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="max-w-2xl">
                            <h2 className="text-2xl font-black mb-3">
                                Need help or have a question?
                            </h2>
                            <p className="text-[color:var(--muted)] leading-relaxed">
                                Reach out to the Platen team if you need support, want to report an issue,
                                or have a question about the platform.
                            </p>
                        </div>

                        <Link
                            href="/contact"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
                        >
                            <Mail size={16} />
                            Contact Platen PDF
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}