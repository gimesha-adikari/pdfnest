"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NAV_TOOLS } from "@/lib/toolsData";

export default function ToolSearch() {
    const [query, setQuery] = useState("");

    const results = useMemo(() => {
        if (!query.trim()) return [];

        return NAV_TOOLS.filter((tool) =>
            tool.title.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 8);
    }, [query]);

    return (
        <div className="relative hidden lg:block">
            <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
            />

            <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools..."
                className="
                    w-64
                    rounded-xl
                    border border-[color:var(--border)]
                    bg-[var(--card)]
                    pl-9 pr-3 py-2
                    text-sm
                    outline-none
                    focus:ring-2
                    focus:ring-indigo-500/30
                "
            />

            {results.length > 0 && (
                <div
                    className="
                        absolute top-full left-0
                        mt-2 w-full
                        rounded-2xl
                        border border-[color:var(--border)]
                        bg-[var(--card)]
                        p-2
                        shadow-2xl
                        z-50
                    "
                >
                    {results.map((tool) => (
                        <Link
                            key={tool.href}
                            href={tool.href}
                            onClick={() => setQuery("")}
                            className="
                                block
                                rounded-xl
                                px-3 py-2
                                text-sm
                                hover:bg-[color:var(--background)]
                                transition-colors
                            "
                        >
                            {tool.title}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}