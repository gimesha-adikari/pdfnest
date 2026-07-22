// file: app/(site)/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowUpRight,
    CheckCircle2,
    Search,
    Shield,
    Sparkles,
    Zap,
} from "lucide-react";

import ToolCard from "@/components/ToolCard";
import { NAV_TOOLS } from "@/lib/toolsData";
import { useAuth } from "@/context/AuthContext";
import { fetchJson } from "@/lib/api";
import { fallbackHomeContent, HomeContent } from "@/lib/contentHome";

type ToolItem = {
    Title?: string;
    title?: string;
    Description?: string;
    description?: string;
    Category?: string;
    category?: string;
    Href?: string;
    href?: string;
};

export default function Home() {
    const { isAuthenticated, subscription, isLoading } = useAuth();
    const [search, setSearch] = useState("");
    const [content, setContent] = useState<HomeContent>(fallbackHomeContent);
    const [toolsList, setToolsList] = useState<ToolItem[]>([]);

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
                    setToolsList(NAV_TOOLS as unknown as ToolItem[]);
                }
            })
            .catch((err) => {
                console.error("Error loading tools data, falling back to front end data:", err);
                setToolsList(NAV_TOOLS as unknown as ToolItem[]);
            });
    }, []);

    const query = search.trim().toLowerCase();

    const filteredTools = useMemo(() => {
        if (!query) return toolsList;

        return toolsList.filter((tool) => {
            const title = (tool.Title || tool.title || "").toLowerCase();
            const description = (tool.Description || tool.description || "").toLowerCase();
            return title.includes(query) || description.includes(query);
        });
    }, [query, toolsList]);

    const organizeTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "organize");
    const editTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "edit");
    const convertTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "convert");
    const createTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "create");
    const securityTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "security");
    const optimizeTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "optimize");
    const studioTools = filteredTools.filter((tool) => (tool.Category || tool.category) === "studio");

    const toolGroups = [
        {
            title: content.categoryOrganizeTitle || "Organize",
            desc: content.categoryOrganizeDesc || "Split, merge, rotate, crop, and rearrange pages.",
            tools: organizeTools,
        },
        {
            title: content.categoryEditingTitle || "Edit",
            desc: content.categoryEditingDesc || "Edit content, annotate, sign, and add text.",
            tools: editTools,
        },
        {
            title: content.categoryConvertTitle || "Convert",
            desc: content.categoryConvertDesc || "Convert PDFs to other formats.",
            tools: convertTools,
        },
        {
            title: content.categoryCreateTitle || "Create",
            desc: content.categoryCreateDesc || "Create PDFs from images, office files, web pages, code, and markdown.",
            tools: createTools,
        },
        {
            title: content.categorySecurityTitle || "Security",
            desc: content.categorySecurityDesc || "Protect, unlock, and redact files.",
            tools: securityTools,
        },
        {
            title: content.categoryOptimizeTitle || "Optimize",
            desc: content.categoryOptimizeDesc || "Compress, grayscale, and repair PDFs.",
            tools: optimizeTools,
        },
        {
            title: content.categoryStudioTitle || "Studio",
            desc: content.categoryStudioDesc || "Advanced all-in-one PDF workspace.",
            tools: studioTools,
        },
    ];

    const visibleGroups = toolGroups.filter((group) => group.tools.length > 0);

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] pb-24">
                <div className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:72px_72px]" />
                    <div className="absolute -top-40 left-0 h-[720px] w-[720px] rounded-full bg-indigo-500/10 blur-[160px] animate-float-slow" />
                    <div className="absolute top-0 right-0 h-[640px] w-[640px] rounded-full bg-violet-500/10 blur-[160px] animate-float-slow" />
                    <div className="absolute bottom-0 left-1/3 h-[720px] w-[720px] rounded-full bg-pink-500/6 blur-[170px] animate-float-slow" />
                </div>

                <section className="mx-auto max-w-7xl px-6 py-4">
                    <div className="mx-auto mt-14 flex max-w-5xl flex-col items-center text-center">
                        {!isLoading && (
                            <>
                                {isPro && (
                                    <span className="platen-chip">
                    <Zap size={12} className="animate-pulse" />
                                        {content.heroBadgePro || "Premium workspace enabled"}
                  </span>
                                )}

                                {isFreeUser && (
                                    <span className="platen-chip">
                    <Zap size={12} />
                                        {content.heroBadgeFree || "Free tier active"}
                  </span>
                                )}

                                {isGuest && (
                                    <span className="platen-chip">
                    <Sparkles size={12} className="animate-pulse" />
                                        {content.heroBadgeGuest || "Modern document platform"}
                  </span>
                                )}
                            </>
                        )}

                        <div className="mt-8 max-w-4xl">
                            <h1 className="text-balance text-4xl font-black tracking-tight sm:text-6xl lg:text-8xl">
                                {!isLoading && (isPro || isFreeUser) ? content.heroWelcomeBack : "Platen"}
                                <span className="block text-gradient-platen">
                  {!isLoading && (isPro || isFreeUser)
                      ? (isPro ? content.heroTitlePro : content.heroTitleGuest)
                      : "Modern Document Platform"}
                </span>
                            </h1>

                            {!isLoading && (
                                <div className="mx-auto mt-8 max-w-2xl">
                                    {isPro && (
                                        <div className="platen-panel-soft flex w-full flex-col items-center justify-between gap-4 p-4 sm:flex-row">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="text-emerald-500" size={18} />
                                                <span className="text-sm font-medium text-[color:var(--muted-foreground)]">
                          Access:{" "}
                                                    <span className="font-bold uppercase text-[color:var(--foreground)]">
                            All Premium Workspaces & Advanced Tools
                          </span>
                        </span>
                                            </div>
                                        </div>
                                    )}

                                    {isFreeUser && (
                                        <div className="platen-panel-soft flex w-full flex-col items-center justify-between gap-4 p-4 sm:flex-row">
                                            <div className="flex items-center gap-2">
                                                <Zap className="text-indigo-400" size={18} />
                                                <span className="text-sm font-medium text-[color:var(--muted-foreground)]">
                          Daily Usage:{" "}
                                                    <span className="font-bold text-[color:var(--foreground)]">
                            5 operations remaining today
                          </span>
                        </span>
                                            </div>

                                            <div className="hidden h-4 w-px bg-[color:var(--border)] sm:block" />

                                            <Link
                                                href="/pricing"
                                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 transition hover:text-indigo-300 hover:underline"
                                            >
                                                {content.authBannerFreeAction || "Upgrade"} <ArrowUpRight size={12} />
                                            </Link>
                                        </div>
                                    )}

                                    {isGuest && (
                                        <p className="text-pretty text-base leading-relaxed text-[color:var(--muted)] sm:text-lg">
                                            {content.heroSubtitleGuest || "Edit, convert, secure, and organize documents online."}
                                            <span className="mt-2 block font-bold text-indigo-300">
                        {content.heroSubtitleGuestBold || "Start free. Upgrade anytime."}
                      </span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {(isLoading || isGuest) && (
                        <div className="mt-20 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                            <div className="platen-panel p-6 text-center transition-all glass-hover">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                                    <Sparkles className="h-6 w-6" />
                                </div>
                                <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                    {content.feature1Title || "Free Tier Included"}
                                </h3>
                                <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                                    {content.feature1Description || "Access baseline document utilities instantly with no upfront cost."}
                                </p>
                            </div>

                            <div className="platen-panel p-6 text-center transition-all glass-hover">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                                    <Zap className="h-6 w-6" />
                                </div>
                                <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                    {content.feature2Title || "Pro Ecosystem"}
                                </h3>
                                <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                                    {content.feature2Description || "Unlock high-performance processing, interactive canvas features, and larger workflows."}
                                </p>
                            </div>

                            <div className="platen-panel p-6 text-center transition-all glass-hover sm:col-span-2 md:col-span-1">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
                                    <Shield className="h-6 w-6" />
                                </div>
                                <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                    {content.feature3Title || "Isolated Sandbox"}
                                </h3>
                                <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                                    {content.feature3Description || "Secure processing sandboxes compile your document jobs and clear data after completion."}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="mx-auto mt-16 max-w-2xl">
                        <div className="platen-panel-soft p-3 focus-within:border-indigo-500/50 transition-all">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--muted)]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={content.searchPlaceholder || "Search tools..."}
                                    className="platen-input w-full px-4 py-3.5 pl-12 pr-4 text-sm outline-none"
                                />
                            </div>

                            <div className="mt-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                {filteredTools.length} {content.searchScopeSuffix || "tools matching your search"}
                            </div>
                        </div>
                    </div>

                    {search === "" && (
                        <section className="mx-auto mt-16 max-w-5xl">
                            <div className="border-gradient-platen rounded-[28px] bg-gradient-to-br from-[var(--card)] to-indigo-500/5 p-8 shadow-xl transition hover:border-indigo-500/40">
                                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                                    <div className="max-w-xl space-y-2">
                    <span className="inline-flex items-center rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                      Most Popular
                    </span>
                                        <h2 className="platen-section-title mt-2 text-2xl font-extrabold text-[color:var(--foreground)]">
                                            {content.popularToolTitle || "Start with the essentials"}
                                        </h2>
                                        <p className="text-sm leading-relaxed text-[color:var(--muted)] font-medium">
                                            {content.popularToolDescription ||
                                                "Merge, split, convert, secure, and optimize documents with a clean workflow."}
                                        </p>
                                    </div>

                                    <Link
                                        href="/merge-pdf"
                                        className="btn-primary-platen inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold whitespace-nowrap"
                                    >
                                        {content.popularToolAction || "Try Merge PDF"} <ArrowUpRight size={16} />
                                    </Link>
                                </div>
                            </div>
                        </section>
                    )}

                    {filteredTools.length === 0 && (
                        <div className="mx-auto mt-20 max-w-md rounded-[28px] border border-dashed border-[color:var(--border)] bg-[var(--card)] p-12 text-center">
                            <h3 className="text-lg font-bold text-[color:var(--foreground)]">
                                {content.searchEmptyTitle || "No tools found"}
                            </h3>
                            <p className="mt-2 text-xs text-[color:var(--muted)] font-medium">
                                {content.searchEmptyDescription || "Try a different search term."}
                            </p>
                        </div>
                    )}

                    {visibleGroups.map((group) => (
                        <section key={group.title} className="mt-20 border-t border-[color:var(--border)] pt-16">
                            <div className="mb-8">
                                <h2 className="platen-section-title text-2xl font-black tracking-tight text-[color:var(--foreground)]">
                                    {group.title}
                                </h2>
                                <p className="mt-1 text-sm font-medium text-[color:var(--muted)]">{group.desc}</p>
                            </div>

                            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                                {group.tools.map((tool, idx) => (
                                    <ToolCard
                                        key={tool.Href || tool.href || idx}
                                        title={tool.Title || tool.title || ""}
                                        description={tool.Description || tool.description || ""}
                                        href={tool.Href || tool.href || ""}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </section>
            </main>
        </div>
    );
}