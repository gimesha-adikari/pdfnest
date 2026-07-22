"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import ToolSearch from "./ui/ToolSearch";
import {NAV_TOOLS} from "@/lib/toolsData";
import {ChevronDown, LogOut, ShieldAlert, Sparkles, Zap} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import {fetchJson} from "@/lib/api";

export default function Header() {
    const {subscription, isAuthenticated, logout, user} = useAuth();
    const pathname = usePathname();
    const [forceHide, setForceHide] = useState(false);
    const [toolsList, setToolsList] = useState<any[]>([]);

    useEffect(() => {
        fetchJson("/site-content/tools")
            .then((data: any) => {
                if (Array.isArray(data) && data.length > 0) {
                    setToolsList(data);
                } else {
                    setToolsList(NAV_TOOLS);
                }
            })
            .catch((err) => {
                console.error("Failed fetching header tools from database, falling back:", err);
                setToolsList(NAV_TOOLS);
            });
    }, []);

    const closeMenu = () => {
        setForceHide(true);
        setTimeout(() => setForceHide(false), 150);
    };

    const organizeTools = toolsList.filter((tool) => (tool.Category || tool.category) === "organize");
    const editTools = toolsList.filter((tool) => (tool.Category || tool.category) === "edit");
    const convertTools = toolsList.filter((tool) => (tool.Category || tool.category) === "convert");
    const createTools = toolsList.filter((tool) => (tool.Category || tool.category) === "create");
    const securityTools = toolsList.filter((tool) => (tool.Category || tool.category) === "security");
    const optimizeTools = toolsList.filter((tool) => (tool.Category || tool.category) === "optimize");
    const studioTools = toolsList.filter((tool) => (tool.Category || tool.category) === "studio");

    const isPro = subscription?.tier === "pro";

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
                            {/* Light theme */}
                            <Image
                                src="/platen-logo.svg"
                                alt="Platen"
                                fill
                                priority
                                className="object-contain p-1 dark:hidden"
                            />

                            {/* Dark theme */}
                            <Image
                                src="/platen-logo-dark.svg"
                                alt="Platen"
                                fill
                                priority
                                className="hidden object-contain p-1 dark:block"
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
                                PLATEN
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

                        <div className="static group/menu">
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
                                style={forceHide ? {display: "none"} : undefined}
                                className="
                                    invisible
                                    absolute
                                    left-6 right-6
                                    top-full
                                    mt-2
                                    mx-auto
                                    max-w-7xl
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

                                <div className="grid grid-cols-4 gap-8">
                                    {[
                                        {icon: "📄", title: "Organize", tools: organizeTools},
                                        {icon: "✏️", title: "Edit", tools: editTools},
                                        {icon: "🔄", title: "Convert", tools: convertTools},
                                        {icon: "➕", title: "Create", tools: createTools},
                                        {icon: "🔒", title: "Security", tools: securityTools},
                                        {icon: "⚡", title: "Optimize", tools: optimizeTools},
                                        {icon: "🛠️", title: "Studio", tools: studioTools},
                                    ].map((group) => (
                                        <div key={group.title}>
                                            <h4 className="mb-3 font-bold">
                                                {group.icon} {group.title}
                                            </h4>

                                            <div className="space-y-1">
                                                {group.tools.map((tool, idx) => (
                                                    <Link
                                                        key={tool.Href || tool.href || idx}
                                                        href={tool.Href || tool.href}
                                                        onClick={closeMenu}
                                                        className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-[color:var(--background)]"
                                                    >
                                                        <span>{tool.Title || tool.title}</span>

                                                        {(tool.IsNew || tool.isNew) && (
                                                            <span
                                                                className="rounded-md bg-indigo-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                                New
                            </span>
                                                        )}
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
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
                                        onClick={closeMenu}
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

                        <ToolSearch/>

                        {isAuthenticated && !isPro && (
                            <Link
                                href="/subscribe"
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-500/20 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10 transition shadow-sm"
                            >
                                <Sparkles size={12} className="animate-pulse"/>
                                Go Pro
                            </Link>
                        )}

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

                        {isAuthenticated && user?.role === "admin" && (
                            <Link
                                href="/admin"
                                className="
                                    rounded-xl
                                    px-3 py-2
                                    text-sm
                                    font-bold
                                    text-indigo-500
                                    bg-indigo-500/5
                                    border border-indigo-500/10
                                    hover:bg-indigo-500/10
                                    transition flex items-center gap-1.5
                                "
                            >
                                <ShieldAlert size={14}/>
                                Admin Panel
                            </Link>
                        )}
                    </nav>

                    <div className="flex items-center gap-4">
                        {isAuthenticated && subscription ? (
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/dashboard"
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm border transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer ${
                                        subscription.tier === "pro"
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
                                            : "bg-[color:var(--border)] text-[color:var(--muted-foreground)] border-transparent hover:bg-[color:var(--border)]/80"
                                    }`}
                                >
                                    <Zap size={14} className={subscription.tier === "pro" ? "animate-pulse" : ""}/>
                                    <span className="uppercase tracking-wider">
                                        {subscription.tier} <span className="hidden sm:inline">Account</span>
                                    </span>
                                </Link>
                                <button
                                    onClick={logout}
                                    className="p-2 rounded-xl text-[color:var(--muted-foreground)] hover:bg-[color:var(--border)]/50 hover:text-[color:var(--foreground)] transition-colors"
                                    title="Sign Out"
                                >
                                    <LogOut size={18}/>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Link href="/subscribe"
                                      className="text-xs font-bold text-indigo-500 hover:underline md:hidden">
                                    Upgrade
                                </Link>
                                {/* UPDATED TO INJECT CALLBACK URL HERE */}
                                <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                                      className="text-sm font-semibold hover:text-indigo-500 transition-colors">
                                    Sign In
                                </Link>
                            </div>
                        )}

                        <ThemeToggle/>
                    </div>
                </div>
            </div>
        </header>
    );
}