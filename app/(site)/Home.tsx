"use client";

import Link from "next/link";
import {useEffect, useMemo, useState} from "react";
import {
    ArrowRight,
    ArrowUpRight,
    Check,
    CheckCircle2,
    Code,
    Cpu,
    ExternalLink,
    FileText,
    FolderKanban,
    Layers,
    Lock,
    Search,
    Shield,
    Sparkles,
    Terminal,
    Wand2,
    Zap,
} from "lucide-react";

import ToolCard from "@/components/ToolCard";
import { useTools } from "@/context/ToolContext";
import {useAuth} from "@/context/AuthContext";
import {fetchJson} from "@/lib/api";
import {fallbackHomeContent, HomeContent} from "@/lib/contentHome";

export default function Home() {
    const {
        isLoggedIn,
        isGuest,
        subscription,
        isLoading,
    } = useAuth();
    const { displayTools: toolsList } = useTools();

    const [search, setSearch] = useState("");
    const [content, setContent] = useState<HomeContent>(fallbackHomeContent);

    const isProUser =
        isLoggedIn && subscription?.tier === "pro";

    const isPlusUser =
        isLoggedIn && subscription?.tier === "plus";

    const isFreeUser =
        isLoggedIn &&
        (!subscription || subscription.tier === "free");

    useEffect(() => {
        fetchJson("/site-content/home")
            .then((data: any) => {
                if (data && typeof data === "object" && !("error" in data)) {
                    setContent((prev) => ({...prev, ...data}));
                }
            })
            .catch((err) => console.error("Error loading home settings:", err));
    }, []);

    const query = search.trim().toLowerCase();

    const filteredTools = useMemo(() => {
        if (!query) return toolsList;

        return toolsList.filter((tool) => {
            const title = (tool.title || "").toLowerCase();
            const description = (tool.description || "").toLowerCase();
            return title.includes(query) || description.includes(query);
        });
    }, [query, toolsList]);

    const organizeTools = filteredTools.filter((tool) => tool.category === "organize");
    const editTools = filteredTools.filter((tool) => tool.category === "edit");
    const convertTools = filteredTools.filter((tool) => tool.category === "convert");
    const createTools = filteredTools.filter((tool) => tool.category === "create");
    const securityTools = filteredTools.filter((tool) => tool.category === "security");
    const optimizeTools = filteredTools.filter((tool) => tool.category === "optimize");
    const studioTools = filteredTools.filter((tool) => tool.category === "studio");

    const toolGroups = [
        {
            title: content.categoryOrganizeTitle || "Organize",
            desc: content.categoryOrganizeDesc || "Split, merge, rotate, crop, and rearrange pages.",
            tools: organizeTools,
        },
        {
            title: content.categoryEditingTitle || "Edit",
            desc: content.categoryEditingDesc || "Edit content, annotate, sign, and add text.",
            tools: editTools,
        },
        {
            title: content.categoryConvertTitle || "Convert",
            desc: content.categoryConvertDesc || "Convert PDFs to other formats.",
            tools: convertTools,
        },
        {
            title: content.categoryCreateTitle || "Create",
            desc:
                content.categoryCreateDesc ||
                "Create PDFs from images, office files, web pages, code, and markdown.",
            tools: createTools,
        },
        {
            title: content.categorySecurityTitle || "Security",
            desc: content.categorySecurityDesc || "Protect, unlock, and redact files.",
            tools: securityTools,
        },
        {
            title: content.categoryOptimizeTitle || "Optimize",
            desc: content.categoryOptimizeDesc || "Compress, grayscale, and repair PDFs.",
            tools: optimizeTools,
        },
        {
            title: content.categoryStudioTitle || "Studio",
            desc: content.categoryStudioDesc || "Advanced all-in-one PDF workspace.",
            tools: studioTools,
        },
    ];

    const visibleGroups = toolGroups.filter((group) => group.tools.length > 0);

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-[var(--background)] text-[var(--foreground)] transition-colors">
            <main className="relative min-h-screen overflow-hidden pb-24">
                {/* Subtle Ambient Background */}
                <div className="pointer-events-none absolute inset-0 -z-10 select-none overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[32rem] w-[50rem] rounded-full bg-[var(--accent)]/5 blur-[160px]" />
                </div>

                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    {/* Hero Section */}
                    <section className="py-20 sm:py-28 flex flex-col items-center text-center">
                        {/* Status / Telemetry Badge */}
                        <div className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-card)] px-3.5 py-1 rounded-full mb-8 shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                            <span className="font-mono text-xs text-[var(--muted-foreground)] font-medium">
                                {!isLoading && isLoggedIn
                                    ? isProUser
                                        ? content.heroBadgePro || "PLATEN_CORE_v2.0 • PRO_ACTIVE"
                                        : isPlusUser
                                            ? content.heroBadgePlus || "PLATEN_CORE_v2.0 • PLUS_ACTIVE"
                                            : content.heroBadgeFree || "PLATEN_CORE_v2.0 • FREE_TIER"
                                    : content.heroBadgeGuest || "PLATEN_CORE_v2.0 • DOCUMENT_ENGINE"}
                            </span>
                        </div>

                        {/* Hero Headline */}
                        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--foreground)] max-w-4xl leading-[1.1]">
                            {!isLoading && isLoggedIn && content.heroWelcomeBack ? (
                                <>
                                    {content.heroWelcomeBack},{" "}
                                    <span className="text-[var(--accent-muted)]">
                                        {isProUser
                                            ? content.heroTitlePro || "Pro Workspace"
                                            : isPlusUser
                                                ? content.heroTitlePlus || "Plus Workspace"
                                                : content.heroTitleGuest || "Document Platform"}
                                    </span>
                                </>
                            ) : (
                                <>
                                    The modern document platform for{" "}
                                    <span className="text-[var(--accent-muted)]">everyone.</span>
                                </>
                            )}
                        </h1>

                        {/* Hero Subtitle */}
                        <p className="mt-6 text-base sm:text-lg text-[var(--muted)] max-w-2xl leading-relaxed">
                            {!isLoading && isLoggedIn ? (
                                isProUser || isPlusUser
                                    ? "High-capacity processing allowance for demanding document workflows and multi-page batch operations."
                                    : "Access baseline document utilities and local tools with 20 daily units. Upgrade for higher capacity."
                            ) : (
                                content.heroSubtitleGuest ||
                                "Edit, convert, organize, and secure your documents with professional-grade tools. Start for free today."
                            )}
                        </p>

                        {/* Hero Actions (Dynamic User-Tier CTAs) */}
                        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                            {/* Guest CTA */}
                            {(!isLoggedIn || isGuest) && (
                                <Link
                                    href="/register"
                                    className="w-full sm:w-auto bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-8 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm text-center"
                                >
                                    Start for Free
                                </Link>
                            )}

                            {/* Logged-in Free user CTA */}
                            {isLoggedIn && isFreeUser && (
                                <Link
                                    href="/subscribe"
                                    className="w-full sm:w-auto bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-8 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm text-center"
                                >
                                    Upgrade to Plus
                                </Link>
                            )}

                            {/* Logged-in Plus or Pro user CTA */}
                            {isLoggedIn && (isPlusUser || isProUser) && (
                                <Link
                                    href="/dashboard"
                                    className="w-full sm:w-auto bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] px-8 py-3 rounded-lg text-sm font-medium transition-colors shadow-sm text-center"
                                >
                                    Open Dashboard
                                </Link>
                            )}

                            {/* Secondary CTA for all users */}
                            <Link
                                href="/tools"
                                className="w-full sm:w-auto border border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--muted)] px-8 py-3 rounded-lg text-sm font-medium transition-colors text-center shadow-sm"
                            >
                                Explore all tools
                            </Link>
                        </div>

                        {/* Logged in User Usage / Access Banner */}
                        {!isLoading && isLoggedIn && (
                            <div className="mt-8 w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-3.5 text-xs text-[var(--muted)] flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-2">
                                    {isProUser || isPlusUser ? (
                                        <CheckCircle2 className="text-emerald-500" size={16} />
                                    ) : (
                                        <Zap className="text-[var(--accent)]" size={16} />
                                    )}
                                    <span>
                                        {isProUser || isPlusUser
                                            ? content.authBannerProAccess || "Capacity: High-allowance unit allocation for intensive processing"
                                            : content.authBannerFreeUsage || "Usage: 20 daily units • 8 per 3-hour window • 80 per month"}
                                    </span>
                                </div>
                                {isFreeUser && (
                                    <Link
                                        href="/subscribe"
                                        className="font-mono text-[var(--accent-muted)] hover:underline flex items-center gap-1 font-semibold"
                                    >
                                        {content.authBannerFreeAction || "Upgrade"} <ArrowUpRight size={12} />
                                    </Link>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Popular Workflows / "Engineered for Efficiency" */}
                    <section className="py-14 border-t border-[var(--border)]">
                        <div className="text-center mb-12">
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                                Engineered for Efficiency
                            </h2>
                            <p className="text-sm text-[var(--muted)] mt-2">
                                Powerful tools to manage your documents with ease.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* Card 1 */}
                            <Link
                                href="/merge-pdf"
                                className="group bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] transition-all flex flex-col justify-between shadow-sm"
                            >
                                <div>
                                    <div className="w-10 h-10 rounded-md bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)] transition-colors">
                                        <Layers className="text-[var(--accent)]" size={18} />
                                    </div>
                                    <h3 className="font-semibold text-base text-[var(--foreground)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                                        Merge PDF
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
                                        Combine multiple PDF files into a single document with lossless precision.
                                    </p>
                                </div>
                                <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-muted)] group-hover:text-[var(--foreground)] transition-colors">
                                    Open Module <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                                </div>
                            </Link>

                            {/* Card 2 */}
                            <Link
                                href="/edit-pdf"
                                className="group bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] transition-all flex flex-col justify-between shadow-sm"
                            >
                                <div>
                                    <div className="w-10 h-10 rounded-md bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)] transition-colors">
                                        <FileText className="text-[var(--accent)]" size={18} />
                                    </div>
                                    <h3 className="font-semibold text-base text-[var(--foreground)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                                        PDF Editor
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
                                        Edit text, signatures, annotations, and elements directly in your browser.
                                    </p>
                                </div>
                                <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-muted)] group-hover:text-[var(--foreground)] transition-colors">
                                    Open Module <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                                </div>
                            </Link>

                            {/* Card 3 */}
                            <Link
                                href="/pdf-to-word"
                                className="group bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] transition-all flex flex-col justify-between shadow-sm"
                            >
                                <div>
                                    <div className="w-10 h-10 rounded-md bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)] transition-colors">
                                        <Cpu className="text-[var(--accent)]" size={18} />
                                    </div>
                                    <h3 className="font-semibold text-base text-[var(--foreground)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                                        PDF to Word
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
                                        Transform PDF documents into formatted, editable Word (.docx) files.
                                    </p>
                                </div>
                                <div className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-muted)] group-hover:text-[var(--foreground)] transition-colors">
                                    Open Module <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                                </div>
                            </Link>
                        </div>
                    </section>

                    {/* Tool Matrix Scope / Category Navigation */}
                    <section className="py-14 border-t border-[var(--border)]">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                                    Tool Matrix Scope
                                </h2>
                                <p className="text-sm text-[var(--muted)] mt-1">
                                    Comprehensive suite of document utilities.
                                </p>
                            </div>
                            <Link
                                href="/tools"
                                className="text-xs font-mono text-[var(--accent-muted)] hover:text-[var(--foreground)] flex items-center gap-1.5 transition-colors self-start sm:self-auto font-semibold"
                            >
                                View all {toolsList.length} tools <ArrowRight size={13} />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Organize Category */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)]/30 transition-colors shadow-sm">
                                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-[var(--border-subtle)]">
                                    <FolderKanban size={16} className="text-[var(--accent)]" />
                                    <span className="font-semibold text-sm text-[var(--foreground)]">Organize</span>
                                </div>
                                <ul className="space-y-2 text-xs text-[var(--muted)]">
                                    <li><Link href="/rotate-pdf" className="hover:text-[var(--foreground)] transition-colors">Rotate PDF</Link></li>
                                    <li><Link href="/split-pdf" className="hover:text-[var(--foreground)] transition-colors">Split PDF</Link></li>
                                    <li><Link href="/crop-pdf" className="hover:text-[var(--foreground)] transition-colors">Crop PDF</Link></li>
                                    <li><Link href="/reorder-pages" className="hover:text-[var(--foreground)] transition-colors">Reorder Pages</Link></li>
                                </ul>
                            </div>

                            {/* Edit Category */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)]/30 transition-colors shadow-sm">
                                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-[var(--border-subtle)]">
                                    <FileText size={16} className="text-[var(--accent)]" />
                                    <span className="font-semibold text-sm text-[var(--foreground)]">Edit</span>
                                </div>
                                <ul className="space-y-2 text-xs text-[var(--muted)]">
                                    <li><Link href="/sign-pdf" className="hover:text-[var(--foreground)] transition-colors">Sign On PDF</Link></li>
                                    <li><Link href="/watermark-pdf" className="hover:text-[var(--foreground)] transition-colors">Watermark PDF</Link></li>
                                    <li><Link href="/add-text" className="hover:text-[var(--foreground)] transition-colors">Add Text</Link></li>
                                    <li><Link href="/highlight-pdf" className="hover:text-[var(--foreground)] transition-colors">Highlight PDF</Link></li>
                                </ul>
                            </div>

                            {/* Convert Category */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)]/30 transition-colors shadow-sm">
                                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-[var(--border-subtle)]">
                                    <Cpu size={16} className="text-[var(--accent)]" />
                                    <span className="font-semibold text-sm text-[var(--foreground)]">Convert</span>
                                </div>
                                <ul className="space-y-2 text-xs text-[var(--muted)]">
                                    <li><Link href="/pdf-to-markdown" className="hover:text-[var(--foreground)] transition-colors">PDF to Markdown</Link></li>
                                    <li><Link href="/pdf-to-images" className="hover:text-[var(--foreground)] transition-colors">PDF to Images</Link></li>
                                    <li><Link href="/pdf-to-excel" className="hover:text-[var(--foreground)] transition-colors">PDF to Excel</Link></li>
                                    <li><Link href="/markdown-to-pdf" className="hover:text-[var(--foreground)] transition-colors">Markdown to PDF</Link></li>
                                </ul>
                            </div>

                            {/* Security Category */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)]/30 transition-colors shadow-sm">
                                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-[var(--border-subtle)]">
                                    <Shield size={16} className="text-[var(--accent)]" />
                                    <span className="font-semibold text-sm text-[var(--foreground)]">Security</span>
                                </div>
                                <ul className="space-y-2 text-xs text-[var(--muted)]">
                                    <li><Link href="/lock-pdf" className="hover:text-[var(--foreground)] transition-colors">Protect PDF</Link></li>
                                    <li><Link href="/unlock-pdf" className="hover:text-[var(--foreground)] transition-colors">Unlock PDF</Link></li>
                                    <li><Link href="/redact-pdf" className="hover:text-[var(--foreground)] transition-colors">Secure Redaction</Link></li>
                                    <li><Link href="/repair-pdf" className="hover:text-[var(--foreground)] transition-colors">Repair PDF</Link></li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Advanced Ecosystem: PDF Studio & Repository Analyzer */}
                    <section className="py-16 border-t border-[var(--border)]">
                        <div className="text-center mb-12">
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                                Advanced Ecosystem
                            </h2>
                            <p className="text-sm text-[var(--muted)] mt-2">
                                Workspaces for complete document management and repository analysis.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Studio Card */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-xl p-7 hover:border-[var(--accent)]/40 transition-colors group flex flex-col justify-between shadow-sm">
                                <div>
                                    <div className="flex justify-between items-start mb-5">
                                        <div className="h-10 w-10 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center">
                                            <Wand2 className="text-[var(--accent)]" size={20} />
                                        </div>
                                        <span className="bg-[var(--surface-secondary)] text-[var(--muted)] border border-[var(--border)] font-mono text-[10px] uppercase px-2.5 py-1 rounded">
                                            WORKSPACE
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
                                        PDF Studio
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
                                        An advanced interactive environment for complete PDF editing, multi-layer annotation, and document manipulation.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="border-t border-[var(--border-subtle)] pt-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                                        &gt; init --env local_studio
                                    </div>
                                    <Link
                                        href="/studio-v2"
                                        className="inline-flex items-center gap-2 bg-[var(--surface-secondary)] text-[var(--foreground)] border border-[var(--border)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface-hover)] transition-colors"
                                    >
                                        Launch Studio <ExternalLink size={13} />
                                    </Link>
                                </div>
                            </div>

                            {/* Analyzer Card */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-xl p-7 hover:border-[var(--accent)]/40 transition-colors group flex flex-col justify-between shadow-sm">
                                <div>
                                    <div className="flex justify-between items-start mb-5">
                                        <div className="h-10 w-10 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center">
                                            <Code className="text-[var(--accent)]" size={20} />
                                        </div>
                                        <span className="bg-[var(--accent)] text-white font-mono text-[10px] uppercase px-2.5 py-1 rounded font-bold">
                                            NEW
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
                                        Repository Analyzer
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] leading-relaxed mb-6">
                                        Analyze software repositories and generate architectural diagrams, project documentation, and compile direct to PDF.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="border-t border-[var(--border-subtle)] pt-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                                        &gt; scan ./repo --architecture
                                    </div>
                                    <Link
                                        href="/repository-analyzer"
                                        className="inline-flex items-center gap-2 bg-[var(--surface-secondary)] text-[var(--foreground)] border border-[var(--border)] px-4 py-2 rounded-lg text-xs font-medium hover:bg-[var(--surface-hover)] transition-colors"
                                    >
                                        Analyze Repo <ExternalLink size={13} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Isolated Execution Environments / Security First */}
                    <section className="py-16 border-t border-[var(--border)]">
                        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
                            <div className="md:w-1/2 space-y-4">
                                <div className="inline-flex items-center gap-2">
                                    <Shield className="text-rose-500" size={16} />
                                    <span className="font-mono text-xs uppercase tracking-wider text-rose-500 font-semibold">
                                        Zero Trust Architecture
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                                    Isolated Execution Environments.
                                </h2>
                                <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                                    Files are processed in secure, isolated containers and automatically purged immediately after completion. Platen is engineered with privacy and security as core principles.
                                </p>
                                <div>
                                    <Link
                                        href="/security"
                                        className="text-xs font-mono text-[var(--foreground)] border-b border-[var(--foreground)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors pb-0.5"
                                    >
                                        Read Architecture Details →
                                    </Link>
                                </div>
                            </div>

                            {/* Terminal Mockup */}
                            <div className="md:w-1/2 w-full bg-[var(--terminal-bg)] text-[var(--terminal-foreground)] border border-[var(--terminal-border)] rounded-lg p-5 font-mono text-xs leading-relaxed shadow-inner">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--terminal-border)] text-[11px] text-[var(--muted-foreground)]">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                    <span className="ml-2">system.log</span>
                                </div>
                                <div className="space-y-1">
                                    <div>&gt; INIT secure_sandbox_environment</div>
                                    <div className="text-[var(--accent-muted)]">&gt; STATUS: <span className="text-[var(--terminal-foreground)]">SANDBOX_ENABLED</span></div>
                                    <div>&gt; ALLOCATE ephemeral_storage_volume</div>
                                    <div className="text-[var(--accent-muted)]">&gt; STATUS: <span className="text-[var(--terminal-foreground)]">EPHEMERAL_STORAGE_ACTIVE</span></div>
                                    <div>&gt; PROCESS document_payload</div>
                                    <div>&gt; PURGE memory_cache</div>
                                    <div className="text-rose-400">&gt; DESTRUCT data_blocks_complete</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Transparent Scaling / Free vs Pro */}
                    <section className="py-16 border-t border-[var(--border)]">
                        <div className="text-center mb-12">
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                                Built for everyone. Scaled for power users.
                            </h2>
                            <p className="text-sm text-[var(--muted)] mt-2">
                                Transparent computing tiers for your daily document workflows.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                            {/* Free */}
                            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-xl p-7 flex flex-col justify-between shadow-sm">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--foreground)] mb-1">
                                        Free Plan Included
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] mb-6">
                                        Access all 39+ PDF tools and Studio workspace with a daily processing allowance at zero cost.
                                    </p>
                                    <ul className="space-y-3 text-xs text-[var(--muted)] mb-8">
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--foreground)]" /> Access to all 39+ PDF tools & Studio
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--foreground)]" /> 20 processing units per day allowance
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--foreground)]" /> 8 units / 3-hour window • 80 units / month
                                        </li>
                                    </ul>
                                </div>
                                <Link
                                    href="/tools"
                                    className="block w-full text-center border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)] py-2.5 rounded-lg text-xs font-medium hover:bg-[var(--surface-hover)] transition-colors"
                                >
                                    {!isLoggedIn || isGuest ? "Start Free" : "Explore Baseline Tools"}
                                </Link>
                            </div>

                            {/* Pro */}
                            <div className="bg-[var(--surface-card)] border-2 border-[var(--accent)] rounded-xl p-7 relative flex flex-col justify-between shadow-lg">
                                <div className="absolute top-0 right-0 bg-[var(--accent)] text-white font-mono text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-lg rounded-tr-lg font-bold">
                                    HIGH CAPACITY
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-[var(--foreground)] mb-1 flex items-center gap-2">
                                        Pro High-Capacity <Zap size={15} className="text-[var(--accent)] fill-[var(--accent)]" />
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] mb-6">
                                        Maximum unit allowance for high-volume document workflows, multi-page batch conversions, and heavy OCR.
                                    </p>
                                    <ul className="space-y-3 text-xs text-[var(--muted)] mb-8">
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--accent)]" /> 400 processing units per day allowance
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--accent)]" /> 150 units / 3-hour window • 2,000 units / month
                                        </li>
                                        <li className="flex items-center gap-2.5">
                                            <Check size={14} className="text-[var(--accent)]" /> Extended page duplication batch limits
                                        </li>
                                    </ul>
                                </div>
                                <Link
                                    href={isProUser ? "/dashboard" : "/subscribe"}
                                    className="block w-full text-center bg-[var(--accent)] text-white py-2.5 rounded-lg text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
                                >
                                    {isProUser ? "Current Plan (Dashboard)" : "Upgrade Anytime"}
                                </Link>
                            </div>
                        </div>
                    </section>

                    {/* Tool Search & Categorized Tool Matrix */}
                    <section className="py-16 border-t border-[var(--border)]">
                        <div className="mx-auto max-w-xl text-center mb-10">
                            <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)] mb-3">
                                Search & Filter All Utilities
                            </h2>
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                                    size={16}
                                />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={content.searchPlaceholder || "Search tools (e.g. merge, word, sign)..."}
                                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 pl-10 pr-12 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] shadow-sm"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--muted-foreground)]">
                                    {filteredTools.length} tools
                                </div>
                            </div>
                        </div>

                        {filteredTools.length === 0 && (
                            <div className="mx-auto max-w-md rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-card)] p-10 text-center shadow-sm">
                                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                                    {content.searchEmptyTitle || "No tools found"}
                                </h3>
                                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                                    {content.searchEmptyDescription || "Try a different search query."}
                                </p>
                            </div>
                        )}

                        {visibleGroups.map((group) => (
                            <div key={group.title} className="mb-14">
                                <div className="mb-6">
                                    <h3 className="text-lg font-bold tracking-tight text-[var(--foreground)]">
                                        {group.title}
                                    </h3>
                                    <p className="text-xs text-[var(--muted)] mt-1">
                                        {group.desc}
                                    </p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                    {group.tools.map((tool, idx) => (
                                        <ToolCard
                                            key={tool.href || idx}
                                            title={tool.title || ""}
                                            description={tool.description || ""}
                                            href={tool.href || ""}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>
                </div>
            </main>
        </div>
    );
}
