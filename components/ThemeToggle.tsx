"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const { resolvedTheme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const isDark = resolvedTheme === "dark";

    return (
        <button
            type="button"
            aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="
        flex h-11 w-11 items-center justify-center
        rounded-xl border border-[color:var(--border)]
        bg-[var(--card)] text-[var(--foreground)]
        shadow-md transition-transform hover:scale-105
      "
        >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );
}