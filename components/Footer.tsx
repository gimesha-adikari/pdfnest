"use client";

import Link from "next/link";
import { useTools } from "@/context/ToolContext";
import Logo from "@/components/ui/Logo";

interface BackendTool {
    Title?: string;
    title?: string;
    Href?: string;
    href?: string;
    Category?: string;
    category?: string;
    IsNew?: boolean;
    isNew?: boolean;
}

export default function Footer() {
    const { displayTools: toolsList } = useTools();

    const organizeTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "organize"
    );

    const editTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "edit"
    );

    const convertTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "convert"
    );

    const createTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "create"
    );

    const securityTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "security"
    );

    const optimizeTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "optimize"
    );

    const studioTools = toolsList.filter(
        (t: BackendTool) => (t.Category || t.category) === "studio"
    );

    return (
        <footer
            className="
                relative
                z-10
                mt-auto
                border-t
                border-[var(--border)]
                bg-[var(--surface)]
                text-[var(--foreground)]
                transition-colors
            "
        >
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6">

                    {/* =====================================================
                        BRAND
                    ====================================================== */}
                    <div className="col-span-2 flex flex-col items-start gap-4 pr-6">

                        <Link
                            href="/"
                            className="
                                group
                                flex
                                items-center
                                gap-3
                                rounded-lg
                                focus-visible:outline-none
                                focus-visible:ring-2
                                focus-visible:ring-[var(--accent)]
                            "
                        >
                            {/* Platen Logo */}
                            <div
                                className="
                                    relative
                                    flex
                                    h-9
                                    w-9
                                    shrink-0
                                    items-center
                                    justify-center
                                    rounded-[9px]
                                    border
                                    border-[var(--border)]
                                    bg-[var(--surface-secondary)]
                                    transition-all
                                    duration-200
                                    group-hover:border-[var(--accent)]/50
                                    group-hover:bg-[var(--surface-hover)]
                                "
                            >
                                <div className="relative h-11 w-11 shrink-0">
                                    <Logo />
                                </div>
                            </div>

                            {/* Wordmark */}
                            <div className="flex flex-col">
                                <span
                                    className="
                                        text-base
                                        font-bold
                                        leading-none
                                        tracking-tight
                                        text-[var(--foreground)]
                                        transition-colors
                                        group-hover:text-[var(--accent)]
                                    "
                                >
                                    PLATEN
                                </span>

                                <span
                                    className="
                                        mt-1
                                        font-mono
                                        text-[9px]
                                        uppercase
                                        leading-none
                                        tracking-wider
                                        text-[var(--muted-foreground)]
                                    "
                                >
                                    CORE v2.0
                                </span>
                            </div>
                        </Link>

                        <p className="max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">
                            Files are processed in secure, isolated sandbox
                            environments and automatically purged. Precision
                            document infrastructure.
                        </p>

                        <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                            © {new Date().getFullYear()} Platen Engine. All rights reserved.
                        </p>
                    </div>

                    {/* =====================================================
                        PRODUCTS
                    ====================================================== */}
                    <div className="flex flex-col gap-2.5">
                        <span
                            className="
                                font-mono
                                text-[11px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-[var(--foreground)]
                            "
                        >
                            PRODUCTS
                        </span>

                        <div className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
                            <Link
                                href="/merge-pdf"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Merge PDF
                            </Link>

                            <Link
                                href="/edit-pdf"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Edit PDF
                            </Link>

                            <Link
                                href="/pdf-to-word"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                PDF to Word
                            </Link>

                            <Link
                                href="/pdf-to-markdown"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                PDF to Markdown
                            </Link>

                            <Link
                                href="/tools"
                                className="
                                    pt-1
                                    font-medium
                                    text-[var(--accent-muted)]
                                    hover:underline
                                "
                            >
                                Browse all tools →
                            </Link>
                        </div>
                    </div>

                    {/* =====================================================
                        ECOSYSTEM
                    ====================================================== */}
                    <div className="flex flex-col gap-2.5">
                        <span
                            className="
                                font-mono
                                text-[11px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-[var(--foreground)]
                            "
                        >
                            ECOSYSTEM
                        </span>

                        <div className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
                            <Link
                                href="/studio"
                                className="
                                    flex
                                    items-center
                                    gap-1.5
                                    transition-colors
                                    hover:text-[var(--foreground)]
                                "
                            >
                                <span>PDF Studio</span>

                                <span
                                    className="
                                        rounded
                                        border
                                        border-[var(--border)]
                                        bg-[var(--surface-secondary)]
                                        px-1
                                        py-0.5
                                        font-mono
                                        text-[9px]
                                        uppercase
                                        text-[var(--muted)]
                                    "
                                >
                                    WORKSPACE
                                </span>
                            </Link>

                            <Link
                                href="/repository-analyzer"
                                className="
                                    flex
                                    items-center
                                    gap-1.5
                                    transition-colors
                                    hover:text-[var(--foreground)]
                                "
                            >
                                <span>Repository Analyzer</span>

                                <span
                                    className="
                                        rounded
                                        bg-[var(--accent-subtle)]
                                        px-1
                                        py-0.5
                                        font-mono
                                        text-[9px]
                                        font-semibold
                                        uppercase
                                        text-[var(--accent-muted)]
                                    "
                                >
                                    NEW
                                </span>
                            </Link>

                            <Link
                                href="/pricing"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Pricing & Compute
                            </Link>

                            <Link
                                href="/about"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Architecture Details
                            </Link>
                        </div>
                    </div>

                    {/* =====================================================
                        LEGAL & SECURE
                    ====================================================== */}
                    <div className="flex flex-col gap-2.5">
                        <span
                            className="
                                font-mono
                                text-[11px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-[var(--foreground)]
                            "
                        >
                            LEGAL & SECURE
                        </span>

                        <div className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
                            <Link
                                href="/security"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Security Architecture
                            </Link>

                            <Link
                                href="/privacy"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Privacy Policy
                            </Link>

                            <Link
                                href="/terms"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Terms of Service
                            </Link>

                            <Link
                                href="/acceptable-use"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Acceptable Use
                            </Link>

                            <Link
                                href="/cookies"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Cookie Policy
                            </Link>

                            <Link
                                href="/refund"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Refund Policy
                            </Link>

                            <Link
                                href="/contact"
                                className="transition-colors hover:text-[var(--foreground)]"
                            >
                                Contact
                            </Link>
                        </div>
                    </div>

                    {/* =====================================================
                        SYSTEM STATUS
                    ====================================================== */}
                    <div className="flex flex-col gap-2.5">
                        <span
                            className="
                                font-mono
                                text-[11px]
                                font-semibold
                                uppercase
                                tracking-wider
                                text-[var(--foreground)]
                            "
                        >
                            SYSTEM
                        </span>

                        <div className="mt-1 flex items-center gap-2">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>

                            <span
                                className="
                                    font-mono
                                    text-xs
                                    font-medium
                                    text-[var(--muted)]
                                "
                            >
                                All Systems Operational
                            </span>
                        </div>

                        <div
                            className="
                                mt-2
                                font-mono
                                text-[11px]
                                leading-relaxed
                                text-[var(--muted-foreground)]
                            "
                        >
                            Zero-trust sandbox ready.
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}