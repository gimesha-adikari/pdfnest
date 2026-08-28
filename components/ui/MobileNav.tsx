"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import {
    X,
    FileText,
    Home,
    Info,
    PenTool,
    RefreshCw,
    Shield,
    Search,
    Menu,
    Zap,
    Sparkles,
    FolderKanban,
} from "lucide-react";

import { MobileLink, ToolGroup } from "@/components/MobileComponents";
import CommandSystem from "@/components/CommandSystem";

export default function MobileNav() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);

    const startX = useRef(0);
    const currentX = useRef(0);

    const openSidebar = () => {
        setMounted(true);
        requestAnimationFrame(() => {
            setOpen(true);
        });
    };

    const closeSidebar = () => {
        setOpen(false);
        setTimeout(() => {
            setMounted(false);
        }, 300);
    };

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeSidebar();
            }
        };

        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        };
    }, [open]);

    const handleTouchStart = (e: TouchEvent<HTMLElement> | any) => {
        startX.current = e.changedTouches[0].clientX;
        currentX.current = startX.current;
    };

    const handleTouchMove = (e: TouchEvent<HTMLElement> | any) => {
        currentX.current = e.changedTouches[0].clientX;
    };

    const handleTouchEnd = () => {
        const distance = currentX.current - startX.current;
        const screenWidth = window.innerWidth;
        const startFromLeft = startX.current < 40;
        const startFromRight = startX.current > screenWidth - 40;

        if (!open && ((startFromLeft && distance > 80) || (startFromRight && distance < -80))) {
            openSidebar();
            return;
        }

        if (open && distance > 80) {
            closeSidebar();
        }
    };

    return (
        <>
            <CommandSystem
                externalOpen={commandOpen}
                onClose={() => setCommandOpen(false)}
            />

            <div
                className="md:hidden fixed inset-y-0 left-0 w-6 z-40"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />

            <div
                className="md:hidden fixed inset-y-0 right-0 w-6 z-40"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />

            {/* Bottom Nav Bar */}
            <div
                className="
          md:hidden fixed bottom-4 left-4 right-4 z-50
          flex items-center justify-around
          rounded-xl border
          border-[var(--border)]
          bg-[var(--surface-elevated)]/90
          px-3 py-2
          shadow-xl
          backdrop-blur-md
        "
            >
                <Link
                    href="/"
                    className="flex flex-col items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] transition-colors active:scale-95 hover:text-[var(--foreground)]"
                >
                    <Home size={18} />
                    <span>Home</span>
                </Link>

                <button
                    onClick={() => setCommandOpen(true)}
                    className="flex flex-col items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] transition-colors active:scale-95 hover:text-[var(--foreground)]"
                >
                    <Search size={18} />
                    <span>Search</span>
                </button>

                <Link
                    href="/tools"
                    className="flex flex-col items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] transition-colors active:scale-95 hover:text-[var(--foreground)]"
                >
                    <FileText size={18} />
                    <span>Tools</span>
                </Link>

                <button
                    onClick={openSidebar}
                    className="flex flex-col items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] transition-colors active:scale-95 hover:text-[var(--foreground)]"
                >
                    <Menu size={18} />
                    <span>Menu</span>
                </button>
            </div>

            {/* Sidebar Slide-Out Drawer */}
            {mounted && (
                <div
                    className={`
            fixed inset-0 z-[300]
            bg-black/60
            backdrop-blur-sm
            transition-opacity duration-300
            ${open ? "opacity-100" : "opacity-0"}
          `}
                    onClick={closeSidebar}
                >
                    <aside
                        className={`
              absolute right-0 top-0 h-full w-[85%] max-w-sm
              border-l border-[var(--border)]
              bg-[var(--surface-elevated)]
              p-6
              shadow-2xl
              overflow-y-auto
              transition-transform duration-300 ease-out
              ${open ? "translate-x-0" : "translate-x-full"}
            `}
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                            <div>
                                <h2 className="text-base font-bold tracking-tight text-[var(--foreground)]">
                                    PLATEN
                                </h2>
                                <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase">
                                    CORE v2.0
                                </p>
                            </div>

                            <button
                                onClick={closeSidebar}
                                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-1.5 text-[var(--muted)] transition active:scale-95 hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-5 space-y-1">
                            <MobileLink href="/" icon={<Home size={16} />} text="Home" close={closeSidebar} />
                            <MobileLink
                                href="/tools"
                                icon={<FileText size={16} />}
                                text="Tools Directory"
                                close={closeSidebar}
                            />
                            <MobileLink href="/studio-v2" icon={<Sparkles size={16} />} text="PDF Studio" close={closeSidebar} />
                            <MobileLink href="/dashboard/studio-sessions" icon={<FolderKanban size={16} />} text="Studio Sessions" close={closeSidebar} />
                            <MobileLink href="/pricing" icon={<Zap size={16} />} text="Pricing" close={closeSidebar} />
                            <MobileLink href="/about" icon={<Info size={16} />} text="About" close={closeSidebar} />
                        </div>

                        <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
                            <ToolGroup title="Organize" icon={<RefreshCw size={14} />} category="organize" close={closeSidebar} />
                            <ToolGroup title="Edit" icon={<PenTool size={14} />} category="edit" close={closeSidebar} />
                            <ToolGroup title="Convert" icon={<RefreshCw size={14} />} category="convert" close={closeSidebar} />
                            <ToolGroup title="Create" icon={<FileText size={14} />} category="create" close={closeSidebar} />
                            <ToolGroup title="Security" icon={<Shield size={14} />} category="security" close={closeSidebar} />
                            <ToolGroup title="Optimize" icon={<Zap size={14} />} category="optimize" close={closeSidebar} />
                            <ToolGroup title="Studio" icon={<Sparkles size={14} />} category="studio" close={closeSidebar} />
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}
