export interface StudioV2PopoverRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface StudioV2PopoverPositionInput {
  triggerRect: StudioV2PopoverRect;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
}

export interface StudioV2PopoverPosition {
  top: number;
  left: number;
  width: number;
  placement: "below" | "above" | "clamped";
}

export function getStudioV2PopoverPosition({
  triggerRect,
  popoverWidth,
  popoverHeight,
  viewportWidth,
  viewportHeight,
  gap = 8,
  margin = 12,
}: StudioV2PopoverPositionInput): StudioV2PopoverPosition {
  const width = Math.max(0, Math.min(popoverWidth, Math.max(0, viewportWidth - margin * 2)));
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const startLeft = triggerRect.left;
  const rightAlignedLeft = triggerRect.right - width;
  const left = startLeft + width <= viewportWidth - margin
    ? Math.max(margin, startLeft)
    : Math.min(maxLeft, Math.max(margin, rightAlignedLeft));
  const maxTop = Math.max(margin, viewportHeight - popoverHeight - margin);
  const belowTop = triggerRect.bottom + gap;
  const aboveTop = triggerRect.top - popoverHeight - gap;

  if (belowTop + popoverHeight <= viewportHeight - margin) {
    return { top: belowTop, left, width, placement: "below" };
  }
  if (aboveTop >= margin) {
    return { top: aboveTop, left, width, placement: "above" };
  }
  return { top: Math.min(maxTop, Math.max(margin, belowTop)), left, width, placement: "clamped" };
}
