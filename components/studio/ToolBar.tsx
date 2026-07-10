"use client";

import React from "react";
import {
    Layers3,
    PencilLine,
    Crop,
    ListOrdered,
    ScanText,
    Scissors,
    SquareDashedMousePointer,
    Trash2,
    Undo2,
    Redo2,
    CopyPlus,
    FilePlus, Blend, FileDigit, ShieldQuestionMark, TextInitial, Signature, SquareDashedText, Highlighter, Underline,
    Strikethrough,
    FileArchive, Paintbrush, Wrench, Droplet, Eraser,
} from "lucide-react";

export type StudioToolId =
    | "select"
    | "reorder"
    | "crop"
    | "delete"
    | "rotate"
    | "split"
    | "merge"
    | "duplicate"
    | "add-blank"
    | "watermark"
    | "page-number"
    | "metadata"
    | "edit-pdf"
    | "sign"
    | "add-text"
    | "highlight"
    | "underline"
    | "strikeout"
    | "compress"
    | "grayscale"
    | "repair"
    | "redact"
    ;

interface StudioToolBarProps {
    activeTool: StudioToolId;
    onToolSelect: (tool: StudioToolId) => void;

    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

const TOOLS = [
    {
        id: "select",
        label: "Select",
        icon: <SquareDashedMousePointer size={15} />,
    },
    {
        id: "reorder",
        label: "Reorder",
        icon: <ListOrdered size={15} />,
    },
    {
        id: "crop",
        label: "Crop",
        icon: <Crop size={15} />,
    },
    {
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={15} />,
    },
    {
        id: "rotate",
        label: "Rotate",
        icon: <ScanText size={15} />,
    },
    {
        id: "split",
        label: "Split",
        icon: <Scissors size={15} />,
    },
    {
        id: "merge",
        label: "Merge",
        icon: <Layers3 size={15} />,
    },
    {
        id: "duplicate",
        label: "Duplicate",
        icon: <CopyPlus size={15} />,
    },
    {
        id: "add-blank",
        label: "Add Blank",
        icon: <FilePlus size={15} />,
    },
    {
        id: "watermark",
        label: "Watermark",
        icon: <Blend size={15} />,
    },
    {
        id: "page-number",
        label: "Add Numbers",
        icon: <FileDigit size={15} />,
    },
    {
        id: "metadata",
        label: "Metadata",
        icon: <ShieldQuestionMark size={15} />,
    },
    {
        id: "edit-pdf",
        label: "Edit",
        icon: <TextInitial size={15} />,
    },
    {
        id: "sign",
        label: "Sign",
        icon: <Signature size={15} />,
    },
    {
        id: "add-text",
        label: "Add Text",
        icon: <SquareDashedText size={15} />,
    },
    {
        id: "highlight",
        label: "Highlight",
        icon: <Highlighter size={15} />,
    },
    {
        id: "underline",
        label: "Underline",
        icon: <Underline size={15} />,
    },
    {
        id: "strikeout",
        label: "Strikeout",
        icon: <Strikethrough size={15} />,
    },
    {
        id: "compress",
        label: "Compress",
        icon: <FileArchive size={15} />,
    },
    {
        id: "grayscale",
        label: "Grayscale",
        icon: <Droplet size={15} />,
    },
    {
        id: "repair",
        label: "Repair",
        icon: <Wrench size={15} />,
    },
    {
        id: "redact",
        label: "Redact",
        icon: <Eraser size={15} />,
    },
] satisfies {
    id: StudioToolId;
    label: string;
    icon: React.ReactNode;
}[];

export default function StudioToolBar({
                                          activeTool,
                                          onToolSelect,
                                          canUndo,
                                          canRedo,
                                          onUndo,
                                          onRedo,
                                      }: StudioToolBarProps) {
    return (
        <section className="rounded-3xl border border-[color:var(--border)] bg-[var(--card)] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-2.5">
                <div>
                    <h3 className="text-sm font-bold text-[color:var(--foreground)]">
                        Tools
                    </h3>
                    <p className="text-xs text-[color:var(--muted)]">
                        Studio editing tools
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                        aria-label="Undo"
                        className="inline-flex h-8 items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)]/40 px-3 text-[color:var(--foreground)] transition hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Undo2 size={15} />
                        <span className="hidden sm:inline text-xs font-semibold">
                            Undo
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                        aria-label="Redo"
                        className="inline-flex h-8 items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[var(--background)]/40 px-3 text-[color:var(--foreground)] transition hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Redo2 size={15} />
                        <span className="hidden sm:inline text-xs font-semibold">
                            Redo
                        </span>
                    </button>

                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--muted)]">
                        Top dock
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto px-3 py-2.5">
                <div className="flex min-w-max items-center gap-2">
                    {TOOLS.map((tool) => {
                        const active = activeTool === tool.id;

                        return (
                            <button
                                key={tool.id}
                                type="button"
                                onClick={() => onToolSelect(tool.id)}
                                className={[
                                    "inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-left transition",
                                    active
                                        ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                                        : "border-[color:var(--border)] bg-[var(--background)]/40 hover:bg-[var(--card)]",
                                ].join(" ")}
                            >
                                <span
                                    className={[
                                        "flex h-7 w-7 items-center justify-center rounded-xl",
                                        active
                                            ? "bg-indigo-500/15 text-indigo-500"
                                            : "bg-[var(--card)] text-[color:var(--muted)]",
                                    ].join(" ")}
                                >
                                    {tool.icon}
                                </span>

                                <span className="text-sm font-semibold text-[color:var(--foreground)]">
                                    {tool.label}
                                </span>

                                {active && (
                                    <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                                        Active
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}