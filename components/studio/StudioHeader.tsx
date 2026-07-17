"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    ChevronDown,
    Download,
    FilePlus2,
    LayoutPanelLeft,
    LogOut,
    Redo2,
    ShieldAlert,
    Sparkles,
    Undo2,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import HeaderDropdown from "@/components/studio/ui/HeaderDropdown";

type StudioHeaderProps = {
    documentName?: string;
    onOpenPdf?: () => void;
    onSave?: () => void;
    onExport?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onToggleSidebar?: () => void;
    sidebarOpen?: boolean;
};

function MenuItem({
                      onClick,
                      icon,
                      children,
                  }: {
    onClick?: () => void;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-[color:var(--background)]"
        >
            {icon}
            <span>{children}</span>
        </button>
    );
}

export default function StudioHeader({
                                         documentName,
                                         onOpenPdf,
                                         onSave,
                                         onExport,
                                         onUndo,
                                         onRedo,
                                         onZoomIn,
                                         onZoomOut,
                                         onToggleSidebar,
                                         sidebarOpen,
                                     }: StudioHeaderProps) {
    const pathname = usePathname();
    const { subscription, isAuthenticated, logout, user } = useAuth();
    const isPro = subscription?.tier === "pro";

    return (
        <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[var(--background)]/90 backdrop-blur-xl">
            <div className="w-full px-3 sm:px-4 lg:px-6">
                <div className="flex h-16 items-center justify-between gap-3">
                    <Link href="/" className="flex items-center gap-2 rounded-xl p-1">
                        <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/10 dark:bg-indigo-500/20">
                            <Image
                                src="/pdfnest-logo.svg"
                                alt="PDFNest"
                                fill
                                className="object-contain p-1"
                                priority
                            />
                        </div>

                        <div className="leading-tight">
                            <span className="block bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-md font-black tracking-tight text-transparent">
                                PDFNest Studio
                            </span>
                            <span className="block -mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted)]">
                                {documentName || "No document loaded"}
                            </span>
                        </div>
                    </Link>

                    <div className="hidden md:flex items-center gap-2">
                        <HeaderDropdown title="File">
                            <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[color:var(--border)]/30">
                                File <ChevronDown size={14} className="inline-block align-middle transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                                <MenuItem icon={<FilePlus2 size={14} />} onClick={onOpenPdf}>Open PDF</MenuItem>
                                <MenuItem icon={<Download size={14} />} onClick={onExport}>Export</MenuItem>
                                <MenuItem icon={<Sparkles size={14} />} onClick={onSave}>Save</MenuItem>
                                <div className="my-2 h-px bg-[color:var(--border)]" />
                                <MenuItem icon={<LayoutPanelLeft size={14} />} onClick={onToggleSidebar}>
                                    {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                                </MenuItem>

                                <MenuItem
                                    icon={<Download size={14} />}
                                    onClick={onExport}
                                >
                                    Export
                                </MenuItem>
                            </div>
                        </HeaderDropdown>

                        <HeaderDropdown title="Edit">
                            <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[color:var(--border)]/30">
                                Edit <ChevronDown size={14} className="inline-block align-middle transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                                <MenuItem icon={<Undo2 size={14} />} onClick={onUndo}>Undo</MenuItem>
                                <MenuItem icon={<Redo2 size={14} />} onClick={onRedo}>Redo</MenuItem>
                            </div>
                        </HeaderDropdown>

                        <HeaderDropdown title="View">
                            <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[color:var(--border)]/30">
                                View <ChevronDown size={14} className="inline-block align-middle transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                                <MenuItem icon={<ZoomOut size={14} />} onClick={onZoomOut}>Zoom out</MenuItem>
                                <MenuItem icon={<ZoomIn size={14} />} onClick={onZoomIn}>Zoom in</MenuItem>
                                <MenuItem icon={<LayoutPanelLeft size={14} />} onClick={onToggleSidebar}>
                                    {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                                </MenuItem>
                            </div>
                        </HeaderDropdown>

                        <HeaderDropdown title="Help">
                            <summary className="list-none cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[color:var(--border)]/30">
                                Help <ChevronDown size={14} className="inline-block align-middle transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 shadow-2xl">
                                <Link href="/about" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--background)]">
                                    About PDFNest Studio
                                </Link>
                                <Link href="/tools" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--background)]">
                                    Browse tools
                                </Link>
                                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-[color:var(--background)]">
                                    Keyboard shortcuts
                                </button>
                            </div>
                        </HeaderDropdown>
                    </div>

                    <div className="flex items-center gap-2">
                        {isAuthenticated && !isPro && (
                            <Link
                                href="/subscribe"
                                className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs font-bold text-amber-500 hover:bg-amber-500/10 transition"
                            >
                                <Sparkles size={12} className="animate-pulse" />
                                Go Pro
                            </Link>
                        )}

                        {isAuthenticated && user?.role === "admin" && (
                            <Link
                                href="/admin"
                                className="hidden md:inline-flex items-center gap-1 rounded-xl border border-indigo-500/10 bg-indigo-500/5 px-3 py-1.5 text-xs font-bold text-indigo-500 hover:bg-indigo-500/10 transition"
                            >
                                <ShieldAlert size={12} />
                                Admin
                            </Link>
                        )}

                        {isAuthenticated ? (
                            <>
                                <Link
                                    href="/dashboard"
                                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-bold hover:bg-[var(--card)] transition"
                                >
                                    Dashboard
                                </Link>
                                <button
                                    onClick={logout}
                                    className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-bold hover:bg-[var(--card)] transition"
                                    title="Sign out"
                                >
                                    <LogOut size={14} />
                                </button>
                            </>
                        ) : (
                            <Link
                                href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                                className="rounded-xl border border-[color:var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-bold hover:bg-[var(--card)] transition"
                            >
                                Sign in
                            </Link>
                        )}

                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </header>
    );
}