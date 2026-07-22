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
} from "lucide-react";

import { MobileLink, ToolGroup } from "@/components/MobileComponents";
import CommandSystem from "@/components/CommandSystem";
import { NAV_TOOLS } from "@/lib/toolsData";
import { fetchJson } from "@/lib/api";

export default function MobileNav() {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [toolsList, setToolsList] = useState<any[]>([]);

    const startX = useRef(0);
    const currentX = useRef(0);

    useEffect(() => {
        // Fetch tools layout custom configurations from backend
        fetchJson("/site-content/tools")
            .then((data: any) => {
                if (Array.isArray(data) && data.length > 0) {
                    setToolsList(data);
                } else {
                    setToolsList(NAV_TOOLS);
                }
            })
            .catch((err) => {
                console.error("Failed fetching mobile sidebar tools from database, falling back:", err);
                setToolsList(NAV_TOOLS);
            });
    }, []);

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
          rounded-2xl border
          border-[color:var(--border)]
          bg-[var(--card)]
          px-2 py-2.5
          shadow-xl shadow-black/5
          backdrop-blur-xl
        "
            >
                <Link
                    href="/"
                    className="flex flex-col items-center gap-1 text-[10px] font-bold text-[color:var(--muted-foreground)] transition-colors active:scale-90 hover:text-[color:var(--primary)]"
                >
                    <Home size={20} />
                    <div>Home</div>
                </Link>

                <button
                    onClick={() => setCommandOpen(true)}
                    className="flex flex-col items-center gap-1 text-[10px] font-bold text-[color:var(--muted-foreground)] transition-colors active:scale-90 hover:text-[color:var(--primary)]"
                >
                    <Search size={20} />
                    <div>Search</div>
                </button>

                <Link
                    href="/tools"
                    className="flex flex-col items-center gap-1 text-[10px] font-bold text-[color:var(--muted-foreground)] transition-colors active:scale-90 hover:text-[color:var(--primary)]"
                >
                    <FileText size={20} />
                    <div>Tools</div>
                </Link>

                <button
                    onClick={openSidebar}
                    className="flex flex-col items-center gap-1 text-[10px] font-bold text-[color:var(--muted-foreground)] transition-colors active:scale-90 hover:text-[color:var(--primary)]"
                >
                    <Menu size={20} />
                    <div>Menu</div>
                </button>
            </div>

            {/* Sidebar Slide-Out Drawer */}
            {mounted && (
                <div
                    className={`
            fixed inset-0 z-[300]
            bg-black/40
            backdrop-blur-sm
            transition-opacity duration-300
            ${open ? "opacity-100" : "opacity-0"}
          `}
                    onClick={closeSidebar}
                >
                    <aside
                        className={`
              absolute right-0 top-0 h-full w-[85%] max-w-sm
              border-l border-[color:var(--border)]
              bg-[var(--card)]
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
                        <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-5">
                            <div>
                                <h2 className="text-xl font-black bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
                                    Platen PDF
                                </h2>
                                <p className="text-xs font-medium text-[color:var(--muted-foreground)]">
                                    Free PDF Tools
                                </p>
                            </div>

                            <button
                                onClick={closeSidebar}
                                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-2 text-[color:var(--muted-foreground)] transition active:scale-95 hover:text-[color:var(--foreground)]"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mt-6 space-y-1">
                            <MobileLink href="/" icon={<Home size={18} />} text="Home" close={closeSidebar} />
                            <MobileLink
                                href="/tools"
                                icon={<FileText size={18} />}
                                text="All Tools"
                                close={closeSidebar}
                            />
                            <MobileLink href="/about" icon={<Info size={18} />} text="About" close={closeSidebar} />
                        </div>

                        <div className="mt-4 space-y-4 border-t border-[color:var(--border)] pt-4">
                            <ToolGroup title="Organize" icon={<RefreshCw size={16} />} category="organize" close={closeSidebar} />
                            <ToolGroup title="Edit" icon={<PenTool size={16} />} category="edit" close={closeSidebar} />
                            <ToolGroup title="Convert" icon={<RefreshCw size={16} />} category="convert" close={closeSidebar} />
                            <ToolGroup title="Create" icon={<FileText size={16} />} category="create" close={closeSidebar} />
                            <ToolGroup title="Security" icon={<Shield size={16} />} category="security" close={closeSidebar} />
                            <ToolGroup title="Optimize" icon={<Zap size={16} />} category="optimize" close={closeSidebar} />
                            <ToolGroup title="Studio" icon={<Sparkles size={16} />} category="studio" close={closeSidebar} />
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}