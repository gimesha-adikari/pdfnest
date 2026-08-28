"use client";

import {useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import ToolSearch from "./ui/ToolSearch";
import {useTools} from "@/context/ToolContext";
import {
    ChevronDown,
    Cpu,
    FileText,
    FolderKanban,
    LogOut,
    Shield,
    ShieldAlert,
    Wand2,
    Zap,
} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import Logo from "@/components/ui/Logo";

export default function Header() {
    const {
        subscription,
        isLoggedIn,
        isGuest,
        logout,
        user,
    } = useAuth();

    const {displayTools: toolsList} = useTools();
    const pathname = usePathname();
    const [forceHide, setForceHide] = useState(false);

    const closeMenu = () => {
        setForceHide(true);
        setTimeout(() => setForceHide(false), 150);
    };

    const organizeTools = toolsList.filter(
        (tool) => tool.category === "organize" && !!tool.href
    );

    const editTools = toolsList.filter(
        (tool) => tool.category === "edit" && !!tool.href
    );

    const convertTools = toolsList.filter(
        (tool) => tool.category === "convert" && !!tool.href
    );

    const createTools = toolsList.filter(
        (tool) => tool.category === "create" && !!tool.href
    );

    const securityTools = toolsList.filter(
        (tool) => tool.category === "security" && !!tool.href
    );

    const optimizeTools = toolsList.filter(
        (tool) => tool.category === "optimize" && !!tool.href
    );

    const studioTools = toolsList.filter(
        (tool) => tool.category === "studio" && !!tool.href
    );

    const isPro = subscription?.tier === "pro";

    return (
        <header
            className="sticky top-0 z-50 w-full border-b border-[var(--header-border)] bg-[var(--header-bg)]/90 backdrop-blur-md transition-colors"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">

                    {/* =====================================================
                        BRAND
                    ====================================================== */}
                    <Link
                        href="/"
                        className="group flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                        <div
                            className="
                                relative
                                flex
                                h-10
                                w-10
                                shrink-0
                                items-center
                                justify-center
                                rounded-[10px]
                                border
                                border-[var(--border)]
                                bg-[var(--surface-secondary)]
                                transition-all
                                duration-200
                                group-hover:border-[var(--accent)]/50
                                group-hover:bg-[var(--surface-hover)]
                            "
                        >
                            <div className="relative h-10 w-10 shrink-0">
                                <Logo />
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col">
                            <span
                                className="
                                    text-sm
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
                                    text-[9px]
                                    font-mono
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

                    {/* =====================================================
                        PRIMARY NAVIGATION
                    ====================================================== */}
                    <nav className="hidden items-center gap-1.5 md:flex">

                        {/* Home */}
                        <Link
                            href="/"
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                pathname === "/"
                                    ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]"
                                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            }`}
                        >
                            Home
                        </Link>

                        {/* =================================================
                            TOOLS MEGA MENU
                        ================================================== */}
                        <div className="group/menu relative">
                            <button
                                type="button"
                                className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    pathname.startsWith("/tools")
                                        ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]"
                                        : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                                }`}
                            >
                                <span>Tools</span>

                                <ChevronDown
                                    size={12}
                                    className="text-[var(--muted-foreground)] transition-transform duration-200 group-hover/menu:rotate-180"
                                />
                            </button>

                            {/* Mega Menu */}
                            <div
                                style={forceHide ? {display: "none"} : undefined}
                                className="
                                    invisible
                                    absolute
                                    left-1/2
                                    top-full
                                    z-50
                                    mt-2
                                    w-[820px]
                                    -translate-x-1/2
                                    rounded-xl
                                    border
                                    border-[var(--border)]
                                    bg-[var(--surface-elevated)]
                                    p-6
                                    opacity-0
                                    shadow-2xl
                                    transition-all
                                    duration-200
                                    group-hover/menu:visible
                                    group-hover/menu:opacity-100
                                "
                            >
                                <div
                                    className="
                                        mb-4
                                        flex
                                        items-center
                                        justify-between
                                        border-b
                                        border-[var(--border-subtle)]
                                        pb-3
                                    "
                                >
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="h-2 w-2 rounded-full bg-[var(--accent)]"
                                        />

                                        <h3
                                            className="
                                                font-mono
                                                text-xs
                                                font-semibold
                                                uppercase
                                                tracking-wider
                                                text-[var(--foreground)]
                                            "
                                        >
                                            Tool Matrix Scope
                                        </h3>

                                        <span
                                            className="text-[11px] text-[var(--muted-foreground)]"
                                        >
                                            — Precision utilities & workspaces
                                        </span>
                                    </div>

                                    <Link
                                        href="/tools"
                                        onClick={closeMenu}
                                        className="
                                            flex
                                            items-center
                                            gap-1
                                            font-mono
                                            text-xs
                                            font-semibold
                                            text-[var(--accent-muted)]
                                            transition-colors
                                            hover:text-[var(--accent)]
                                        "
                                    >
                                        View all {toolsList.length} tools →
                                    </Link>
                                </div>

                                <div className="grid grid-cols-4 gap-5">

                                    {/* ================================
                                        ORGANIZE
                                    ================================= */}
                                    <div className="space-y-2">
                                        <div
                                            className="
                                                flex
                                                items-center
                                                gap-1.5
                                                border-b
                                                border-[var(--border-subtle)]
                                                pb-1.5
                                                font-mono
                                                text-[11px]
                                                uppercase
                                                tracking-wider
                                                text-[var(--muted-foreground)]
                                            "
                                        >
                                            <FolderKanban
                                                size={13}
                                                className="text-[var(--accent)]"
                                            />

                                            <span>Organize</span>
                                        </div>

                                        <div className="space-y-0.5">
                                            {organizeTools
                                                .slice(0, 5)
                                                .map((tool, idx) => (
                                                    <Link
                                                        key={tool.href || idx}
                                                        href={tool.href}
                                                        onClick={closeMenu}
                                                        className="
                                                            flex
                                                            items-center
                                                            justify-between
                                                            rounded
                                                            px-2
                                                            py-1
                                                            text-xs
                                                            text-[var(--muted)]
                                                            transition-colors
                                                            hover:bg-[var(--surface-hover)]
                                                            hover:text-[var(--foreground)]
                                                        "
                                                    >
                                                        <span className="truncate">
                                                            {tool.title}
                                                        </span>
                                                    </Link>
                                                ))}
                                        </div>
                                    </div>

                                    {/* ================================
                                        EDIT
                                    ================================= */}
                                    <div className="space-y-2">
                                        <div
                                            className="
                                                flex
                                                items-center
                                                gap-1.5
                                                border-b
                                                border-[var(--border-subtle)]
                                                pb-1.5
                                                font-mono
                                                text-[11px]
                                                uppercase
                                                tracking-wider
                                                text-[var(--muted-foreground)]
                                            "
                                        >
                                            <FileText
                                                size={13}
                                                className="text-[var(--accent)]"
                                            />

                                            <span>Edit</span>
                                        </div>

                                        <div className="space-y-0.5">
                                            {editTools
                                                .slice(0, 5)
                                                .map((tool, idx) => (
                                                    <Link
                                                        key={tool.href || idx}
                                                        href={tool.href}
                                                        onClick={closeMenu}
                                                        className="
                                                            flex
                                                            items-center
                                                            justify-between
                                                            rounded
                                                            px-2
                                                            py-1
                                                            text-xs
                                                            text-[var(--muted)]
                                                            transition-colors
                                                            hover:bg-[var(--surface-hover)]
                                                            hover:text-[var(--foreground)]
                                                        "
                                                    >
                                                        <span className="truncate">
                                                            {tool.title}
                                                        </span>

                                                        {tool.isNew && (
                                                            <span
                                                                className="
                                                                    rounded
                                                                    bg-[var(--accent)]
                                                                    px-1
                                                                    py-0.5
                                                                    font-mono
                                                                    text-[8px]
                                                                    font-bold
                                                                    uppercase
                                                                    text-white
                                                                "
                                                            >
                                                                NEW
                                                            </span>
                                                        )}
                                                    </Link>
                                                ))}
                                        </div>
                                    </div>

                                    {/* ================================
                                        CONVERT
                                    ================================= */}
                                    <div className="space-y-2">
                                        <div
                                            className="
                                                flex
                                                items-center
                                                gap-1.5
                                                border-b
                                                border-[var(--border-subtle)]
                                                pb-1.5
                                                font-mono
                                                text-[11px]
                                                uppercase
                                                tracking-wider
                                                text-[var(--muted-foreground)]
                                            "
                                        >
                                            <Cpu
                                                size={13}
                                                className="text-[var(--accent)]"
                                            />

                                            <span>Convert</span>
                                        </div>

                                        <div className="space-y-0.5">
                                            {convertTools
                                                .slice(0, 5)
                                                .map((tool, idx) => (
                                                    <Link
                                                        key={tool.href || idx}
                                                        href={tool.href}
                                                        onClick={closeMenu}
                                                        className="
                                                            flex
                                                            items-center
                                                            justify-between
                                                            rounded
                                                            px-2
                                                            py-1
                                                            text-xs
                                                            text-[var(--muted)]
                                                            transition-colors
                                                            hover:bg-[var(--surface-hover)]
                                                            hover:text-[var(--foreground)]
                                                        "
                                                    >
                                                        <span className="truncate">
                                                            {tool.title}
                                                        </span>
                                                    </Link>
                                                ))}
                                        </div>
                                    </div>

                                    {/* ================================
                                        SECURITY + ECOSYSTEM
                                    ================================= */}
                                    <div className="space-y-4">

                                        <div className="space-y-2">
                                            <div
                                                className="
                                                    flex
                                                    items-center
                                                    gap-1.5
                                                    border-b
                                                    border-[var(--border-subtle)]
                                                    pb-1.5
                                                    font-mono
                                                    text-[11px]
                                                    uppercase
                                                    tracking-wider
                                                    text-[var(--muted-foreground)]
                                                "
                                            >
                                                <Shield
                                                    size={13}
                                                    className="text-[var(--accent)]"
                                                />

                                                <span>Security</span>
                                            </div>

                                            <div className="space-y-0.5">
                                                {securityTools
                                                    .slice(0, 3)
                                                    .map((tool, idx) => (
                                                        <Link
                                                            key={tool.href || idx}
                                                            href={tool.href}
                                                            onClick={closeMenu}
                                                            className="
                                                                flex
                                                                items-center
                                                                justify-between
                                                                rounded
                                                                px-2
                                                                py-1
                                                                text-xs
                                                                text-[var(--muted)]
                                                                transition-colors
                                                                hover:bg-[var(--surface-hover)]
                                                                hover:text-[var(--foreground)]
                                                            "
                                                        >
                                                            <span className="truncate">
                                                                {tool.title}
                                                            </span>
                                                        </Link>
                                                    ))}
                                            </div>
                                        </div>

                                        {/* Ecosystem */}
                                        <div
                                            className="
                                                space-y-1.5
                                                rounded-lg
                                                border
                                                border-[var(--border)]
                                                bg-[var(--surface-secondary)]
                                                p-2.5
                                            "
                                        >
                                            <div
                                                className="
                                                    flex
                                                    items-center
                                                    gap-1
                                                    font-mono
                                                    text-[10px]
                                                    font-semibold
                                                    uppercase
                                                    tracking-wider
                                                    text-[var(--muted-foreground)]
                                                "
                                            >
                                                <Wand2
                                                    size={11}
                                                    className="text-[var(--accent)]"
                                                />

                                                Ecosystem
                                            </div>

                                            <Link
                                                href="/studio-v2"
                                                onClick={closeMenu}
                                                className="
                                                    block
                                                    text-xs
                                                    font-semibold
                                                    text-[var(--foreground)]
                                                    transition-colors
                                                    hover:text-[var(--accent)]
                                                "
                                            >
                                                PDF Studio →
                                            </Link>

                                            {isLoggedIn && (
                                                <Link
                                                    href="/dashboard/studio-sessions"
                                                    onClick={closeMenu}
                                                    className="block text-xs font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--accent)]"
                                                >
                                                    Saved Studio Sessions →
                                                </Link>
                                            )}

                                            <Link
                                                href="/repository-analyzer"
                                                onClick={closeMenu}
                                                className="
                                                    block
                                                    text-xs
                                                    font-semibold
                                                    text-[var(--foreground)]
                                                    transition-colors
                                                    hover:text-[var(--accent)]
                                                "
                                            >
                                                Repository Analyzer →
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Pricing */}
                        <Link
                            href="/pricing"
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                pathname === "/pricing"
                                    ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]"
                                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            }`}
                        >
                            Pricing
                        </Link>

                        {/* About */}
                        <Link
                            href="/about"
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                pathname === "/about"
                                    ? "bg-[var(--surface-hover)] font-semibold text-[var(--foreground)]"
                                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                            }`}
                        >
                            About
                        </Link>

                        {/* Search */}
                        <ToolSearch />

                        {/* Admin */}
                        {isLoggedIn && user?.role === "admin" && (
                            <Link
                                href="/admin"
                                className="
                                    flex
                                    items-center
                                    gap-1
                                    rounded-md
                                    border
                                    border-[var(--accent)]/30
                                    bg-[var(--accent-subtle)]
                                    px-2.5
                                    py-1
                                    font-mono
                                    text-xs
                                    text-[var(--accent-muted)]
                                    transition-colors
                                    hover:bg-[var(--accent)]/20
                                "
                            >
                                <ShieldAlert size={12}/>
                                Admin
                            </Link>
                        )}
                    </nav>

                    {/* =====================================================
                        SECONDARY ACTIONS
                    ====================================================== */}
                    <div className="flex shrink-0 items-center gap-2.5">

                        {isLoggedIn && subscription ? (
                            <div className="flex items-center gap-2">

                                <Link
                                    href="/dashboard"
                                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-all ${
                                        subscription.tier === "pro"
                                            ? "border-[var(--accent)]/40 bg-[var(--accent-subtle)] text-[var(--accent-muted)] hover:bg-[var(--accent)]/25"
                                            : "border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--foreground)]"
                                    }`}
                                >
                                    <Zap
                                        size={12}
                                        className={
                                            subscription.tier === "pro"
                                                ? "animate-pulse text-[var(--accent)]"
                                                : "text-[var(--muted-foreground)]"
                                        }
                                    />

                                    <span className="font-semibold uppercase tracking-wider">
                                        {subscription.tier}
                                    </span>
                                </Link>

                                <button
                                    type="button"
                                    onClick={logout}
                                    className="
                                        rounded-md
                                        p-1.5
                                        text-[var(--muted-foreground)]
                                        transition-colors
                                        hover:bg-[var(--surface-hover)]
                                        hover:text-[var(--foreground)]
                                    "
                                    title="Sign Out"
                                >
                                    <LogOut size={15}/>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">

                                <Link
                                    href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                                    className="
                                        hidden
                                        rounded-md
                                        px-2.5
                                        py-1.5
                                        text-xs
                                        font-medium
                                        text-[var(--muted)]
                                        transition-colors
                                        hover:bg-[var(--surface-hover)]
                                        hover:text-[var(--foreground)]
                                        sm:block
                                    "
                                >
                                    Sign In
                                </Link>

                                {isGuest && (
                                    <Link
                                        href={`/register?callbackUrl=${encodeURIComponent(pathname)}`}
                                        className="
                                            rounded-lg
                                            bg-[var(--accent)]
                                            px-3.5
                                            py-1.5
                                            text-xs
                                            font-medium
                                            text-white
                                            shadow-sm
                                            transition-colors
                                            hover:bg-[var(--accent-hover)]
                                        "
                                    >
                                        Create Account
                                    </Link>
                                )}
                            </div>
                        )}

                        <ThemeToggle/>
                    </div>
                </div>
            </div>
        </header>
    );
}
