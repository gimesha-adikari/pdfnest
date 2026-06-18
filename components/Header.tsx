"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import ToolSearch from "./ui/ToolSearch";
import { NAV_TOOLS } from "@/lib/toolsData";
import { ChevronDown } from "lucide-react";

export default function Header() {
    const editingTools = NAV_TOOLS.filter(
        (tool) => tool.category === "editing"
    );

    const convertTools = NAV_TOOLS.filter(
        (tool) => tool.category === "convert"
    );

    const securityTools = NAV_TOOLS.filter(
        (tool) => tool.category === "security"
    );

    return (
        <header
            className="
                sticky top-0 z-50
                border-b border-[color:var(--border)]
                bg-[var(--background)]/80
                backdrop-blur-xl
            "
        >
            <div className="mx-auto max-w-7xl px-6">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="
                            flex items-center gap-2.5
                            group
                            rounded-xl
                            p-1
                        "
                    >
                        <div
                            className="
                                relative
                                h-10 w-10
                                rounded-xl
                                border border-indigo-500/20
                                bg-indigo-500/10
                                dark:bg-indigo-500/20
                                overflow-hidden
                                transition-transform
                                group-hover:scale-105
                            "
                        >
                            <Image
                                src="/pdfnest-logo.svg"
                                alt="PDFNest"
                                fill
                                className="object-contain p-1"
                                priority
                            />
                        </div>

                        <div className="leading-tight">
                            <span
                                className="
                                    block
                                    text-md
                                    font-black
                                    tracking-tight
                                    bg-gradient-to-r
                                    from-indigo-500
                                    to-purple-500
                                    bg-clip-text
                                    text-transparent
                                "
                            >
                                PDFNest
                            </span>

                            <span
                                className="
                                    block
                                    -mt-0.5
                                    text-[10px]
                                    font-bold
                                    uppercase
                                    tracking-wider
                                    text-[color:var(--muted)]
                                "
                            >
                                Free PDF Tools
                            </span>
                        </div>
                    </Link>

                    {/* Navigation */}
                    <nav className="hidden md:flex items-center gap-2">
                        <Link
                            href="/"
                            className="
                                rounded-xl
                                px-3 py-2
                                text-sm
                                font-semibold
                                hover:bg-[color:var(--border)]/30
                            "
                        >
                            Home
                        </Link>

                        {/* Mega Menu */}
                        <div className="relative group/menu">
                            <button
                                className="
                                    flex items-center gap-1
                                    rounded-xl
                                    px-3 py-2
                                    text-sm
                                    font-semibold
                                    hover:bg-[color:var(--border)]/30
                                "
                            >
                                Tools

                                <ChevronDown
                                    size={14}
                                    className="
                                        transition-transform
                                        duration-200
                                        group-hover/menu:rotate-180
                                    "
                                />
                            </button>

                            <div
                                className="
                                    invisible
                                    absolute
                                    left-1/2
                                    top-full
                                    mt-3
                                    w-[900px]
                                    -translate-x-1/2
                                    rounded-3xl
                                    border border-[color:var(--border)]
                                    bg-[var(--card)]
                                    p-6
                                    opacity-0
                                    shadow-2xl
                                    transition-all
                                    duration-200
                                    group-hover/menu:visible
                                    group-hover/menu:opacity-100
                                "
                            >
                                <div className="mb-5">
                                    <h3 className="font-black text-lg">
                                        PDF Tools
                                    </h3>

                                    <p className="text-sm text-[color:var(--muted)]">
                                        Everything you need to edit, convert and
                                        secure PDFs.
                                    </p>
                                </div>

                                <div className="grid grid-cols-3 gap-8">
                                    {/* Editing */}
                                    <div>
                                        <h4 className="mb-3 font-bold">
                                            ✏️ Editing
                                        </h4>

                                        <div className="space-y-1">
                                            {editingTools.map((tool) => (
                                                <Link
                                                    key={tool.href}
                                                    href={tool.href}
                                                    className="
                                                        flex items-center justify-between
                                                        rounded-xl
                                                        px-3 py-2
                                                        text-sm
                                                        hover:bg-[color:var(--background)]
                                                    "
                                                >
                                                    <span>{tool.title}</span>

                                                    {tool.isNew && (
                                                        <span
                                                            className="
                                                                rounded-md
                                                                bg-indigo-500
                                                                px-1.5 py-0.5
                                                                text-[9px]
                                                                font-black
                                                                uppercase
                                                                text-white
                                                            "
                                                        >
                                                            New
                                                        </span>
                                                    )}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Convert */}
                                    <div>
                                        <h4 className="mb-3 font-bold">
                                            🔄 Convert
                                        </h4>

                                        <div className="space-y-1">
                                            {convertTools.map((tool) => (
                                                <Link
                                                    key={tool.href}
                                                    href={tool.href}
                                                    className="
                                                        flex items-center justify-between
                                                        rounded-xl
                                                        px-3 py-2
                                                        text-sm
                                                        hover:bg-[color:var(--background)]
                                                    "
                                                >
                                                    <span>{tool.title}</span>

                                                    {tool.isNew && (
                                                        <span
                                                            className="
                                                                rounded-md
                                                                bg-indigo-500
                                                                px-1.5 py-0.5
                                                                text-[9px]
                                                                font-black
                                                                uppercase
                                                                text-white
                                                            "
                                                        >
                                                            New
                                                        </span>
                                                    )}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Security */}
                                    <div>
                                        <h4 className="mb-3 font-bold">
                                            🔒 Security
                                        </h4>

                                        <div className="space-y-1">
                                            {securityTools.map((tool) => (
                                                <Link
                                                    key={tool.href}
                                                    href={tool.href}
                                                    className="
                                                        flex items-center justify-between
                                                        rounded-xl
                                                        px-3 py-2
                                                        text-sm
                                                        hover:bg-[color:var(--background)]
                                                    "
                                                >
                                                    <span>{tool.title}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    className="
                                        mt-6
                                        border-t border-[color:var(--border)]
                                        pt-4
                                    "
                                >
                                    <Link
                                        href="/tools"
                                        className="
                                            text-sm
                                            font-semibold
                                            text-indigo-500
                                            hover:underline
                                        "
                                    >
                                        View all tools →
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <ToolSearch />

                        <Link
                            href="/about"
                            className="
                                rounded-xl
                                px-3 py-2
                                text-sm
                                font-semibold
                                hover:bg-[color:var(--border)]/30
                            "
                        >
                            About
                        </Link>
                    </nav>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </header>
    );
}