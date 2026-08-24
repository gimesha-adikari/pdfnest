"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Hand,
  Minus,
  Plus,
  Maximize2,
  FileText,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { DocumentInfo } from "./types";
import { VDMPageDescriptorDTO, StudioVDMDTO } from "@/lib/studio-v2/api";
import { fetchTileBlobUrl } from "@/lib/studio-v2/tileClient";

interface PageTileRendererProps {
  sessionId: string;
  versionId: string;
  page: VDMPageDescriptorDTO;
  pageIndex: number;
  zoomScale: number;
  isSelected: boolean;
  onSelect: () => void;
}

const PageTileRenderer: React.FC<PageTileRendererProps> = ({
  sessionId,
  versionId,
  page,
  pageIndex,
  zoomScale,
  isSelected,
  onSelect,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Viewport intersection observer for progressive on-demand tile loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "250px 0px" } // Prefetch 250px before entering viewport
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loadTile = useCallback(async () => {
    if (!sessionId || !versionId || !page.page_id) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    setIsLoading(true);
    setHasError(false);

    try {
      // Calculate quality scale factor based on zoom (clamp between 1.0 and 2.5 for crisp DPI)
      const renderScale = Math.min(Math.max(zoomScale * 1.5, 1.0), 2.5);
      const url = await fetchTileBlobUrl(sessionId, versionId, page.page_id, {
        scale: renderScale,
        signal: ac.signal,
      });
      setImageUrl(url);
      setIsLoading(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setHasError(true);
      setIsLoading(false);
    }
  }, [sessionId, versionId, page.page_id, zoomScale]);

  useEffect(() => {
    if (isVisible) {
      loadTile();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isVisible, loadTile]);

  // Page dimensions (Authoritative VDM dimensions in PostScript points, defaulting to ISO A4)
  const baseW = page.dimensions?.width || 595.28;
  const baseH = page.dimensions?.height || 841.89;
  const isRotated = page.rotation === 90 || page.rotation === 270;
  const pageWidth = isRotated ? baseH : baseW;
  const pageHeight = isRotated ? baseW : baseH;

  return (
    <div
      ref={containerRef}
      onClick={onSelect}
      style={{
        width: `${pageWidth * zoomScale}px`,
        height: `${pageHeight * zoomScale}px`,
      }}
      className={`relative bg-white shadow-2xl transition-all duration-150 select-none cursor-pointer flex flex-col rounded-[2px] ${
        isSelected
          ? "ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-[#0B0C0F]"
          : "border border-[#292D35] hover:border-[#7c3aed]/50"
      }`}
    >
      {/* Page Header Indicator */}
      <div className="absolute -top-6 left-0 right-0 flex items-center justify-between text-[11px] font-mono text-[#9AA1AD] px-1 pointer-events-none">
        <span>Page {pageIndex + 1}</span>
        {page.rotation > 0 && <span>{page.rotation}°</span>}
      </div>

      {/* Rendered Tile Image Surface */}
      {imageUrl && !hasError && (
        <img
          src={imageUrl}
          alt={`Page ${pageIndex + 1}`}
          className="w-full h-full object-contain rounded-[2px]"
          draggable={false}
        />
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#14171C]/5 flex flex-col items-center justify-center gap-2 text-[#9AA1AD]">
          <Loader2 className="w-5 h-5 animate-spin text-[#7c3aed]" />
          <span className="text-[10px] font-mono">Rasterizing page...</span>
        </div>
      )}

      {/* Error Fallback with Retry */}
      {hasError && (
        <div className="absolute inset-0 bg-red-950/20 border border-red-800/40 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <span className="text-xs text-red-200 font-medium">
            Failed to render page preview
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadTile();
            }}
            className="flex items-center gap-1.5 bg-[#181B21] border border-[#292D35] text-xs text-[#9AA1AD] hover:text-white px-2.5 py-1 rounded mt-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}
    </div>
  );
};

interface StudioV2CanvasProps {
  document: DocumentInfo;
  sessionId?: string | null;
  versionId?: string | null;
  vdm?: StudioVDMDTO | null;
  selectedPageId?: string | null;
  zoomScale: number;
  isPanning: boolean;
  onSelectPage?: (pageId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onTogglePan: () => void;
  onOpenCommandPalette: () => void;
}

export const StudioV2Canvas: React.FC<StudioV2CanvasProps> = ({
  document,
  sessionId,
  versionId,
  vdm,
  selectedPageId,
  zoomScale,
  isPanning,
  onSelectPage,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onTogglePan,
  onOpenCommandPalette,
}) => {
  const pages: VDMPageDescriptorDTO[] = vdm?.pages && vdm.pages.length > 0
    ? vdm.pages
    : [
        {
          page_id: "default_page_1",
          source_page_number: 1,
          is_blank: true,
          rotation: 0,
          overlays: [],
        },
      ];

  const viewportRef = useRef<HTMLDivElement>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPanning || e.button === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX - panOffset.x,
        y: e.clientY - panOffset.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      setPanOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div
      className="flex-1 h-full relative flex flex-col bg-[#0B0C0F] overflow-hidden select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Floating Command Palette Trigger Pill (Top Center) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[380px] max-w-[90%] bg-[#14171C] rounded-md border border-[#292D35] z-30 shadow-lg flex items-center px-3 py-1.5 transition-all hover:border-[#7c3aed]">
        <Search className="w-4 h-4 text-[#9AA1AD] mr-2 shrink-0" />
        <button
          onClick={onOpenCommandPalette}
          className="bg-transparent border-none w-full text-left text-[#9AA1AD] hover:text-white text-xs truncate focus:outline-none p-0 cursor-pointer"
        >
          Type a command or search...
        </button>
        <div className="flex items-center gap-1 ml-2 opacity-60 shrink-0">
          <kbd className="font-mono text-[10px] border border-[#292D35] rounded px-1 text-[#9AA1AD]">
            ⌘
          </kbd>
          <kbd className="font-mono text-[10px] border border-[#292D35] rounded px-1 text-[#9AA1AD]">
            K
          </kbd>
        </div>
      </div>

      {/* Center Multi-Page Canvas Viewport */}
      <div
        ref={viewportRef}
        className={`flex-1 overflow-auto p-12 relative z-10 flex flex-col items-center gap-16 ${
          isPanning ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
        }}
      >
        {pages.map((page, index) => (
          <PageTileRenderer
            key={page.page_id}
            sessionId={sessionId || ""}
            versionId={versionId || ""}
            page={page}
            pageIndex={index}
            zoomScale={zoomScale}
            isSelected={selectedPageId === page.page_id}
            onSelect={() => onSelectPage && onSelectPage(page.page_id)}
          />
        ))}
      </div>

      {/* Bottom Floating Canvas Toolbar (Zoom & Navigation) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-[#14171C] border border-[#292D35] rounded-full px-3 py-1.5 z-30 shadow-xl flex items-center space-x-1 transition-colors">
        <button
          onClick={onTogglePan}
          className={`p-1.5 rounded-full transition-colors ${
            isPanning
              ? "bg-[#7c3aed] text-white"
              : "text-[#9AA1AD] hover:text-white hover:bg-[#181B21]"
          }`}
          aria-label="Pan tool"
          title="Pan tool (drag canvas)"
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-[#292D35] mx-1" />

        <button
          onClick={onZoomOut}
          className="p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded-full transition-colors"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          onClick={onFitToScreen}
          className="px-2 py-1 text-xs font-mono text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded transition-colors"
          aria-label="Fit to screen"
          title="Reset zoom to 90%"
        >
          {Math.round(zoomScale * 100)}%
        </button>

        <button
          onClick={onZoomIn}
          className="p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded-full transition-colors"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-[#292D35] mx-1" />

        <button
          onClick={onFitToScreen}
          className="p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded-full transition-colors"
          aria-label="Fit to screen"
          title="Fit to screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
