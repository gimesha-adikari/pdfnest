"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Sparkles, Shield, Zap } from "lucide-react";
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

    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
            <div className="absolute inset-0 overflow-hidden -z-10">
                <div
                    className="
            absolute
            inset-0
            opacity-[0.03]
            bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]
            bg-[size:80px_80px]
          "
                />

                <div
                    className="
            animate-glow-slow
            absolute
            -top-32
            -left-32
            h-[650px]
            w-[650px]
            rounded-full
            bg-indigo-500/20
            blur-[140px]
          "
                />

                <div
                    className="
            animate-glow-medium
            absolute
            top-20
            right-0
            h-[550px]
            w-[550px]
            rounded-full
            bg-pink-500/20
            blur-[140px]
          "
                />

                <div
                    className="
            animate-glow-fast
            absolute
            bottom-0
            left-1/3
            h-[550px]
            w-[550px]
            rounded-full
            bg-cyan-500/20
            blur-[140px]
          "
                />
            </div>

            <section className="mx-auto max-w-7xl px-6 py-10">
                <div className="mx-auto mt-20 max-w-3xl text-center">
          <span
              className="
              inline-flex
              rounded-full
              border
              border-indigo-200
              bg-indigo-50
              px-4
              py-1
              text-sm
              font-medium
              text-indigo-700
            "
          >
            Free online PDF tools
          </span>

                    <h1
                        className="
              mt-6
              text-6xl
              font-black
              tracking-tight
              sm:text-7xl
              drop-shadow-[0_0_30px_rgba(99,102,241,0.25)]
            "
                    >
                        Powerful
                        <span className="block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              PDF Tools
            </span>
                    </h1>

                    <p className="mt-6 text-lg leading-8 text-[color:var(--muted)]">
                        Merge, split, compress, protect, and convert PDFs instantly with high-performance processing architectures.
                        No accounts. No limits.
                    </p>

                    <div className="mt-8 flex justify-center">
                        <div
                            className="
                rounded-full
                border
                border-indigo-500/20
                bg-indigo-500/10
                px-5
                py-2
                text-sm
                font-medium
                backdrop-blur-md
              "
                        >
                            🚀 Optimized Pipeline Processing Backend Architecture
                        </div>
                    </div>
                </div>

                <div className="mt-16 grid gap-6 md:grid-cols-3">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/80 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                        <Sparkles className="mx-auto mb-3 h-8 w-8 text-indigo-500" />
                        <h3 className="text-xl font-bold">100% Free</h3>
                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            All tools are available at no cost.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/80 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                        <Zap className="mx-auto mb-3 h-8 w-8 text-purple-500" />
                        <h3 className="text-xl font-bold">Fast Engine</h3>
                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            Powered by standalone native server runtimes.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/80 backdrop-blur-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                        <Shield className="mx-auto mb-3 h-8 w-8 text-cyan-500" />
                        <h3 className="text-xl font-bold">Isolated Workspace</h3>
                        <p className="mt-2 text-sm text-[color:var(--muted)]">
                            Temporary runtime tracks clear immediately after completion.
                        </p>
                    </div>
                </div>

                <div className="mx-auto mt-12 max-w-3xl">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--card)]/80 backdrop-blur-xl p-4 shadow-lg">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--muted)]" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && filteredTools.length === 1) {
                                        window.location.href = filteredTools[0].href;
                                    }
                                }}
                                placeholder="Search PDF tools..."
                                className="w-full rounded-xl border border-[color:var(--border)] bg-[var(--background)] pl-12 pr-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[color:var(--muted)] outline-none focus:border-indigo-500"
                            />
                        </div>

                        <p className="mt-3 text-center text-sm text-[color:var(--muted)]">
                            {filteredTools.length} tools matching search parameters
                        </p>
                    </div>
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-[color:var(--muted)]">
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2">No Sign-Up</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2">Go Performance Run</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2">Isolated File Operations</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2">Mobile Optimized</span>
                </div>

                <section className="mt-20">
                    <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-[var(--card)] to-indigo-500/5 p-8 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                        <span className="text-sm font-semibold text-indigo-500">MOST POPULAR</span>
                        <h2 className="mt-2 text-3xl font-bold">Merge PDF</h2>
                        <p className="mt-3 text-[color:var(--muted)]">
                            Combine multiple PDF files into one document in seconds.
                        </p>
                        <Link
                            href="/merge-pdf"
                            className="mt-6 inline-block rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 font-medium text-white"
                        >
                            Open Tool
                        </Link>
                    </div>
                </section>

                {filteredTools.length === 0 && (
                    <div className="mt-20 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-10 text-center">
                        <h3 className="text-xl font-semibold">No tools found</h3>
                        <p className="mt-2 text-[color:var(--muted)]">Try another search term.</p>
                    </div>
                )}

                {editingTools.length > 0 && (
                    <section className="mt-20">
                        <h2 className="text-2xl font-bold">PDF Editing</h2>
                        <p className="mt-2 text-[color:var(--muted)]">Modify and organize PDF documents.</p>
                        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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
                    <section className="mt-20">
                        <h2 className="text-2xl font-bold">Convert & Security</h2>
                        <p className="mt-2 text-[color:var(--muted)]">Change formats and secure internal structures.</p>
                        <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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