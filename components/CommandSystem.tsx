"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCommands, Command } from "@/lib/commands";

import { useTools } from "@/context/ToolContext";

export default function CommandSystem({
                                          externalOpen,
                                          onClose,
                                      }: {
    externalOpen?: boolean;
    onClose?: () => void;
}) {    const router = useRouter();
    const { displayTools: toolsList } = useTools();

    const [internalOpen, setInternalOpen] = useState(false);

    const open = externalOpen ?? internalOpen;

    const closeCommand = () => {
        if (onClose) {
            onClose();
        } else {
            setInternalOpen(false);
        }
    };

    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);

    const commands = useMemo(() => getCommands(toolsList), [toolsList]);

    const filtered = useMemo(() => {
        if (!query) return commands.slice(0, 12);

        return commands.filter((cmd) =>
            cmd.title.toLowerCase().includes(query.toLowerCase()) ||
            cmd.description?.toLowerCase().includes(query.toLowerCase())
        );
    }, [query, commands]);

    function execute(cmd: Command) {
        if (cmd.type === "tool" || cmd.type === "page") {
            if (cmd.href) router.push(cmd.href);
        }

        if (cmd.type === "action") {
            if (cmd.id === "theme") {
                document.documentElement.classList.toggle("dark");
            }
        }

        if (onClose) {
            onClose();
        } else {
            setInternalOpen(false);
        }
        setQuery("");
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                setInternalOpen((v) => !v);
            }

            if (!open) return;

            if (e.key === "Escape") {
                closeCommand();
            }
            if (e.key === "ArrowDown") {
                setActive((i) => (i + 1) % filtered.length);
            }

            if (e.key === "ArrowUp") {
                setActive((i) =>
                    i - 1 < 0 ? filtered.length - 1 : i - 1
                );
            }

            if (e.key === "Enter") {
                execute(filtered[active]);
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, filtered, active]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
            onClick={closeCommand}
        >
            <div
                className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search */}
                <div className="relative border-b border-[var(--border-subtle)]">
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActive(0);
                        }}
                        placeholder="Search commands, tools, actions..."
                        className="w-full px-4 py-3.5 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
                    />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                        <kbd className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                            ESC
                        </kbd>
                    </div>
                </div>

                {/* List */}
                <div className="max-h-[380px] overflow-y-auto p-1.5 space-y-0.5">
                    {filtered.map((cmd, i) => (
                        <div
                            key={cmd.id}
                            onClick={() => execute(cmd)}
                            className={`
                                px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-colors
                                ${
                                i === active
                                    ? "bg-[var(--accent)] text-white"
                                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                            }
                            `}
                        >
                            <div className="flex flex-col">
                                <span className={`text-xs font-medium ${i === active ? "text-white" : "text-[var(--foreground)]"}`}>
                                    {cmd.title}
                                </span>
                                {cmd.description && (
                                    <span className={`text-[11px] ${i === active ? "text-white/85" : "text-[var(--muted-foreground)]"}`}>
                                        {cmd.description}
                                    </span>
                                )}
                            </div>

                            <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border ${
                                i === active
                                    ? "bg-white/20 border-white/30 text-white"
                                    : "bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--muted-foreground)]"
                            }`}>
                                {cmd.type}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 text-[11px] font-mono text-[var(--muted-foreground)] border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <span>↑↓ to navigate</span>
                        <span>•</span>
                        <span>↵ to select</span>
                    </span>
                    <span>Platen Command Core</span>
                </div>
            </div>
        </div>
    );
}
