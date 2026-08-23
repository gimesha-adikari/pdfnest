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
        flex h-8 w-8 items-center justify-center
        rounded-lg border border-[var(--border)]
        bg-[var(--surface-secondary)] text-[var(--muted)]
        transition-colors hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--muted)]
      "
        >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
    );
}