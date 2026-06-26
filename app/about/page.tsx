"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, Layers3, PenTool, FileText, Rocket, Flame, Loader2 } from "lucide-react";
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
            fetchJson<any[]>("/site-content/tools")
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

    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[color:var(--background)] text-[color:var(--foreground)]">
                <p>Content is currently being configured by the administrator.</p>
            </div>
        );
    }

    const totalToolsCount = toolsList.length;
    const uniqueCategories = new Set(toolsList.map(t => (t.Category || t.category || "General").toLowerCase()));
    const workspaceCount = uniqueCategories.size;

    const stats = [
        { value: `${totalToolsCount-1}+`, label: "PDF Tools Available" },
        { value: String(workspaceCount), label: "Workspace Modules" },
        { value: "Free", label: "Plan Available" },
        { value: "Pro", label: "Advanced Workspaces" }
    ];

    const parse = (json: string) => {
        try { return JSON.parse(json); } catch { return []; }
    };

    const highlights = parse(data.HighlightsJson);
    const studioFeatures = parse(data.StudioFeaturesJson);
    const canvasFeatures = parse(data.CanvasFeaturesJson);
    const roadmapItems = parse(data.RoadmapJson);

    return (
        <div className="min-h-screen py-16 px-4 sm:px-6 lg:px-8 bg-[color:var(--background)] text-[color:var(--foreground)]">
            <div className="max-w-6xl mx-auto">
                <header className="text-center mb-20">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                        <Flame size={12} /> {data.HeroTag}
                    </div>
                    <h1 className="mt-8 text-4xl sm:text-6xl font-black tracking-tight">
                        {data.HeroTitle.split(" ").slice(0, -2).join(" ")}
                        <span className="block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                            {data.HeroTitle.split(" ").slice(-2).join(" ")}
                        </span>
                    </h1>
                    <p className="mt-8 max-w-3xl mx-auto text-base md:text-lg text-[color:var(--muted)] leading-relaxed">
                        {data.HeroDescription}
                    </p>
                </header>

                <section className="mb-24">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {stats.map((stat, i) => (
                            <div key={i} className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-6 text-center shadow-sm">
                                <div className="text-3xl font-black">{stat.value}</div>
                                <div className="mt-2 text-sm text-[color:var(--muted)]">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-24">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-black">{data.SectionTitle}</h2>
                        <p className="mt-4 text-[color:var(--muted)]">{data.SectionSubtitle}</p>
                    </div>
                    <div className="grid gap-6 md:grid-cols-3">
                        {highlights.map((item: any, i: number) => (
                            <div key={i} className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                                <p className="text-sm text-[color:var(--muted)]">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-24 grid gap-8 lg:grid-cols-2">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                        <h3 className="text-2xl font-bold mb-4">{data.StudioTitle}</h3>
                        <p className="text-[color:var(--muted)] mb-6">{data.StudioDescription}</p>
                        <ul className="space-y-2 text-sm text-[color:var(--muted)]">
                            {studioFeatures.map((f: string, i: number) => <li key={i}>✓ {f}</li>)}
                        </ul>
                    </div>
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-8">
                        <h3 className="text-2xl font-bold mb-4">{data.CanvasTitle}</h3>
                        <p className="text-[color:var(--muted)] mb-6">{data.CanvasDescription}</p>
                        <ul className="space-y-2 text-sm text-[color:var(--muted)]">
                            {canvasFeatures.map((f: string, i: number) => <li key={i}>✓ {f}</li>)}
                        </ul>
                    </div>
                </section>

                <section className="mb-24 rounded-3xl border border-[color:var(--border)] bg-emerald-500/[0.02] p-10">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <ShieldCheck className="text-emerald-500" /> {data.SecurityTitle}
                    </h2>
                    <p className="text-[color:var(--muted)]">{data.SecurityDescription}</p>
                </section>

                <section className="grid md:grid-cols-2 gap-8 mb-16">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-10">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                            <Rocket className="text-indigo-400" /> {data.RoadmapTitle}
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                            {roadmapItems.map((item: string, i: number) => (
                                <div key={i} className="text-sm font-bold text-[color:var(--muted)]">🚀 {item}</div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/30 p-10">
                        <h2 className="text-2xl font-bold mb-6">{data.MissionTitle}</h2>
                        <p className="text-[color:var(--muted)]">{data.MissionDescription}</p>
                    </div>
                </section>
            </div>
        </div>
    );
}