"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Plus, X } from "lucide-react";
import type { VDMPageDescriptorDTO } from "@/lib/studio-v2/api";
import { studioPageContext } from "./studioV2PresentationState";
import { fetchTileBlobUrl } from "@/lib/studio-v2/tileClient";

interface StudioV2PageNavigatorProps {
  pages: readonly VDMPageDescriptorDTO[]; selectedPageId?: string | null; onSelectPage?: (pageId: string) => void; compact?: boolean; onClose?: () => void; onAddNewPage?: () => void;
  sessionId?: string | null; versionId?: string | null; previewVersionByPageId?: Record<string, string>;
}

function PageThumbnail({ page, sessionId, versionId }: { page: VDMPageDescriptorDTO; sessionId?: string | null; versionId?: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId || !versionId || page.is_blank || !ref.current) return;
    const controller = new AbortController();
    const load = () => { void fetchTileBlobUrl(sessionId, versionId, page.page_id, { scale: 0.2, signal: controller.signal }).then(setSrc).catch(() => undefined); };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: "100px" });
      observer.observe(ref.current);
      return () => { observer.disconnect(); controller.abort(); };
    }
    return () => controller.abort();
  }, [page.is_blank, page.page_id, sessionId, versionId]);
  return <span ref={ref} className="studio-v2-thumbnail-paper">{src && <img src={src} alt="" draggable={false}/>} {page.rotation ? <em>{page.rotation}°</em> : null}</span>;
}

/** VDM-backed prototype page navigator; durable PageIDs remain the selection keys. */
export function StudioV2PageNavigator({ pages, selectedPageId, onSelectPage, compact = false, onClose, onAddNewPage, sessionId, versionId, previewVersionByPageId }: StudioV2PageNavigatorProps) {
  const context = studioPageContext(pages, selectedPageId);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = pages.findIndex((page) => page.page_id === selectedPageId);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ block: "nearest" }); }, [selectedPageId]);
  if (compact) return <span data-testid="studio-page-context" className="studio-v2-page-context">{context.label}</span>;
  return <aside className="studio-v2-page-navigator" aria-label="Document pages">
    <header><LayoutGrid size={16}/><strong>Pages</strong><span>{pages.length} pages</span>{onClose && <button type="button" onClick={onClose} aria-label="Close Pages navigator"><X size={16}/></button>}</header>
    <div className="studio-v2-page-jump">
      <button type="button" onClick={() => selectedIndex > 0 && onSelectPage?.(pages[selectedIndex - 1].page_id)} disabled={selectedIndex <= 0} aria-label="Previous page"><ChevronLeft size={14}/></button>
      <select value={selectedPageId ?? ""} onChange={(event) => onSelectPage?.(event.target.value)} aria-label="Jump to page">{pages.map((page, index) => <option key={page.page_id} value={page.page_id}>Page {index + 1} · {index + 1} of {pages.length}</option>)}</select>
      <button type="button" onClick={() => selectedIndex >= 0 && selectedIndex < pages.length - 1 && onSelectPage?.(pages[selectedIndex + 1].page_id)} disabled={selectedIndex < 0 || selectedIndex >= pages.length - 1} aria-label="Next page"><ChevronRight size={14}/></button>
    </div>
    <div className="studio-v2-page-list" ref={listRef}>{pages.map((page, index) => { const selected = page.page_id === selectedPageId; return <button key={page.page_id} type="button" onClick={() => onSelectPage?.(page.page_id)} aria-current={selected ? "page" : undefined} className={selected ? "active" : ""}>
      <PageThumbnail page={page} sessionId={sessionId} versionId={previewVersionByPageId?.[page.page_id] ?? versionId}/>
      <span className="studio-v2-thumbnail-copy"><strong>Page {index + 1}</strong><small>{index + 1} of {pages.length}{page.is_blank ? " · Blank" : ""}</small>{selected && <em>Selected</em>}</span>
    </button>; })}</div>
    {onAddNewPage && <footer><button type="button" onClick={onAddNewPage}><Plus size={15}/>Add blank page</button></footer>}
  </aside>;
}
