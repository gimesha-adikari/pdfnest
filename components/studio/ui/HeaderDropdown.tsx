"use client";

import {useEffect, useRef, useState} from "react";
import { ChevronDown } from "lucide-react";

interface HeaderDropdownProps {
    title: string;
    width?: string;
    children: React.ReactNode;
}

export default function HeaderDropdown({
                                           title,
                                           width = "w-56",
                                           children,
                                       }: HeaderDropdownProps) {
    const [open, setOpen] = useState(false);
    const closeTimer = useRef<NodeJS.Timeout | null>(null);

    const openMenu = () => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }

        setOpen(true);
    };

    const closeMenu = () => {
        closeTimer.current = setTimeout(() => {
            setOpen(false);
        }, 200);
    };

    useEffect(() => {
        return () => {
            if (closeTimer.current) {
                clearTimeout(closeTimer.current);
            }
        };
    }, []);

    return (
        <div
            className="relative"
            onMouseEnter={openMenu}
            onMouseLeave={closeMenu}
        >
            <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-[color:var(--border)]/30"
            >
                {title}
                <ChevronDown
                    size={14}
                    className={`ml-1 inline-block transition ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

            <div
                className={`absolute left-0 top-full mt-2 ${width} rounded-2xl border border-[color:var(--border)] bg-[var(--card)] p-2 shadow-2xl transition-all duration-150 ${
                    open
                        ? "visible translate-y-0 opacity-100"
                        : "pointer-events-none invisible -translate-y-2 opacity-0"
                }`}
            >
                {children}
            </div>
        </div>
    );
}