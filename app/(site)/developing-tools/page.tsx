import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, EyeOff, FlaskConical, ShieldCheck } from "lucide-react";

import {
    OCR_V2_DEVELOPMENT_TOOLS,
    type OcrV2DevelopmentSurface,
} from "@/lib/ocrV2DevelopmentTools";

export const metadata: Metadata = {
    title: "OCR V2 Developing Tools",
    description: "Temporary internal directory for the current OCR V2 development surfaces.",
    robots: {
        index: false,
        follow: false,
        googleBot: {
            index: false,
            follow: false,
        },
    },
    alternates: { canonical: null },
};

function SurfaceCard({ surface }: { surface: OcrV2DevelopmentSurface }) {
    const isHiddenDedicated = surface.discovery === "hidden-from-public-catalog";

    return (
        <Link
            href={surface.href}
            data-testid={`developing-tool-${surface.id}`}
            className="group flex h-full flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-5 shadow-sm transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
            <div>
                <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                        {surface.category}
                    </span>
                    {isHiddenDedicated ? (
                        <EyeOff size={16} aria-label="Hidden from public catalog" className="text-amber-600" />
                    ) : (
                        <ShieldCheck size={16} aria-label="Public route preserved" className="text-emerald-600" />
                    )}
                </div>
                <h2 className="mt-4 text-base font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)]">
                    {surface.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{surface.description}</p>
            </div>
            <div className="mt-5 border-t border-[var(--border-subtle)] pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {surface.classification}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{surface.notes}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
                    Open surface <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </span>
            </div>
        </Link>
    );
}

export default function DevelopingToolsPage() {
    const dedicated = OCR_V2_DEVELOPMENT_TOOLS.filter((surface) => surface.kind === "dedicated");
    const preserved = OCR_V2_DEVELOPMENT_TOOLS.filter((surface) => surface.kind !== "dedicated");

    return (
        <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8" data-testid="developing-tools-page">
            <section className="mx-auto max-w-3xl text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--accent)]">
                    <FlaskConical size={22} />
                </div>
                <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                    Temporary development directory
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
                    OCR V2 developing tools
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] sm:text-base">
                    These are the current OCR V2 work surfaces. Dedicated V2 entries are intentionally hidden from the normal public catalog while their direct routes remain available here.
                </p>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                    This page is not part of normal navigation, search, related tools, or the sitemap.
                </p>
            </section>

            <section className="mt-12" aria-labelledby="dedicated-ocr-v2-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 id="dedicated-ocr-v2-heading" className="text-xl font-semibold text-[var(--foreground)]">Dedicated OCR V2 surfaces</h2>
                        <p className="mt-1 text-sm text-[var(--muted)]">Migrated consumer-specific routes retained for development and validation.</p>
                    </div>
                    <span className="font-mono text-xs text-[var(--muted-foreground)]">{dedicated.length} surfaces</span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {dedicated.map((surface) => <SurfaceCard key={surface.id} surface={surface} />)}
                </div>
            </section>

            <section className="mt-12" aria-labelledby="preserved-ocr-v2-heading">
                <div>
                    <h2 id="preserved-ocr-v2-heading" className="text-xl font-semibold text-[var(--foreground)]">Shared and preserved product surfaces</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">These public routes remain discoverable and are listed here to make their OCR V2 or fallback status explicit.</p>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {preserved.map((surface) => <SurfaceCard key={surface.id} surface={surface} />)}
                </div>
            </section>
        </main>
    );
}

