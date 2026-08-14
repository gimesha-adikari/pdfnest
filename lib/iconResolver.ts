"use client";

/**
 * Resolves a CMS iconName string (e.g. "Scissors") to a Lucide React icon
 * component. Only icons actually used across PDF tools are included — no
 * dynamic imports or eval are used. Unknown names fall back to FileText.
 */

import {
    FileText,
    Scissors,
    Merge,
    Minimize2,
    RotateCw,
    Lock,
    Unlock,
    FileImage,
    FileCode,
    FileDown,
    Globe,
    Pen,
    Highlighter,
    Underline,
    Strikethrough,
    Trash2,
    Copy,
    AlignJustify,
    PlusSquare,
    Crop,
    Type,
    Hash,
    Stamp,
    ScanSearch,
    Wrench,
    FileSpreadsheet,
    Presentation,
    FileType,
    Download,
    type LucideProps,
} from "lucide-react";
import type { FC } from "react";

type LucideIcon = FC<LucideProps>;

const ICON_MAP: Record<string, LucideIcon> = {
    FileText,
    Scissors,
    Merge,
    Minimize2,
    RotateCw,
    Lock,
    Unlock,
    FileImage,
    FileCode,
    FileDown,
    Globe,
    Pen,
    Highlighter,
    Underline,
    Strikethrough,
    Trash2,
    Copy,
    AlignJustify,
    PlusSquare,
    Crop,
    Type,
    Hash,
    Stamp,
    ScanSearch,
    Wrench,
    FileSpreadsheet,
    Presentation,
    FileType,
    Download,
};

/**
 * Returns the Lucide icon component for a given icon name string.
 * Falls back to FileText for unknown names.
 */
export function resolveIcon(iconName: string | undefined | null): LucideIcon {
    if (!iconName || typeof iconName !== "string") return FileText;
    return ICON_MAP[iconName] ?? FileText;
}

export type { LucideIcon };
