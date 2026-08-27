"use client";

import React, { useEffect, useRef } from "react";
import {
  clampStudioV2Rect,
  moveStudioV2Rect,
  nudgeStudioV2Rect,
  resizeStudioV2Rect,
  resizeStudioV2RectWithAspectRatio,
  StudioV2Bounds,
  StudioV2Rect,
  StudioV2ResizeHandle,
} from "./StudioV2Geometry";

export interface StudioV2InteractiveOverlayProps {
  overlayId: string;
  label: string;
  rect: StudioV2Rect;
  bounds: StudioV2Bounds;
  zoomScale: number;
  selected: boolean;
  resizeEnabled?: boolean;
  resizeHandles?: StudioV2ResizeHandle[];
  aspectRatio?: number;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onDraftChange: (rect: StudioV2Rect) => void;
  onCommit: (rect: StudioV2Rect) => void | Promise<void>;
  children: React.ReactNode;
}

interface ActivePointer {
  pointerId: number;
  mode: "move" | StudioV2ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: StudioV2Rect;
  didMove: boolean;
}

const HANDLE_CLASSES: Record<StudioV2ResizeHandle, string> = {
  "north-west": "-left-2 -top-2 cursor-nwse-resize",
  north: "left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize",
  "north-east": "-right-2 -top-2 cursor-nesw-resize",
  west: "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
  east: "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
  "south-west": "-bottom-2 -left-2 cursor-nesw-resize",
  south: "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize",
  "south-east": "-bottom-2 -right-2 cursor-nwse-resize",
};

const HANDLE_LABELS: Record<StudioV2ResizeHandle, string> = {
  "north-west": "Resize overlay top left",
  north: "Resize overlay top edge",
  "north-east": "Resize overlay top right",
  west: "Resize overlay left edge",
  east: "Resize overlay right edge",
  "south-west": "Resize overlay bottom left",
  south: "Resize overlay bottom edge",
  "south-east": "Resize overlay bottom right",
};

export const StudioV2InteractiveOverlay: React.FC<StudioV2InteractiveOverlayProps> = ({
  overlayId,
  label,
  rect,
  bounds,
  zoomScale,
  selected,
  resizeEnabled = false,
  resizeHandles,
  aspectRatio,
  onSelect,
  onDoubleClick,
  onDraftChange,
  onCommit,
  children,
}) => {
  const activePointerRef = useRef<ActivePointer | null>(null);
  const rectRef = useRef(rect);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  const updateFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    const active = activePointerRef.current;
    if (!active) return;
    if (event.clientX === active.startPointer.x && event.clientY === active.startPointer.y) return;
    active.didMove = true;
    const delta = {
      x: (event.clientX - active.startPointer.x) / Math.max(zoomScale, 0.01),
      y: (event.clientY - active.startPointer.y) / Math.max(zoomScale, 0.01),
    };
    const next = active.mode === "move"
      ? moveStudioV2Rect(active.startRect, delta, bounds)
      : aspectRatio
        ? resizeStudioV2RectWithAspectRatio(active.startRect, active.mode, delta, bounds, aspectRatio, 1)
        : resizeStudioV2Rect(active.startRect, active.mode, delta, bounds, 1);
    rectRef.current = next;
    onDraftChange(next);
  };

  const finishPointer = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const active = activePointerRef.current;
    if (!active) return;
    event.stopPropagation();
    const captureTarget = event.currentTarget;
    if (captureTarget.hasPointerCapture(active.pointerId)) {
      captureTarget.releasePointerCapture(active.pointerId);
    }
    activePointerRef.current = null;
    if (commit && active.didMove) void onCommit(rectRef.current);
  };

  const beginPointer = (event: React.PointerEvent<HTMLElement>, mode: "move" | StudioV2ResizeHandle) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const startRect = clampStudioV2Rect(rectRef.current, bounds, 1);
    rectRef.current = startRect;
    activePointerRef.current = {
      pointerId: event.pointerId,
      mode,
      startPointer: { x: event.clientX, y: event.clientY },
      startRect,
      didMove: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const amount = event.shiftKey ? 10 : 1;
    const direction = event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "ArrowLeft" ? "left" : "right";
    const next = nudgeStudioV2Rect(rectRef.current, direction, amount, bounds);
    rectRef.current = next;
    onDraftChange(next);
    void onCommit(next);
  };

  return (
    <div
      data-testid={`studio-interactive-overlay-${overlayId}`}
      data-overlay-id={overlayId}
      role="group"
      aria-label={label}
      tabIndex={0}
      className={`absolute z-30 outline-none ${selected ? "ring-2 ring-[var(--studio-border-active)] ring-offset-1 ring-offset-transparent" : "hover:ring-1 hover:ring-[var(--studio-border-hover)]"}`}
      style={{ left: `${rect.x * zoomScale}px`, top: `${rect.y * zoomScale}px`, width: `${rect.width * zoomScale}px`, height: `${rect.height * zoomScale}px` }}
      onPointerDown={(event) => beginPointer(event, "move")}
      onPointerMove={updateFromPointer}
      onPointerUp={(event) => finishPointer(event, true)}
      onPointerCancel={(event) => finishPointer(event, false)}
      // Pointer-up/cancel owns cleanup. Browsers may deliver
      // lostpointercapture before pointerup when the moving element rerenders;
      // clearing here would lose the one commit at the interaction boundary.
      onLostPointerCapture={() => undefined}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onDoubleClick={(event) => { event.stopPropagation(); onSelect(); onDoubleClick?.(); }}
      onKeyDown={handleKeyDown}
    >
      {children}
      {selected && resizeEnabled && (resizeHandles ?? (Object.keys(HANDLE_CLASSES) as StudioV2ResizeHandle[])).map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={HANDLE_LABELS[handle]}
          title={HANDLE_LABELS[handle]}
          className={`absolute z-30 h-3 w-3 rounded-full border border-[var(--studio-border-active)] bg-[var(--studio-surface)] shadow-sm ${HANDLE_CLASSES[handle]}`}
          onPointerDown={(event) => beginPointer(event, handle)}
          onClick={(event) => event.stopPropagation()}
        />
      ))}
    </div>
  );
};
