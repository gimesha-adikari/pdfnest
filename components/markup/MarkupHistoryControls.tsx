"use client";

import { Redo2, Undo2 } from "lucide-react";

interface MarkupHistoryControlsProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

export default function MarkupHistoryControls({ canUndo, canRedo, onUndo, onRedo }: MarkupHistoryControlsProps) {
    return (
        <div className="flex items-center gap-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo (Ctrl+Z)"
                className="rounded-lg p-1.5 text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:opacity-30"
            >
                <Undo2 size={14} />
            </button>
            <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title="Redo (Ctrl+Y)"
                className="rounded-lg p-1.5 text-[color:var(--foreground)] transition hover:bg-[color:var(--background)] disabled:opacity-30"
            >
                <Redo2 size={14} />
            </button>
        </div>
    );
}
