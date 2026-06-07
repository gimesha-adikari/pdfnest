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
                        <Link href="/merge-pdf">Merge</Link>
                        <Link href="/split-pdf">Split</Link>
                        <Link href="/rotate-pdf">Rotate</Link>
                        <Link href="/images-to-pdf">Images → PDF</Link>
                        <Link href="/pdf-to-images">
                            PDF → Images
                        </Link>
                        <Link href="/delete-pages">Delete</Link>
                        <Link href="/about">About</Link>
                    </nav>

                    <div className="flex items-center gap-3">
                        <ThemeToggle/>
                    </div>
                </div>
            </div>
        </header>
    );
}