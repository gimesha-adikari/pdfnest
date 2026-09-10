"use client";

import React from "react";
import { Highlighter, Minus, Strikethrough, SlidersHorizontal } from "lucide-react";
import type { StudioMarkupAction } from "@/lib/studio-v2/api";

interface StudioV2ContextToolbarProps {
  action: StudioMarkupAction;
  onActionChange: (action: StudioMarkupAction) => void;
  onOpenContext: () => void;
}

/** Compact Annotate entry point; detailed production controls stay in the inspector. */
export function StudioV2ContextToolbar({ action, onActionChange, onOpenContext }: StudioV2ContextToolbarProps) {
  const actions: Array<{ id: StudioMarkupAction; label: string; icon: React.ElementType }> = [
    { id: "highlight", label: "Highlight", icon: Highlighter },
    { id: "underline", label: "Underline", icon: Minus },
    { id: "strikeout", label: "Strikeout", icon: Strikethrough },
  ];
  return <div className="absolute left-3 top-14 z-20 flex items-center gap-1 rounded-lg border border-[var(--studio-border)] bg-[#101216]/95 p-1 shadow-lg" role="toolbar" aria-label="Annotate actions">
    {actions.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onActionChange(id)} aria-pressed={action === id} title={label} className={`studio-v2-focus flex min-h-[36px] min-w-[36px] items-center justify-center rounded ${action === id ? "bg-[var(--studio-cta)] text-white" : "text-[#B7BDC8] hover:bg-[#20242B] hover:text-white"}`}><Icon className="h-4 w-4" /><span className="sr-only">{label}</span></button>)}
    <button type="button" onClick={onOpenContext} className="studio-v2-focus flex min-h-[36px] items-center gap-1 rounded px-2 text-xs text-[#D8DCE3] hover:bg-[#20242B] hover:text-white" aria-label="Open annotation details"><SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Details</span></button>
  </div>;
}
