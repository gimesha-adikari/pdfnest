"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { NAV_TOOLS } from "@/lib/toolsData";
import Stat from "./Stat";

type Category = "all" | "editing" | "convert" | "security";

export default function ToolsDirectory() {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<Category>("all");

    const filteredTools = useMemo(() => {
        return NAV_TOOLS.filter((tool) => {
            const matchesCategory =
                category === "all" || tool.category === category;

            const matchesSearch =
                tool.title.toLowerCase().includes(search.toLowerCase()) ||
                tool.description
                    .toLowerCase()
                    .includes(search.toLowerCase());

            return matchesCategory && matchesSearch;
        });
    }, [search, category]);

    const editingCount = NAV_TOOLS.filter(
        (t) => t.category === "editing"
    ).length;

    const convertCount = NAV_TOOLS.filter(
        (t) => t.category === "convert"
    ).length;

    const securityCount = NAV_TOOLS.filter(
        (t) => t.category === "security"
    ).length;

    return (
        <main className="mx-auto max-w-7xl px-6 py-16">
            {/* Hero */}
            <section className="text-center">
                <div className="inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1 text-sm font-semibold text-indigo-500">
                    {NAV_TOOLS.length} PDF Tools
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight">
                    PDF Tools Directory
                </h1>

                <p className="mx-auto mt-4 max-w-2xl text-lg text-[color:var(--muted)]">
                    Edit, convert, optimize and secure PDF documents with
                    PDFNest.
                </p>
            </section>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat title="Editing" value={editingCount} />
                <Stat title="Convert" value={convertCount} />
                <Stat title="Security" value={securityCount} />
            </div>

            {/* Search */}
            <div className="mx-auto mt-10 max-w-xl">
                <div className="relative">
                    <Search
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
                    />

                    <input
                        type="text"
                        placeholder="Search tools..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="
                            w-full
                            rounded-2xl
                            border border-[color:var(--border)]
                            bg-[var(--card)]
                            py-3 pl-12 pr-4
                            outline-none
                            focus:ring-2
                            focus:ring-indigo-500/30
                        "
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <CategoryButton
                    active={category === "all"}
                    onClick={() => setCategory("all")}
                >
                    All
                </CategoryButton>

                <CategoryButton
                    active={category === "editing"}
                    onClick={() => setCategory("editing")}
                >
                    ✏️ Editing
                </CategoryButton>

                <CategoryButton
                    active={category === "convert"}
                    onClick={() => setCategory("convert")}
                >
                    🔄 Convert
                </CategoryButton>

                <CategoryButton
                    active={category === "security"}
                    onClick={() => setCategory("security")}
                >
                    🔒 Security
                </CategoryButton>
            </div>

            {/* Results */}
            <div className="mt-6 text-center text-sm text-[color:var(--muted)]">
                Showing {filteredTools.length} tools
            </div>

            {/* Grid */}
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredTools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className="
                            group
                            rounded-3xl
                            border border-[color:var(--border)]
                            bg-[var(--card)]
                            p-5
                            transition-all
                            hover:-translate-y-1
                            hover:border-indigo-500/30
                            hover:shadow-xl
                        "
                    >
                        <div className="flex items-start justify-between">
                            <h3 className="font-bold">
                                {tool.title}
                            </h3>

                            {tool.isNew && (
                                <span className="rounded-full bg-indigo-500 px-2 py-1 text-[10px] font-black uppercase text-white">
                                    New
                                </span>
                            )}
                        </div>

                        <p className="mt-3 line-clamp-3 text-sm text-[color:var(--muted)]">
                            {tool.description}
                        </p>

                        <div className="mt-4 flex items-center justify-between">
                            <span className="rounded-full border border-[color:var(--border)] px-2 py-1 text-[10px] uppercase">
                                {tool.category}
                            </span>

                            <span className="text-sm font-semibold text-indigo-500">
                                Open →
                            </span>
                        </div>
                    </Link>
                ))}
            </div>

            {filteredTools.length === 0 && (
                <div className="mt-20 text-center">
                    <h3 className="text-xl font-bold">No tools found</h3>
                    <p className="mt-2 text-[color:var(--muted)]">
                        Try another keyword.
                    </p>
                </div>
            )}
        </main>
    );
}

function CategoryButton({
                            active,
                            children,
                            onClick,
                        }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`
                rounded-full
                px-4 py-2
                text-sm
                font-semibold
                transition-all
                border
                ${
                active
                    ? "bg-indigo-500 text-white border-indigo-500"
                    : "border-[color:var(--border)] hover:bg-[var(--card)]"
            }
            `}
        >
            {children}
        </button>
    );
}