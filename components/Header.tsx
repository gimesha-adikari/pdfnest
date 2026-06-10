"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import { NAV_TOOLS } from "@/lib/toolsData";

export default function Header() {
    const editingTools = NAV_TOOLS.filter((t) => t.category === "editing");
    const convertTools = NAV_TOOLS.filter((t) => t.category === "convert");

    return (
        <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--background)]/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6">
                <div className="flex h-16 items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/pdfnest-logo.png"
                            alt="PDFNest logo"
                            width={200}
                            height={200}
                            className="h-20 w-20 rounded-xl object-contain"
                            priority
                        />
                        <div>
                            <p className="text-xs font-semibold text-[color:var(--muted)]">
                                Free PDF Tools
                            </p>
                        </div>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        <Link
                            href="/"
                            className="text-sm font-medium hover:text-indigo-400 transition-colors"
                        >
                            Home
                        </Link>

                        <div className="group relative">
                            <button className="flex items-center gap-2 text-sm font-medium hover:text-indigo-400 transition-colors">
                                Tools
                                <span className="text-xs">▼</span>
                            </button>

                            <div className="invisible absolute left-0 top-full mt-3 w-64 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover:visible group-hover:opacity-100 max-h-[80vh] overflow-y-auto">
                                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)] border-b border-[color:var(--border)] mb-1">
                                    PDF Editing
                                </p>
                                {editingTools.map((tool) => (
                                    <Link
                                        key={tool.href}
                                        href={tool.href}
                                        className={`block rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors ${
                                            tool.isNew ? "font-medium text-indigo-400" : ""
                                        }`}
                                    >
                                        {tool.title}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        <div className="group relative">
                            <button className="flex items-center gap-2 text-sm font-medium hover:text-indigo-400 transition-colors">
                                Convert
                                <span className="text-xs">▼</span>
                            </button>

                            <div className="invisible absolute left-0 top-full mt-3 w-60 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover:visible group-hover:opacity-100">
                                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)] border-b border-[color:var(--border)] mb-1">
                                    Conversion
                                </p>
                                {convertTools.map((tool) => (
                                    <Link
                                        key={tool.href}
                                        href={tool.href}
                                        className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                                    >
                                        {tool.title}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        <Link
                            href="/about"
                            className="text-sm font-medium hover:text-indigo-400 transition-colors"
                        >
                            About
                        </Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </header>
    );
}