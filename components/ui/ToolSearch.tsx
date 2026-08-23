"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTools } from "@/context/ToolContext";

export default function ToolSearch() {
    const { displayTools: tools } = useTools();
    const [query, setQuery] = useState("");

    const results = useMemo(() => {
        if (!query.trim()) return [];

        return tools.filter((tool) => {
            const title = tool.title || (tool as any).Title || "";
            return title.toLowerCase().includes(query.toLowerCase());
        }).slice(0, 8);
    }, [query, tools]);

    return (
        <div className="relative hidden lg:block">
            <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
            />

            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools..."
                className="w-52 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] pl-8 pr-12 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface-card)]"
            />

            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 font-mono text-[9px] text-[var(--muted-foreground)]">
                    ⌘K
                </kbd>
            </div>

            {results.length > 0 && (
                <div className="absolute top-full left-0 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-xl z-50">
                    <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border-subtle)] mb-1">
                        Matching Tools ({results.length})
                    </div>
                    {results.map((tool) => (
                        <Link
                            key={tool.href}
                            href={tool.href}
                            onClick={() => setQuery("")}
                            className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            <span className="truncate">{tool.title}</span>
                            <span className="font-mono text-[10px] text-[var(--muted-foreground)] uppercase">
                                {tool.category}
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}