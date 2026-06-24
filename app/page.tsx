"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, Sparkles, Shield, Zap, ArrowUpRight, CheckCircle2 } from "lucide-react";
import ToolCard from "@/components/ToolCard";
import { NAV_TOOLS } from "@/lib/toolsData";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import { fallbackHomeContent, HomeContent } from "@/lib/contentHome";

export default function Home() {
    const { isAuthenticated, subscription, isLoading } = useAuth();
    const [search, setSearch] = useState("");
    const [content, setContent] = useState<HomeContent>(fallbackHomeContent);
    const [toolsList, setToolsList] = useState<any[]>([]);

    const isPro = isAuthenticated && subscription?.tier === "pro";
    const isFreeUser = isAuthenticated && (!subscription || subscription.tier !== "pro");
    const isGuest = !isAuthenticated;

    useEffect(() => {
        fetchJson("/site-content/home")
            .then((data: any) => {
                if (data && typeof data === "object" && !("error" in data)) {
                    setContent((prev) => ({ ...prev, ...data }));
                }
            })
            .catch((err) => console.error("Error loading home settings:", err));

        fetchJson("/site-content/tools")
            .then((data: any) => {
                if (Array.isArray(data) && data.length > 0) {
                    setToolsList(data);
                } else {
                    setToolsList(NAV_TOOLS);
                }
            })
            .catch((err) => {
                console.error("Error loading tools data, falling back to front end data:", err);
                setToolsList(NAV_TOOLS);
            });
    }, []);

    const filteredTools = toolsList.filter((tool) => {
        const query = search.toLowerCase();
        const title = (tool.Title || tool.title || "").toLowerCase();
        const description = (tool.Description || tool.description || "").toLowerCase();
        return title.includes(query) || description.includes(query);
    });

    const editingTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "editing");
    const convertTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "convert");
    const securityTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "security");

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] pb-24">
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 select-none">
                <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:60px_60px]" />
                <div className="animate-glow-slow absolute -top-40 -left-40 h-[800px] w-[800px] rounded-full bg-indigo-500/15 dark:bg-indigo-500/10 blur-[150px]" />
                <div className="animate-glow-medium absolute top-10 right-0 h-[700px] w-[700px] rounded-full bg-purple-500/15 dark:bg-purple-500/10 blur-[150px]" />
                <div className="animate-glow-fast absolute bottom-10 left-1/4 h-[700px] w-[700px] rounded-full bg-pink-500/10 dark:bg-pink-500/5 blur-[150px]" />
            </div>

            <section className="mx-auto max-w-7xl px-6 py-4">
                <div className="mx-auto mt-16 max-w-4xl text-center flex flex-col items-center">
                    {!isLoading && (
                        <>
                            {isPro && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-500 px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm backdrop-blur-md">
                                    <Zap size={12} className="animate-pulse" /> {content.heroBadgePro}
                                </span>
                            )}
                            {isFreeUser && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-500 px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-sm backdrop-blur-md">
                                    <Zap size={12} /> {content.heroBadgeFree}
                                </span>
                            )}
                            {isGuest && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-500 shadow-sm backdrop-blur-md">
                                    <Sparkles size={12} className="animate-pulse" /> {content.heroBadgeGuest}
                                </span>
                            )}
                        </>
                    )}

                    <h1 className="mt-8 text-4xl sm:text-6xl lg:text-8xl font-black tracking-tight text-[color:var(--foreground)] leading-[1.05] max-w-4xl">
                        {!isLoading && (isPro || isFreeUser) ? content.heroWelcomeBack : "Professional"}
                        <span className="block mt-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_2px_40px_rgba(99,102,241,0.2)] select-none">
                            {isPro ? content.heroTitlePro : content.heroTitleGuest}
                        </span>
                    </h1>

                    {!isLoading && (
                        <div className="mt-8 max-w-2xl w-full">
                            {isPro && (
                                <div className="bg-[var(--card)]/40 border border-[color:var(--border)] rounded-2xl p-4 shadow-sm backdrop-blur-md flex flex-col sm:flex-row items-center justify-around gap-4 w-full">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="text-emerald-500" size={18} />
                                        <span className="text-sm font-medium text-[color:var(--muted-foreground)]">
                                            Access: <span className="text-[color:var(--foreground)] font-bold uppercase">All Premium Workspaces & Advanced Tools</span>
                                        </span>
                                    </div>
                                </div>
                            )}

                            {isFreeUser && (
                                <div className="bg-[var(--card)]/40 border border-[color:var(--border)] rounded-2xl p-4 shadow-sm backdrop-blur-md flex flex-col sm:flex-row items-center justify-around gap-4 w-full">
                                    <div className="flex items-center gap-2">
                                        <Zap className="text-indigo-500" size={18} />
                                        <span className="text-sm font-medium text-[color:var(--muted-foreground)]">
                                            Daily Usage: <span className="text-[color:var(--foreground)] font-bold">5 operations remaining today</span>
                                        </span>
                                    </div>
                                    <div className="h-4 w-px bg-[color:var(--border)] hidden sm:block" />
                                    <Link href="/pricing" className="text-xs font-bold text-indigo-500 hover:underline flex items-center gap-1">
                                        {content.authBannerFreeAction} <ArrowUpRight size={12} />
                                    </Link>
                                </div>
                            )}

                            {isGuest && (
                                <p className="text-md sm:text-lg leading-relaxed text-[color:var(--muted)] font-medium">
                                    {content.heroSubtitleGuest}
                                    <span className="block mt-2 text-indigo-500/90 dark:text-indigo-400/90 font-bold">{content.heroSubtitleGuestBold}</span>
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {(isLoading || isGuest) && (
                    <div className="mt-20 grid gap-6 sm:grid-cols-2 md:grid-cols-3 max-w-5xl mx-auto">
                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all group">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500">
                                <Sparkles className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">{content.feature1Title}</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">{content.feature1Description}</p>
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all group">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-500 group-hover:bg-purple-500">
                                <Zap className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">{content.feature2Title}</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">{content.feature2Description}</p>
                        </div>

                        <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all group sm:col-span-2 md:col-span-1">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500 group-hover:bg-cyan-500">
                                <Shield className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">{content.feature3Title}</h3>
                            <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">{content.feature3Description}</p>
                        </div>
                    </div>
                )}

                <div className="mx-auto mt-16 max-w-2xl">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/70 p-3 shadow-xl backdrop-blur-md focus-within:border-indigo-500/50 transition-all">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--muted)] pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={content.searchPlaceholder}
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] pl-12 pr-4 py-3.5 text-sm outline-none text-[var(--foreground)] placeholder:text-[color:var(--muted)] focus:border-indigo-500/40"
                            />
                        </div>
                        <div className="mt-3 text-center text-xs font-bold text-[color:var(--muted)] tracking-wide uppercase">
                            {filteredTools.length} {content.searchScopeSuffix}
                        </div>
                    </div>
                </div>

                {search === "" && (
                    <section className="mt-16 max-w-5xl mx-auto">
                        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-[var(--card)] to-indigo-500/5 p-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-indigo-500/40">
                            <div className="space-y-2 max-w-xl">
                                <span className="text-[10px] font-black tracking-widest bg-indigo-500 text-white px-2.5 py-1 rounded-md uppercase">MOST POPULAR</span>
                                <h2 className="text-2xl font-extrabold text-[color:var(--foreground)] mt-2">{content.popularToolTitle}</h2>
                                <p className="text-sm leading-relaxed text-[color:var(--muted)] font-medium">{content.popularToolDescription}</p>
                            </div>
                            <Link href="/merge-pdf" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3.5 text-sm font-bold text-white whitespace-nowrap shadow-md">
                                {content.popularToolAction} <ArrowUpRight size={16} />
                            </Link>
                        </div>
                    </section>
                )}

                {filteredTools.length === 0 && (
                    <div className="mt-20 rounded-3xl border border-dashed border-[color:var(--border)] bg-[var(--card)] p-12 text-center max-w-md mx-auto">
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">{content.searchEmptyTitle}</h3>
                        <p className="mt-2 text-xs text-[color:var(--muted)] font-medium">{content.searchEmptyDescription}</p>
                    </div>
                )}

                {editingTools.length > 0 && (
                    <section className="mt-20 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">{content.categoryEditingTitle}</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">{content.categoryEditingDesc}</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                            {editingTools.map((tool, idx) => (
                                <ToolCard
                                    key={tool.Href || tool.href || idx}
                                    title={tool.Title || tool.title}
                                    description={tool.Description || tool.description}
                                    href={tool.Href || tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {convertTools.length > 0 && (
                    <section className="mt-20 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">{content.categoryConvertTitle}</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">{content.categoryConvertDesc}</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                            {convertTools.map((tool, idx) => (
                                <ToolCard
                                    key={tool.Href || tool.href || idx}
                                    title={tool.Title || tool.title}
                                    description={tool.Description || tool.description}
                                    href={tool.Href || tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {securityTools.length > 0 && (
                    <section className="mt-20 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">{content.categorySecurityTitle}</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">{content.categorySecurityDesc}</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                            {securityTools.map((tool, idx) => (
                                <ToolCard
                                    key={tool.Href || tool.href || idx}
                                    title={tool.Title || tool.title}
                                    description={tool.Description || tool.description}
                                    href={tool.Href || tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </section>
        </main>
    );
}