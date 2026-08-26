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
import { VDMPageDescriptorDTO, StudioMarkupAction, StudioMarkupBox, StudioVDMDTO } from "@/lib/studio-v2/api";
import { fetchTileBlobUrl } from "@/lib/studio-v2/tileClient";

interface PageTileRendererProps {
  sessionId: string;
  versionId: string;
  page: VDMPageDescriptorDTO;
  pageIndex: number;
  zoomScale: number;
  isSelected: boolean;
  onSelect: () => void;
  isPanning: boolean;
  markupAction?: StudioMarkupAction | null;
  markupBoxes?: StudioMarkupBox[];
  onMarkupBoxChange?: (box: StudioMarkupBox) => void;
}

interface VisibleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function pageGeometry(page: VDMPageDescriptorDTO) {
  const crop = page.crop_box?.length === 4 ? page.crop_box : null;
  const width = crop && crop[2] > crop[0] ? crop[2] - crop[0] : page.dimensions?.width ?? 0;
  const height = crop && crop[3] > crop[1] ? crop[3] - crop[1] : page.dimensions?.height ?? 0;
  const rotated = page.rotation === 90 || page.rotation === 270;
  return { width, height, visibleWidth: rotated ? height : width, visibleHeight: rotated ? width : height };
}

export function mapVisibleMarkupRectToWorker(
  page: VDMPageDescriptorDTO,
  pageNumber: number,
  visible: VisibleRect,
  color: string,
  id: string,
): StudioMarkupBox | null {
  const geometry = pageGeometry(page);
  if (!geometry.width || !geometry.height) return null;
  const x = Math.max(0, Math.min(visible.x, geometry.visibleWidth));
  const y = Math.max(0, Math.min(visible.y, geometry.visibleHeight));
  const right = Math.max(x, Math.min(visible.x + visible.width, geometry.visibleWidth));
  const bottom = Math.max(y, Math.min(visible.y + visible.height, geometry.visibleHeight));
  // The worker receives the visible, crop-relative page coordinate system and
  // applies the page's rotation-aware derotation at the PDF boundary. Keeping
  // the payload in this same system avoids rotating the selection twice.
  return {
    id,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(Math.max(0, right - x).toFixed(2)),
    height: Number(Math.max(0, bottom - y).toFixed(2)),
    page: pageNumber,
    color,
  };
}

function mapWorkerMarkupBoxToVisible(page: VDMPageDescriptorDTO, box: StudioMarkupBox): VisibleRect {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

const PageTileRenderer: React.FC<PageTileRendererProps> = ({
  sessionId,
  versionId,
  page,
  pageIndex,
  zoomScale,
  isSelected,
  onSelect,
  isPanning,
  markupAction = null,
  markupBoxes = [],
  onMarkupBoxChange,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(
    isSelected || page.is_blank || Boolean(page.parent_page_id)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const markupStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

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

  // Real pages, including server-created blanks, must provide authoritative
  // dimensions. The dimensionless fallback is only an empty-state placeholder.
  const hasDimensions = Boolean(page.dimensions?.width && page.dimensions?.height);
  const cropBox = page.crop_box?.length === 4 ? page.crop_box : null;
  const cropW = cropBox && cropBox[2] > cropBox[0] ? cropBox[2] - cropBox[0] : null;
  const cropH = cropBox && cropBox[3] > cropBox[1] ? cropBox[3] - cropBox[1] : null;
  const baseW = cropW ?? page.dimensions?.width ?? 1;
  const baseH = cropH ?? page.dimensions?.height ?? 1;
  const isRotated = page.rotation === 90 || page.rotation === 270;
  const pageWidth = isRotated ? baseH : baseW;
  const pageHeight = isRotated ? baseW : baseH;

  return (
    <div
      ref={containerRef}
      data-page-id={page.page_id}
      data-page-blank={page.is_blank ? "true" : "false"}
      data-page-visible-width-pt={hasDimensions ? String(pageWidth) : undefined}
      data-page-visible-height-pt={hasDimensions ? String(pageHeight) : undefined}
      onClick={onSelect}
      style={{
        width: hasDimensions ? `${pageWidth * zoomScale}px` : `min(70vw, 32rem)`,
        height: hasDimensions ? `${pageHeight * zoomScale}px` : `min(70vh, 45rem)`,
      }}
      className={`relative bg-white shadow-2xl transition-all duration-150 select-none cursor-pointer flex flex-col rounded-[2px] ${
        isSelected
          ? "ring-2 ring-[#7c3aed] ring-offset-2 ring-offset-[#0B0C0F]"
          : "border border-[#292D35] hover:border-[#7c3aed]/50"
      }`}
      onPointerDown={(event) => {
        if (!markupAction || !onMarkupBoxChange || isPanning) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const visibleX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
        const visibleY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
        const id = `markup-${page.page_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        markupStartRef.current = { x: visibleX, y: visibleY, id };
        const box = mapVisibleMarkupRectToWorker(page, pageIndex + 1, { x: visibleX, y: visibleY, width: 1, height: 1 }, markupAction === "highlight" ? "#FFFF00" : markupAction === "underline" ? "#FF4D4D" : "#FF0000", id);
        if (box) onMarkupBoxChange(box);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = markupStartRef.current;
        if (!start || !markupAction || !onMarkupBoxChange) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
        const currentY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
        const visible = { x: Math.min(start.x, currentX), y: Math.min(start.y, currentY), width: Math.abs(currentX - start.x), height: Math.abs(currentY - start.y) };
        const box = mapVisibleMarkupRectToWorker(page, pageIndex + 1, visible, markupAction === "highlight" ? "#FFFF00" : markupAction === "underline" ? "#FF4D4D" : "#FF0000", start.id);
        if (box) onMarkupBoxChange(box);
      }}
      onPointerUp={(event) => {
        if (markupStartRef.current) {
          event.stopPropagation();
          markupStartRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
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

      {markupBoxes.filter((box) => box.page === pageIndex + 1).map((box) => {
        const visible = mapWorkerMarkupBoxToVisible(page, box);
        return (
          <div
            key={box.id}
            data-testid={`studio-markup-box-${box.id}`}
            className="pointer-events-none absolute z-20 border-2 border-violet-500 bg-violet-300/25"
            style={{ left: `${visible.x * zoomScale}px`, top: `${visible.y * zoomScale}px`, width: `${visible.width * zoomScale}px`, height: `${visible.height * zoomScale}px` }}
          />
        );
      })}

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
  markupAction?: StudioMarkupAction | null;
  markupBoxes?: StudioMarkupBox[];
  onMarkupBoxChange?: (box: StudioMarkupBox) => void;
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
  markupAction = null,
  markupBoxes = [],
  onMarkupBoxChange,
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
            isPanning={isPanning}
            markupAction={markupAction}
            markupBoxes={markupBoxes}
            onMarkupBoxChange={onMarkupBoxChange}
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
