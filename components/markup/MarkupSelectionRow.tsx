"use client";

import { Trash2 } from "lucide-react";

interface MarkupSelectionRowProps {
    label: string;
    onDelete: () => void;
}

/** "… selected" row with the remove-box action, shown while a box is active. */
export default function MarkupSelectionRow({ label, onDelete }: MarkupSelectionRowProps) {
    return (
        <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-3">
            <span className="text-xs font-semibold text-[color:var(--muted)]">{label}</span>
            <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/20 hover:text-red-600"
            >
                <Trash2 size={14} /> Remove Box
            </button>
        </div>
    );
}
