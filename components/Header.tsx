"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
    return (
        <header
            className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--background)]/80 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6">
                <div className="flex h-16 items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/pdfnest-logo.png"
                            alt="PDFNest logo"
                            width={500}
                            height={500}
                            className="h-50 w-50 rounded-xl object-contain"
                            priority
                        />

                        <div>
                            <p className="text-xs text-[color:var(--muted)]">
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

                        {/* PDF Tools */}
                        <div className="group relative">
                            <button
                                className="
                flex items-center gap-2
                text-sm font-medium
                hover:text-indigo-400
                transition-colors
            "
                            >
                                Tools
                                <span className="text-xs">▼</span>
                            </button>

                            <div
                                className="
                invisible
                absolute
                left-0
                top-full
                mt-3
                w-60
                rounded-2xl
                border
                border-[color:var(--border)]
                bg-[var(--card)]
                p-2
                opacity-0
                shadow-2xl
                transition-all
                duration-200
                group-hover:visible
                group-hover:opacity-100
            "
                            >
                                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                                    PDF Editing
                                </p>

                                <Link
                                    href="/merge-pdf"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Merge PDF
                                </Link>

                                <Link
                                    href="/split-pdf"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Split PDF
                                </Link>

                                <Link
                                    href="/delete-pages"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Delete Pages
                                </Link>

                                <Link
                                    href="/reorder-pages"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Reorder Pages
                                </Link>

                                <Link
                                    href="/rotate-pdf"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Rotate PDF
                                </Link>

                                <Link
                                    href="/watermark-pdf"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Watermark PDF
                                </Link>
                            </div>
                        </div>

                        {/* Convert */}
                        <div className="group relative">
                            <button
                                className="
                flex items-center gap-2
                text-sm font-medium
                hover:text-indigo-400
                transition-colors
            "
                            >
                                Convert
                                <span className="text-xs">▼</span>
                            </button>

                            <div
                                className="
                invisible
                absolute
                left-0
                top-full
                mt-3
                w-60
                rounded-2xl
                border
                border-[color:var(--border)]
                bg-[var(--card)]
                p-2
                opacity-0
                shadow-2xl
                transition-all
                duration-200
                group-hover:visible
                group-hover:opacity-100
            "
                            >
                                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                                    Conversion
                                </p>

                                <Link
                                    href="/images-to-pdf"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    Images → PDF
                                </Link>

                                <Link
                                    href="/pdf-to-images"
                                    className="block rounded-lg px-3 py-2 hover:bg-white/5"
                                >
                                    PDF → Images
                                </Link>
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
                        <ThemeToggle/>
                    </div>
                </div>
            </div>
        </header>
    );
}