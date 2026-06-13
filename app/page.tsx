"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Sparkles, Shield, Zap, ArrowUpRight } from "lucide-react";
import ToolCard from "@/components/ToolCard";
import { NAV_TOOLS } from "@/lib/toolsData";

export default function Home() {
    const [search, setSearch] = useState("");

    const filteredTools = NAV_TOOLS.filter((tool) => {
        const query = search.toLowerCase();
        return (
            tool.title.toLowerCase().includes(query) ||
            tool.description.toLowerCase().includes(query)
        );
    });

    const editingTools = filteredTools.filter(
        (tool) => tool.category === "editing"
    );

    const convertTools = filteredTools.filter(
        (tool) => tool.category === "convert"
    );

    const securityTools = filteredTools.filter(
        (tool) => tool.category === "security"
    );

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] pb-24">
            {/* Ambient Background Glow Configurations */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 select-none">
                <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:60px_60px]" />
                <div className="animate-glow-slow absolute -top-40 -left-40 h-[800px] w-[800px] rounded-full bg-indigo-500/15 dark:bg-indigo-500/10 blur-[150px]" />
                <div className="animate-glow-medium absolute top-10 right-0 h-[700px] w-[700px] rounded-full bg-purple-500/15 dark:bg-purple-500/10 blur-[150px]" />
                <div className="animate-glow-fast absolute bottom-10 left-1/4 h-[700px] w-[700px] rounded-full bg-pink-500/10 dark:bg-pink-500/5 blur-[150px]" />
            </div>

            <section className="mx-auto max-w-7xl px-6 py-4">
                {/* Hero Platform Label Presentation */}
                <div className="mx-auto mt-16 max-w-4xl text-center flex flex-col items-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-500 shadow-sm backdrop-blur-md">
                        <Sparkles size={12} className="animate-pulse" /> Free online PDF tools
                    </span>

                    <h1 className="mt-8 text-5xl font-black tracking-tight sm:text-7xl lg:text-8xl text-[color:var(--foreground)] leading-[1.05] max-w-3xl">
                        Powerful
                        <span className="block mt-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_2px_40px_rgba(99,102,241,0.2)] select-none">
                            PDF Tools
                        </span>
                    </h1>

                    <p className="mt-8 text-md sm:text-lg max-w-2xl leading-relaxed text-[color:var(--muted)] font-medium">
                        Merge, split, compress, protect, and convert PDFs instantly with high-performance processing architectures.
                        <span className="block mt-2 text-indigo-500/90 dark:text-indigo-400/90 font-bold">No accounts. No limits. Permanent privacy.</span>
                    </p>

                    <div className="mt-8 flex justify-center">
                        <div className="rounded-full border border-[color:var(--border)] bg-[var(--card)]/60 px-5 py-2 text-xs font-bold text-[color:var(--foreground)] backdrop-blur-md shadow-sm flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Optimized Pipeline Processing Backend Architecture
                        </div>
                    </div>
                </div>

                {/* Engine Value Propositions Block Grid */}
                <div className="mt-20 grid gap-6 sm:grid-cols-2 md:grid-cols-3 max-w-5xl mx-auto">
                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/30 hover:shadow-xl group">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
                            <Sparkles className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">100% Free</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                            All document automation tool options are completely available at zero premium cost thresholds.
                        </p>
                    </div>

                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-purple-500/30 hover:shadow-xl group">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-500 transition-colors group-hover:bg-purple-500 group-hover:text-white">
                            <Zap className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">Fast Engine</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                            Powered by standalone native backend server runtimes capable of parsing complex layer blocks instantly.
                        </p>
                    </div>

                    <div className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)]/50 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-xl group sm:col-span-2 md:col-span-1">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500 transition-colors group-hover:bg-cyan-500 group-hover:text-white">
                            <Shield className="h-6 w-6" />
                        </div>
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">Isolated Workspace</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[color:var(--muted)] font-medium">
                            Secure temporary sandboxes process layout properties. All records clear instantly post compilation.
                        </p>
                    </div>
                </div>

                {/* Centralized Engine Live Search System Input Box */}
                <div className="mx-auto mt-20 max-w-2xl">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/70 p-3 shadow-xl backdrop-blur-md focus-within:border-indigo-500/50 transition-all duration-200">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--muted)] pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && filteredTools.length === 1) {
                                        window.location.href = filteredTools[0].href;
                                    }
                                }}
                                placeholder="Search tool modules (e.g., merge, watermark, encrypt)..."
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] pl-12 pr-4 py-3.5 text-sm text-[var(--foreground)] font-medium placeholder:text-[color:var(--muted)] outline-none focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                            />
                        </div>

                        <div className="mt-3 text-center text-xs font-bold text-[color:var(--muted)] tracking-wide uppercase">
                            {filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'} matching search matrix scope
                        </div>
                    </div>
                </div>

                {/* Active Platform Feature Metadata Pill Chips Layout */}
                <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-3xl mx-auto text-xs font-bold text-[color:var(--muted)]">
                    <span className="rounded-xl border border-[color:var(--border)] bg-slate-100/60 dark:bg-slate-800/40 px-4 py-2 shadow-sm">No Authentication Sign-Up</span>
                    <span className="rounded-xl border border-[color:var(--border)] bg-slate-100/60 dark:bg-slate-800/40 px-4 py-2 shadow-sm">Go High-Performance Engine</span>
                    <span className="rounded-xl border border-[color:var(--border)] bg-slate-100/60 dark:bg-slate-800/40 px-4 py-2 shadow-sm">Isolated Memory Sandboxes</span>
                    <span className="rounded-xl border border-[color:var(--border)] bg-slate-100/60 dark:bg-slate-800/40 px-4 py-2 shadow-sm">Responsive Viewport Handling</span>
                </div>

                {/* Hero Target Tool Box Callout */}
                {search === "" && (
                    <section className="mt-20 max-w-5xl mx-auto">
                        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-[var(--card)] to-indigo-500/5 dark:to-indigo-500/10 p-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300 hover:border-indigo-500/40 hover:shadow-2xl">
                            <div className="space-y-2 max-w-xl">
                                <span className="text-[10px] font-black tracking-widest bg-indigo-500 text-white dark:bg-indigo-500/20 dark:text-indigo-400 px-2.5 py-1 rounded-md uppercase">MOST POPULAR</span>
                                <h2 className="text-2xl font-extrabold text-[color:var(--foreground)] mt-2">Merge PDF Documents Collectively</h2>
                                <p className="text-sm leading-relaxed text-[color:var(--muted)] font-medium">
                                    Combine separate structural files into a clean compound container setup natively in seconds without data compression loss.
                                </p>
                            </div>
                            <Link
                                href="/merge-pdf"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3.5 text-sm font-bold text-white shadow-md hover:opacity-95 hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap"
                            >
                                Open Tool Module <ArrowUpRight size={16} />
                            </Link>
                        </div>
                    </section>
                )}

                {/* Blank Exception Search State Container Frame */}
                {filteredTools.length === 0 && (
                    <div className="mt-25 rounded-3xl border border-dashed border-[color:var(--border)] bg-[var(--card)] p-12 text-center max-w-md mx-auto">
                        <h3 className="text-lg font-bold text-[color:var(--foreground)]">No structural modules matched</h3>
                        <p className="mt-2 text-xs text-[color:var(--muted)] font-medium">Try checking code spelling tags or clear filters.</p>
                    </div>
                )}

                {/* PDF Editing Tools Category Section */}
                {editingTools.length > 0 && (
                    <section className="mt-24 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">PDF Document Architecture Editing</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">Modify structural parameters and compile native document elements layout grids.</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                            {editingTools.map((tool) => (
                                <ToolCard
                                    key={tool.title}
                                    title={tool.title}
                                    description={tool.description}
                                    href={tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {convertTools.length > 0 && (
                    <section className="mt-24 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">Conversion Modules</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">Change container formats.</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                            {convertTools.map((tool) => (
                                <ToolCard
                                    key={tool.title}
                                    title={tool.title}
                                    description={tool.description}
                                    href={tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {securityTools.length > 0 && (
                    <section className="mt-24 border-t border-[color:var(--border)] pt-16">
                        <div className="mb-8">
                            <h2 className="text-2xl font-black text-[color:var(--foreground)] tracking-tight">High-Grade Security</h2>
                            <p className="mt-1 text-sm text-[color:var(--muted)] font-medium">attach high-fidelity cipher authorization signatures securely.</p>
                        </div>
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                            {convertTools.map((tool) => (
                                <ToolCard
                                    key={tool.title}
                                    title={tool.title}
                                    description={tool.description}
                                    href={tool.href}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </section>
        </main>
    );
}