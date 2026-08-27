"use client";

import React, { useEffect, useState } from "react";
import type { VDMPageDescriptorDTO } from "@/lib/studio-v2/api";
import { fetchTileBlobUrl } from "@/lib/studio-v2/tileClient";

interface Props {
  sessionId?: string | null;
  versionId?: string | null;
  pages: VDMPageDescriptorDTO[];
  selectedPageIds: Set<string>;
  onToggle: (pageId: string, shift: boolean) => void;
}

function SplitTile({ sessionId, versionId, page, selected, onToggle }: { sessionId?: string | null; versionId?: string | null; page: VDMPageDescriptorDTO; selected: boolean; onToggle: (shift: boolean) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId || !versionId) return;
    const controller = new AbortController();
    void fetchTileBlobUrl(sessionId, versionId, page.page_id, { scale: 0.5, signal: controller.signal }).then(setSrc).catch(() => undefined);
    return () => controller.abort();
  }, [sessionId, versionId, page.page_id]);
  return (
    <button type="button" aria-pressed={selected} aria-label={`Page ${page.source_page_number}${selected ? ", selected" : ""}`} data-testid={`studio-split-page-${page.page_id}`} onClick={(event) => onToggle(event.shiftKey)} className={`relative aspect-[1/1.4] overflow-hidden rounded border p-1 text-[10px] transition ${selected ? "border-[var(--studio-border-active)] bg-[var(--studio-surface-raised)]" : "border-[var(--studio-border)] bg-[#101216] hover:border-[var(--studio-focus)]"}`}>
      {src ? <img src={src} alt={`Page ${page.source_page_number}`} className="h-full w-full rounded object-cover" /> : <span className="flex h-full items-center justify-center text-[var(--studio-muted)]">Page {page.source_page_number}</span>}
      <span className="absolute inset-x-1 bottom-1 rounded bg-black/60 py-0.5 text-center text-white">Page {page.source_page_number}</span>
      {selected && <span className="absolute right-1 top-1 rounded-full bg-[var(--studio-cta)] px-1.5 py-0.5 text-white">✓</span>}
    </button>
  );
}

export const StudioV2SplitSelector: React.FC<Props> = ({ sessionId, versionId, pages, selectedPageIds, onToggle }) => (
  <div className="mt-3 max-h-64 overflow-y-auto rounded border border-[var(--studio-border)] p-2" data-testid="studio-split-visual-selector" aria-label="Visual page selector">
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {pages.map((page) => <SplitTile key={page.page_id} sessionId={sessionId} versionId={versionId} page={page} selected={selectedPageIds.has(page.page_id)} onToggle={(shift) => onToggle(page.page_id, shift)} />)}
    </div>
  </div>
);
