"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import { NAV_TOOLS } from "@/lib/toolsData";
import { ChevronDown } from "lucide-react";

export default function Header() {
    const editingTools = NAV_TOOLS.filter((t) => t.category === "editing");
    const convertTools = NAV_TOOLS.filter((t) => t.category === "convert");
    const securityTools = NAV_TOOLS.filter((t) => t.category === "security");

    return (
        <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--background)]/80 backdrop-blur-xl transition-all">
            <div className="mx-auto max-w-7xl px-6">
                <div className="flex h-16 items-center justify-between">
                    {/* Platform Brand Identity Header Node Link */}
                    <Link href="/" className="flex items-center gap-2.5 group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-xl p-1">
                        <div className="relative flex items-center justify-center bg-indigo-500/10 dark:bg-indigo-500/20 rounded-xl p-1 border border-indigo-500/20 overflow-hidden h-10 w-10 transition-transform group-hover:scale-105">
                            <Image
                                src="/pdfnest-logo.svg"
                                alt="PDFNest logo"
                                width={40}
                                height={40}
                                className="object-contain h-full w-full"
                                priority
                            />
                        </div>
                        <div className="leading-tight">
                            <span className="text-md font-black tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent block">
                                PDFNest
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)] block -mt-0.5">
                                Free PDF Tools
                            </span>
                        </div>
                    </Link>

                    {/* Centralized Desktop Navigation Interface Menu */}
                    <nav className="hidden md:flex items-center gap-1">
                        <Link
                            href="/"
                            className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl text-[color:var(--foreground)] hover:bg-[color:var(--border)]/30 transition-colors"
                        >
                            Home
                        </Link>

                        {/* PDF Editing Submenu Actions Toggle */}
                        <div className="relative group/menu">
                            <button
                                type="button"
                                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl text-[color:var(--foreground)] hover:bg-[color:var(--border)]/30 transition-colors outline-none"
                            >
                                Layout Structure <ChevronDown size={12} className="opacity-60 group-hover/menu:rotate-180 transition-transform duration-200" />
                            </button>

                            <div className="invisible absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover/menu:visible group-hover/menu:opacity-100 max-h-[70vh] overflow-y-auto scrollbar-thin">
                                <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--muted)] border-b border-[color:var(--border)] mb-1">
                                    PDF Editing Operations
                                </p>
                                {editingTools.map((tool) => (
                                    <Link
                                        key={tool.href}
                                        href={tool.href}
                                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium hover:bg-[color:var(--background)] transition-colors ${
                                            tool.isNew ? "font-bold text-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10" : "text-[color:var(--foreground)]"
                                        }`}
                                    >
                                        <span>{tool.title}</span>
                                        {tool.isNew && <span className="text-[9px] bg-indigo-500 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-wide">New</span>}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* Conversion Categories Dropdown Module */}
                        <div className="relative group/menu">
                            <button
                                type="button"
                                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl text-[color:var(--foreground)] hover:bg-[color:var(--border)]/30 transition-colors outline-none"
                            >
                                Convert <ChevronDown size={12} className="opacity-60 group-hover/menu:rotate-180 transition-transform duration-200" />
                            </button>

                            <div className="invisible absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover/menu:visible group-hover/menu:opacity-100 max-h-[70vh] overflow-y-auto scrollbar-thin">
                                <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--muted)] border-b border-[color:var(--border)] mb-1">
                                    Conversion Routines
                                </p>
                                {convertTools.map((tool) => (
                                    <Link
                                        key={tool.href}
                                        href={tool.href}
                                        className="block rounded-xl px-3 py-2.5 text-xs font-medium text-[color:var(--foreground)] hover:bg-[color:var(--background)] transition-colors"
                                    >
                                        {tool.title}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        <div className="relative group/menu">
                            <button
                                type="button"
                                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl text-[color:var(--foreground)] hover:bg-[color:var(--border)]/30 transition-colors outline-none"
                            >
                                Secure <ChevronDown size={12} className="opacity-60 group-hover/menu:rotate-180 transition-transform duration-200" />
                            </button>

                            <div className="invisible absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 opacity-0 shadow-2xl transition-all duration-200 group-hover/menu:visible group-hover/menu:opacity-100 max-h-[70vh] overflow-y-auto scrollbar-thin">
                                <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--muted)] border-b border-[color:var(--border)] mb-1">
                                    Conversion Routines
                                </p>
                                {securityTools.map((tool) => (
                                    <Link
                                        key={tool.href}
                                        href={tool.href}
                                        className="block rounded-xl px-3 py-2.5 text-xs font-medium text-[color:var(--foreground)] hover:bg-[color:var(--background)] transition-colors"
                                    >
                                        {tool.title}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        <Link
                            href="/about"
                            className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl text-[color:var(--foreground)] hover:bg-[color:var(--border)]/30 transition-colors"
                        >
                            About Engine
                        </Link>
                    </nav>

                    {/* Dark Mode Theme Control Switches Board */}
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </header>
    );
}