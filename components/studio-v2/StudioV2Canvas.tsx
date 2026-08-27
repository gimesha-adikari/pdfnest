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
import { DocumentInfo, StudioV2OverlayDraft, StudioV2RedactionDraftBox } from "./types";
import { StudioV2InteractiveOverlay } from "./StudioV2InteractiveOverlay";
import { VDMPageDescriptorDTO, StudioMarkupAction, StudioMarkupBox, StudioVDMDTO } from "@/lib/studio-v2/api";
import { fetchTileBlobUrl } from "@/lib/studio-v2/tileClient";
import {
  canonicalStudioV2CropToVisibleRect,
  clampStudioV2Rect,
  getStudioV2VisiblePageSize,
  moveStudioV2Rect,
  resizeStudioV2Rect,
  StudioV2Rect,
  StudioV2ResizeHandle,
  visibleStudioV2RectToCanonicalCrop,
  canonicalStudioV2OverlayToVisibleRect,
  visibleStudioV2RectToCanonicalOverlay,
  getStudioV2TextOverlaySize,
} from "./StudioV2Geometry";

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
  markupColor?: string;
  markupBoxes?: StudioMarkupBox[];
  onMarkupBoxChange?: (box: StudioMarkupBox) => void;
  onMarkupInteractionStart?: () => void;
  onMarkupInteractionEnd?: () => void;
  redactActive?: boolean;
  redactionBoxes?: StudioV2RedactionDraftBox[];
  onRedactionBoxAdd?: (box: StudioV2RedactionDraftBox) => void;
  cropActive?: boolean;
  cropDraft?: number[] | null;
  onCropDraftChange?: (cropBox: number[]) => void;
  selectedOverlayId?: string | null;
  overlayDraft?: StudioV2OverlayDraft | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onOverlayDraftChange?: (draft: StudioV2OverlayDraft) => void;
  onOverlayCommit?: (draft: StudioV2OverlayDraft) => void | Promise<void>;
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
  markupColor = "#FFFF00",
  markupBoxes = [],
  onMarkupBoxChange,
  onMarkupInteractionStart,
  onMarkupInteractionEnd,
  redactActive = false,
  redactionBoxes = [],
  onRedactionBoxAdd,
  cropActive = false,
  cropDraft = null,
  onCropDraftChange,
  selectedOverlayId = null,
  overlayDraft = null,
  onSelectOverlay,
  onOverlayDraftChange,
  onOverlayCommit,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [editingTextOverlayId, setEditingTextOverlayId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(
    isSelected || page.is_blank || Boolean(page.parent_page_id)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const markupStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const redactionStartRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const redactionDraftRef = useRef<StudioV2RedactionDraftBox | null>(null);
  const [redactionDraft, setRedactionDraft] = useState<StudioV2RedactionDraftBox | null>(null);
  const cropDragRef = useRef<{
    mode: "move" | StudioV2ResizeHandle;
    pointerId: number;
    startPointer: { x: number; y: number };
    startRect: StudioV2Rect;
  } | null>(null);

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
  const visiblePageSize = getStudioV2VisiblePageSize({
    dimensions: { width: page.dimensions?.width ?? baseW, height: page.dimensions?.height ?? baseH },
    rotation: page.rotation,
    cropBox,
  });
  const pageWidth = visiblePageSize.width;
  const pageHeight = visiblePageSize.height;
  const pageGeometry = {
    dimensions: {
      width: page.dimensions?.width ?? baseW,
      height: page.dimensions?.height ?? baseH,
    },
    rotation: page.rotation,
    cropBox,
  };
  const cropRect = cropDraft && cropDraft.length === 4
    ? clampStudioV2Rect(canonicalStudioV2CropToVisibleRect(pageGeometry, cropDraft), { width: pageWidth, height: pageHeight }, 1)
    : null;

  const updateCropFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || !onCropDraftChange) return;
    const delta = {
      x: (event.clientX - drag.startPointer.x) / zoomScale,
      y: (event.clientY - drag.startPointer.y) / zoomScale,
    };
    const bounds = { width: pageWidth, height: pageHeight };
    const nextRect = drag.mode === "move"
      ? moveStudioV2Rect(drag.startRect, delta, bounds)
      : resizeStudioV2Rect(drag.startRect, drag.mode, delta, bounds, 1);
    onCropDraftChange(visibleStudioV2RectToCanonicalCrop(pageGeometry, nextRect).map((value) => Number(value.toFixed(2))));
  };

  const beginCropDrag = (event: React.PointerEvent<HTMLElement>, mode: "move" | StudioV2ResizeHandle) => {
    if (!cropActive || !cropRect || !onCropDraftChange || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startRect: cropRect,
    };
    const captureTarget = event.currentTarget.closest<HTMLElement>("[data-testid^='studio-crop-overlay-']") ?? event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
  };

  const finishCropDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!cropDragRef.current) return;
    event.stopPropagation();
    const captureTarget = event.currentTarget.closest<HTMLElement>("[data-testid^='studio-crop-overlay-']") ?? event.currentTarget;
    if (captureTarget.hasPointerCapture(cropDragRef.current.pointerId)) {
      captureTarget.releasePointerCapture(cropDragRef.current.pointerId);
    }
    cropDragRef.current = null;
  };

  const cropHandle = (handle: StudioV2ResizeHandle, label: string, className: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`absolute z-30 border border-[var(--studio-border-active)] bg-[var(--studio-surface)] shadow-sm ${className}`}
      onPointerDown={(event) => beginCropDrag(event, handle)}
      onClick={(event) => event.stopPropagation()}
    />
  );

  const overlayPageGeometry = {
    dimensions: {
      width: page.dimensions?.width ?? baseW,
      height: page.dimensions?.height ?? baseH,
    },
    rotation: page.rotation,
    cropBox,
  };

  const overlayDraftFor = (overlay: VDMPageDescriptorDTO["overlays"][number]): StudioV2OverlayDraft | null => {
    if (overlay.type !== "signature" && overlay.type !== "text") return null;
    const x = overlay.rect?.[0] ?? 0;
    const y = overlay.rect?.[1] ?? 0;
    const text = overlay.text ?? "";
    const fontSize = overlay.font_size ?? 24;
    const textSize = getStudioV2TextOverlaySize(text, fontSize);
    const width = overlay.type === "signature" ? (overlay.rect?.[2] ?? 0) : textSize.width;
    const height = overlay.type === "signature" ? (overlay.rect?.[3] ?? 0) : textSize.height;
    const base: StudioV2OverlayDraft = {
      pageId: page.page_id,
      overlayId: overlay.id,
      type: overlay.type,
      rect: { x, y, width, height },
      text: overlay.text,
      fontSize,
      color: overlay.color,
      assetId: overlay.asset_id,
    };
    if (overlayDraft?.overlayId === overlay.id && overlayDraft.pageId === page.page_id) return overlayDraft;
    return base;
  };

  const visibleOverlayDrafts = page.overlays
    .map((overlay) => ({ overlay, draft: overlayDraftFor(overlay) }))
    .filter((entry): entry is { overlay: VDMPageDescriptorDTO["overlays"][number]; draft: StudioV2OverlayDraft } => Boolean(entry.draft));

  const updateOverlayDraft = (draft: StudioV2OverlayDraft, rect: StudioV2Rect, extra: Partial<StudioV2OverlayDraft> = {}) => {
    const [x, y, width, height] = visibleStudioV2RectToCanonicalOverlay(overlayPageGeometry, rect);
    onOverlayDraftChange?.({ ...draft, ...extra, rect: { x, y, width, height } });
  };

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
          ? "ring-2 ring-[var(--studio-border-active)] ring-offset-2 ring-offset-[#0B0C0F]"
          : "border border-[var(--studio-border)] hover:border-[var(--studio-border-hover)]"
      }`}
      onPointerDown={(event) => {
        if (cropDragRef.current) return;
        if (redactActive && onRedactionBoxAdd && !isPanning) {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const visibleX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
          const visibleY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
          const id = `redact-${page.page_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          redactionStartRef.current = { x: visibleX, y: visibleY, id };
          const draft = { id, pageId: page.page_id, page: pageIndex + 1, rect: { x: visibleX, y: visibleY, width: 1, height: 1 } };
          redactionDraftRef.current = draft;
          setRedactionDraft(draft);
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (!markupAction || !onMarkupBoxChange || isPanning || redactActive) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const visibleX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
        const visibleY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
        const id = `markup-${page.page_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        markupStartRef.current = { x: visibleX, y: visibleY, id };
        onMarkupInteractionStart?.();
        const box = mapVisibleMarkupRectToWorker(page, pageIndex + 1, { x: visibleX, y: visibleY, width: 1, height: 1 }, markupColor, id);
        if (box) onMarkupBoxChange(box);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (cropDragRef.current) {
          event.preventDefault();
          event.stopPropagation();
          updateCropFromPointer(event);
          return;
        }
        const redactionStart = redactionStartRef.current;
        if (redactionStart && redactActive) {
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const currentX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
          const currentY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
          const draft = {
            id: redactionStart.id,
            pageId: page.page_id,
            page: pageIndex + 1,
            rect: { x: Math.min(redactionStart.x, currentX), y: Math.min(redactionStart.y, currentY), width: Math.abs(currentX - redactionStart.x), height: Math.abs(currentY - redactionStart.y) },
          };
          redactionDraftRef.current = draft;
          setRedactionDraft(draft);
          return;
        }
        const start = markupStartRef.current;
        if (!start || !markupAction || !onMarkupBoxChange) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) / zoomScale));
        const currentY = Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) / zoomScale));
        const visible = { x: Math.min(start.x, currentX), y: Math.min(start.y, currentY), width: Math.abs(currentX - start.x), height: Math.abs(currentY - start.y) };
        const box = mapVisibleMarkupRectToWorker(page, pageIndex + 1, visible, markupColor, start.id);
        if (box) onMarkupBoxChange(box);
      }}
      onPointerUp={(event) => {
        if (cropDragRef.current) {
          finishCropDrag(event);
          return;
        }
        const redactionStart = redactionStartRef.current;
        if (redactionStart) {
          event.preventDefault();
          event.stopPropagation();
          const draft = redactionDraftRef.current;
          redactionStartRef.current = null;
          redactionDraftRef.current = null;
          setRedactionDraft(null);
          if (draft && draft.rect.width > 2 && draft.rect.height > 2) onRedactionBoxAdd?.(draft);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        if (markupStartRef.current) {
          event.stopPropagation();
          markupStartRef.current = null;
          onMarkupInteractionEnd?.();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        if (cropDragRef.current) finishCropDrag(event);
        redactionStartRef.current = null;
        redactionDraftRef.current = null;
        setRedactionDraft(null);
        markupStartRef.current = null;
      }}
      onLostPointerCapture={() => { cropDragRef.current = null; redactionStartRef.current = null; redactionDraftRef.current = null; setRedactionDraft(null); }}
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

      {visibleOverlayDrafts.map(({ overlay, draft }) => {
        const selected = selectedOverlayId === overlay.id;
        const textEditing = editingTextOverlayId === overlay.id;
        const visibleRect = clampStudioV2Rect(
          canonicalStudioV2OverlayToVisibleRect(overlayPageGeometry, [draft.rect.x, draft.rect.y, draft.rect.width, draft.rect.height]),
          { width: pageWidth, height: pageHeight },
          1,
        );
        return (
          <StudioV2InteractiveOverlay
            key={overlay.id}
            overlayId={overlay.id}
            label={overlay.type === "signature" ? "Signature overlay" : `Text overlay ${overlay.text ?? ""}`}
            rect={visibleRect}
            bounds={{ width: pageWidth, height: pageHeight }}
            zoomScale={zoomScale}
            selected={selected}
            resizeEnabled={overlay.type === "signature"}
            resizeHandles={overlay.type === "signature" ? ["north-west", "north-east", "south-west", "south-east"] : undefined}
            aspectRatio={overlay.type === "signature" ? draft.rect.width / Math.max(draft.rect.height, 1) : undefined}
            onSelect={() => onSelectOverlay?.(overlay.id)}
            onDoubleClick={overlay.type === "text" ? () => setEditingTextOverlayId(overlay.id) : undefined}
            onDraftChange={(rect) => updateOverlayDraft(draft, rect)}
            onCommit={(rect) => {
              const [x, y, width, height] = visibleStudioV2RectToCanonicalOverlay(overlayPageGeometry, rect);
              const next = { ...draft, rect: { x, y, width, height } };
              onOverlayDraftChange?.(next);
              return onOverlayCommit?.(next);
            }}
          >
            {overlay.type === "signature" ? (
              <div
                className={`h-full w-full rounded border bg-[var(--studio-cta)]/5 ${selected ? "border-[var(--studio-border-active)]" : "border-transparent hover:border-[var(--studio-border-hover)]"}`}
                aria-hidden="true"
              />
            ) : textEditing ? (
              <textarea
                autoFocus
                value={draft.text ?? overlay.text ?? ""}
                aria-label="Edit selected text inline"
                data-testid={`studio-inline-text-${overlay.id}`}
                className="h-full w-full resize-none overflow-hidden rounded border border-[var(--studio-border-active)] bg-white/10 p-1 outline-none"
                style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: `${(draft.fontSize ?? 24) * zoomScale}px`, lineHeight: 1.2, color: draft.color ?? "#000000" }}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onOverlayDraftChange?.({ ...draft, text: event.target.value })}
                onBlur={(event) => {
                  setEditingTextOverlayId(null);
                  void onOverlayCommit?.({ ...draft, text: event.currentTarget.value });
                }}
              />
            ) : (
              <div
                className="h-full w-full overflow-hidden rounded px-1"
                aria-hidden="true"
                style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: `${(draft.fontSize ?? 24) * zoomScale}px`, lineHeight: 1.2, color: draft.color ?? "#000000", whiteSpace: "pre" }}
              >
                {draft.text ?? overlay.text ?? ""}
              </div>
            )}
          </StudioV2InteractiveOverlay>
        );
      })}

      {markupBoxes.filter((box) => box.page === pageIndex + 1).map((box) => {
        const visible = mapWorkerMarkupBoxToVisible(page, box);
        return (
          <div
            key={box.id}
            data-testid={`studio-markup-box-${box.id}`}
            className="pointer-events-none absolute z-20 border-2 border-[var(--studio-accent)] bg-violet-300/20"
            style={{ left: `${visible.x * zoomScale}px`, top: `${visible.y * zoomScale}px`, width: `${visible.width * zoomScale}px`, height: `${visible.height * zoomScale}px` }}
          />
        );
      })}

      {redactionBoxes.filter((box) => box.pageId === page.page_id).map((box) => (
        <div
          key={box.id}
          data-testid={`studio-redaction-box-${box.id}`}
          role="img"
          aria-label={`Pending permanent redaction region on page ${box.page}`}
          className="pointer-events-none absolute z-24 border-2 border-red-700 bg-red-900/45"
          style={{ left: `${box.rect.x * zoomScale}px`, top: `${box.rect.y * zoomScale}px`, width: `${box.rect.width * zoomScale}px`, height: `${box.rect.height * zoomScale}px` }}
        />
      ))}
      {redactionDraft && redactionDraft.pageId === page.page_id && (
        <div
          data-testid="studio-redaction-draft"
          role="img"
          aria-label={`Pending permanent redaction region on page ${redactionDraft.page}`}
          className="pointer-events-none absolute z-24 border-2 border-dashed border-red-500 bg-red-950/35"
          style={{ left: `${redactionDraft.rect.x * zoomScale}px`, top: `${redactionDraft.rect.y * zoomScale}px`, width: `${redactionDraft.rect.width * zoomScale}px`, height: `${redactionDraft.rect.height * zoomScale}px` }}
        />
      )}

      {cropActive && cropRect && (
        <div
          data-testid={`studio-crop-overlay-${page.page_id}`}
          role="group"
          aria-label="Crop rectangle"
          className="absolute z-25 border-2 border-[var(--studio-border-active)] bg-[var(--studio-accent)]/10 shadow-[0_0_0_9999px_rgba(5,7,10,0.42)] cursor-move"
          style={{ left: `${cropRect.x * zoomScale}px`, top: `${cropRect.y * zoomScale}px`, width: `${cropRect.width * zoomScale}px`, height: `${cropRect.height * zoomScale}px` }}
          onPointerDown={(event) => beginCropDrag(event, "move")}
          onPointerMove={updateCropFromPointer}
          onPointerUp={finishCropDrag}
          onPointerCancel={finishCropDrag}
          onLostPointerCapture={() => { cropDragRef.current = null; }}
          onClick={(event) => event.stopPropagation()}
        >
          {cropHandle("north-west", "Resize crop top left", "-left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full")}
          {cropHandle("north", "Resize crop top edge", "left-1/2 -top-2 h-4 w-8 -translate-x-1/2 cursor-ns-resize rounded")}
          {cropHandle("north-east", "Resize crop top right", "-right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full")}
          {cropHandle("west", "Resize crop left edge", "-left-2 top-1/2 h-8 w-4 -translate-y-1/2 cursor-ew-resize rounded")}
          {cropHandle("east", "Resize crop right edge", "-right-2 top-1/2 h-8 w-4 -translate-y-1/2 cursor-ew-resize rounded")}
          {cropHandle("south-west", "Resize crop bottom left", "-bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-full")}
          {cropHandle("south", "Resize crop bottom edge", "-bottom-2 left-1/2 h-4 w-8 -translate-x-1/2 cursor-ns-resize rounded")}
          {cropHandle("south-east", "Resize crop bottom right", "-bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full")}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#14171C]/5 flex flex-col items-center justify-center gap-2 text-[#9AA1AD]">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--studio-accent)]" />
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
  markupColor?: string;
  markupBoxes?: StudioMarkupBox[];
  onMarkupBoxChange?: (box: StudioMarkupBox) => void;
  onMarkupInteractionStart?: () => void;
  onMarkupInteractionEnd?: () => void;
  redactActive?: boolean;
  redactionBoxes?: StudioV2RedactionDraftBox[];
  onRedactionBoxAdd?: (box: StudioV2RedactionDraftBox) => void;
  cropActive?: boolean;
  cropDraft?: number[] | null;
  onCropDraftChange?: (cropBox: number[]) => void;
  selectedOverlayId?: string | null;
  overlayDraft?: StudioV2OverlayDraft | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onOverlayDraftChange?: (draft: StudioV2OverlayDraft) => void;
  onOverlayCommit?: (draft: StudioV2OverlayDraft) => void | Promise<void>;
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
  markupColor = "#FFFF00",
  markupBoxes = [],
  onMarkupBoxChange,
  onMarkupInteractionStart,
  onMarkupInteractionEnd,
  redactActive = false,
  redactionBoxes = [],
  onRedactionBoxAdd,
  cropActive = false,
  cropDraft = null,
  onCropDraftChange,
  selectedOverlayId = null,
  overlayDraft = null,
  onSelectOverlay,
  onOverlayDraftChange,
  onOverlayCommit,
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
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[380px] max-w-[90%] bg-[var(--studio-surface)] rounded-md border border-[var(--studio-border)] z-30 shadow-lg flex items-center px-3 py-1.5 transition-all hover:border-[var(--studio-border-hover)]">
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
            markupColor={markupColor}
            markupBoxes={markupBoxes}
            onMarkupBoxChange={onMarkupBoxChange}
            onMarkupInteractionStart={onMarkupInteractionStart}
            onMarkupInteractionEnd={onMarkupInteractionEnd}
            redactActive={redactActive}
            redactionBoxes={redactionBoxes}
            onRedactionBoxAdd={onRedactionBoxAdd}
            cropActive={cropActive && selectedPageId === page.page_id && !selectedOverlayId && !redactActive}
            cropDraft={cropDraft}
            onCropDraftChange={onCropDraftChange}
            selectedOverlayId={selectedOverlayId}
            overlayDraft={overlayDraft}
            onSelectOverlay={onSelectOverlay}
            onOverlayDraftChange={onOverlayDraftChange}
            onOverlayCommit={onOverlayCommit}
          />
        ))}
      </div>

      {/* Bottom Floating Canvas Toolbar (Zoom & Navigation) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-[#14171C] border border-[#292D35] rounded-full px-3 py-1.5 z-30 shadow-xl flex items-center space-x-1 transition-colors">
        <button
          onClick={onTogglePan}
          className={`p-1.5 rounded-full transition-colors ${
            isPanning
              ? "bg-[var(--studio-cta)] text-white"
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
