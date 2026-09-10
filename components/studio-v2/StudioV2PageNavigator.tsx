"use client";

import React from "react";
import type { VDMPageDescriptorDTO } from "@/lib/studio-v2/api";
import { studioPageContext } from "./studioV2PresentationState";

interface StudioV2PageNavigatorProps {
  pages: readonly VDMPageDescriptorDTO[];
  selectedPageId?: string | null;
  onSelectPage?: (pageId: string) => void;
  compact?: boolean;
}

/** VDM-backed page navigation; display position is intentionally not a PageID. */
export function StudioV2PageNavigator({ pages, selectedPageId, onSelectPage, compact = false }: StudioV2PageNavigatorProps) {
  const context = studioPageContext(pages, selectedPageId);
  if (compact) {
    return <span data-testid="studio-page-context" className="font-mono text-[11px] text-[#D8DCE3]">{context.label}</span>;
  }
  return (
    <section aria-label="Document pages" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[#292D35] px-3 py-2">
        <strong className="text-xs text-white">Pages</strong>
        <span data-testid="studio-page-context" className="font-mono text-[10px] text-[#9AA1AD]">{context.label}</span>
      </div>
      <div className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto p-3 sm:grid-cols-4">
        {pages.map((page, index) => {
          const selected = page.page_id === selectedPageId;
          return <button key={page.page_id} type="button" onClick={() => onSelectPage?.(page.page_id)} aria-selected={selected} className={`studio-v2-focus min-h-[52px] rounded border px-2 py-2 text-left text-xs ${selected ? "border-[var(--studio-border-active)] bg-[var(--studio-cta)]/15 text-white" : "border-[var(--studio-border)] bg-[#101216] text-[#B7BDC8] hover:border-[var(--studio-border-hover)]"}`}>
            <span className="block font-medium">Page {index + 1}</span>
            <span className="mt-1 block font-mono text-[9px] text-[#9AA1AD]">{page.rotation ? `${page.rotation}°` : ""}</span>
          </button>;
        })}
      </div>
    </section>
  );
}
