"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCommands, Command } from "@/lib/commands";

export default function CommandSystem({
                                          externalOpen,
                                          onClose,
                                      }: {
    externalOpen?: boolean;
    onClose?: () => void;
}) {    const router = useRouter();

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

    const commands = useMemo(() => getCommands(), []);

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
            className="fixed inset-0 z-[999] bg-black/60 flex items-start justify-center pt-28"
            onClick={closeCommand}
        >
            <div
                className="w-full max-w-2xl rounded-2xl border border-[color:var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search */}
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                    }}
                    placeholder="Search commands, tools, pages..."
                    className="w-full px-4 py-3 border-b border-[color:var(--border)] bg-transparent outline-none"
                />

                {/* List */}
                <div className="max-h-[420px] overflow-y-auto">
                    {filtered.map((cmd, i) => (
                        <div
                            key={cmd.id}
                            onClick={() => execute(cmd)}
                            className={`
                                px-4 py-3 cursor-pointer
                                ${
                                i === active
                                    ? "bg-indigo-500 text-white"
                                    : "hover:bg-[var(--background)]"
                            }
                            `}
                        >
                            <div className="font-semibold">
                                {cmd.title}
                            </div>

                            {cmd.description && (
                                <div className="text-xs opacity-70">
                                    {cmd.description}
                                </div>
                            )}

                            <div className="text-[10px] uppercase opacity-50 mt-1">
                                {cmd.type}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 text-xs text-[color:var(--muted)] border-t border-[color:var(--border)]">
                    Ctrl+K • Navigate • Enter • Esc
                </div>
            </div>
        </div>
    );
}