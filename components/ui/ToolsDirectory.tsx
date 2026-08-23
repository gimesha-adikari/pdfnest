"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useTools } from "@/context/ToolContext";
import Stat from "./Stat";

type Category =
    | "all"
    | "organize"
    | "edit"
    | "convert"
    | "create"
    | "security"
    | "optimize"
    | "studio";

export default function ToolsDirectory() {
    const { displayTools: toolsList, isOfflineMode } = useTools();
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<Category>("all");

    const filteredTools = useMemo(() => {
        return toolsList.filter((tool) => {
            const toolCategory = tool.category || (tool as any).Category;
            const toolTitle = tool.title || (tool as any).Title || "";
            const toolDescription = tool.description || (tool as any).Description || "";

            const matchesCategory =
                category === "all" || toolCategory === category;

            const matchesSearch =
                toolTitle.toLowerCase().includes(search.toLowerCase()) ||
                toolDescription.toLowerCase().includes(search.toLowerCase());

            return matchesCategory && matchesSearch;
        });
    }, [toolsList, search, category]);

    const editingCount = toolsList.filter((t) => (t.category || (t as any).Category) === "edit").length;
    const organizeCount = toolsList.filter((t) => (t.category || (t as any).Category) === "organize").length;
    const convertCount = toolsList.filter((t) => (t.category || (t as any).Category) === "convert").length;
    const createCount = toolsList.filter((t) => (t.category || (t as any).Category) === "create").length;
    const securityCount = toolsList.filter((t) => (t.category || (t as any).Category) === "security").length;
    const optimizeCount = toolsList.filter((t) => (t.category || (t as any).Category) === "optimize").length;
    const studioCount = toolsList.filter((t) => (t.category || (t as any).Category) === "studio").length;

    return (
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 transition-colors">
            {/* Hero */}
            <section className="text-center max-w-3xl mx-auto">
                <div className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-mono shadow-sm ${
                    isOfflineMode
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                        : "border-[var(--border)] bg-[var(--surface-card)] text-[var(--muted)]"
                }`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    {isOfflineMode ? (
                        <span>{toolsList.length} Local Tools Available (Offline)</span>
                    ) : (
                        <span>{toolsList.length} Document Utilities Online</span>
                    )}
                </div>

                <h1 className="mt-6 text-3xl sm:text-5xl font-bold tracking-tight text-[var(--foreground)]">
                    PDF Tools Directory
                </h1>

                <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-[var(--muted)] leading-relaxed">
                    {isOfflineMode
                        ? "Process, merge, split, watermark, and organize PDF documents directly in your browser with zero data leaving your device."
                        : "Comprehensive suite of precision document manipulation, conversion, and security tools."}
                </p>
            </section>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <Stat title="organize" value={organizeCount} />
                <Stat title="edit" value={editingCount} />
                <Stat title="convert" value={convertCount} />
                <Stat title="create" value={createCount} />
                <Stat title="security" value={securityCount} />
                <Stat title="optimize" value={optimizeCount} />
                <Stat title="studio" value={studioCount} />
            </div>

            {/* Search */}
            <div className="mx-auto mt-10 max-w-xl">
                <div className="relative">
                    <Search
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                    />

                    <input
                        type="text"
                        placeholder="Search tools by name, action or category..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] py-2.5 pl-10 pr-4 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] shadow-sm"
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                <CategoryButton active={category === "all"} onClick={() => setCategory("all")}>
                    All
                </CategoryButton>
                <CategoryButton active={category === "organize"} onClick={() => setCategory("organize")}>
                    Organize
                </CategoryButton>
                <CategoryButton active={category === "edit"} onClick={() => setCategory("edit")}>
                    Edit
                </CategoryButton>
                <CategoryButton active={category === "convert"} onClick={() => setCategory("convert")}>
                    Convert
                </CategoryButton>
                <CategoryButton active={category === "create"} onClick={() => setCategory("create")}>
                    Create
                </CategoryButton>
                <CategoryButton active={category === "security"} onClick={() => setCategory("security")}>
                    Security
                </CategoryButton>
                <CategoryButton active={category === "optimize"} onClick={() => setCategory("optimize")}>
                    Optimize
                </CategoryButton>
                <CategoryButton active={category === "studio"} onClick={() => setCategory("studio")}>
                    Studio
                </CategoryButton>
            </div>

            {/* Results counter */}
            <div className="mt-6 text-center font-mono text-xs text-[var(--muted-foreground)]">
                Showing {filteredTools.length} tools
            </div>

            {/* Grid */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredTools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className="group flex flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-5 transition-all duration-200 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] shadow-sm"
                    >
                        <div>
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                                    {tool.title}
                                </h3>

                                {tool.isNew && (
                                    <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                                        NEW
                                    </span>
                                )}
                            </div>

                            <p className="mt-2 line-clamp-2 text-xs text-[var(--muted)] leading-relaxed">
                                {tool.description}
                            </p>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                            <span className="font-mono text-[10px] uppercase text-[var(--muted-foreground)] tracking-wider">
                                {tool.category}
                            </span>

                            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-muted)] group-hover:text-[var(--foreground)] transition-colors font-semibold">
                                Open →
                            </span>
                        </div>
                    </Link>
                ))}
            </div>

            {filteredTools.length === 0 && (
                <div className="mt-16 text-center py-12 rounded-lg border border-dashed border-[var(--border)] max-w-md mx-auto bg-[var(--surface-card)]">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">No tools found</h3>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Try searching for a different keyword.
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
                rounded-md
                px-3 py-1.5
                font-mono
                text-xs
                transition-colors
                border
                ${
                active
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface-card)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--muted)]"
            }
            `}
        >
            {children}
        </button>
    );
}