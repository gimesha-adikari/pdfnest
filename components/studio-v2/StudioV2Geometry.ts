export interface StudioV2Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type StudioV2ResizeHandle =
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "north-west"
  | "south-east"
  | "south-west";

export interface StudioV2Bounds {
  width: number;
  height: number;
}

export function normalizeStudioV2Rect(rect: StudioV2Rect): StudioV2Rect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

export function clampStudioV2Rect(
  rect: StudioV2Rect,
  bounds: StudioV2Bounds,
  minSize = 1,
): StudioV2Rect {
  const normalized = normalizeStudioV2Rect(rect);
  const width = Math.min(Math.max(normalized.width, minSize), bounds.width);
  const height = Math.min(Math.max(normalized.height, minSize), bounds.height);
  return {
    x: Math.min(Math.max(normalized.x, 0), Math.max(0, bounds.width - width)),
    y: Math.min(Math.max(normalized.y, 0), Math.max(0, bounds.height - height)),
    width,
    height,
  };
}

export function moveStudioV2Rect(
  rect: StudioV2Rect,
  delta: { x: number; y: number },
  bounds: StudioV2Bounds,
): StudioV2Rect {
  const current = clampStudioV2Rect(rect, bounds, 0);
  return {
    ...current,
    x: Math.min(Math.max(current.x + delta.x, 0), Math.max(0, bounds.width - current.width)),
    y: Math.min(Math.max(current.y + delta.y, 0), Math.max(0, bounds.height - current.height)),
  };
}

export function resizeStudioV2Rect(
  rect: StudioV2Rect,
  handle: StudioV2ResizeHandle,
  delta: { x: number; y: number },
  bounds: StudioV2Bounds,
  minSize = 1,
): StudioV2Rect {
  const start = clampStudioV2Rect(rect, bounds, minSize);
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("west")) left = Math.min(Math.max(start.x + delta.x, 0), right - minSize);
  if (handle.includes("east")) right = Math.max(Math.min(start.x + start.width + delta.x, bounds.width), left + minSize);
  if (handle.includes("north")) top = Math.min(Math.max(start.y + delta.y, 0), bottom - minSize);
  if (handle.includes("south")) bottom = Math.max(Math.min(start.y + start.height + delta.y, bounds.height), top + minSize);

  return clampStudioV2Rect({ x: left, y: top, width: right - left, height: bottom - top }, bounds, minSize);
}

export function resizeStudioV2RectWithAspectRatio(
  rect: StudioV2Rect,
  handle: StudioV2ResizeHandle,
  delta: { x: number; y: number },
  bounds: StudioV2Bounds,
  aspectRatio: number,
  minSize = 1,
): StudioV2Rect {
  const start = clampStudioV2Rect(rect, bounds, minSize);
  if (!handle.includes("-")) return resizeStudioV2Rect(start, handle, delta, bounds, minSize);
  const free = resizeStudioV2Rect(start, handle, delta, bounds, minSize);
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : start.width / start.height;
  let width = free.width;
  let height = free.height;
  if (Math.abs(free.width - start.width) >= Math.abs(free.height * ratio - start.width)) height = width / ratio;
  else width = height * ratio;
  width = Math.max(minSize, Math.min(width, bounds.width));
  height = Math.max(minSize, Math.min(height, bounds.height));
  const x = handle.includes("west") ? start.x + start.width - width : start.x;
  const y = handle.includes("north") ? start.y + start.height - height : start.y;
  return clampStudioV2Rect({ x, y, width, height }, bounds, minSize);
}

export function nudgeStudioV2Rect(
  rect: StudioV2Rect,
  direction: "up" | "down" | "left" | "right",
  amount: number,
  bounds: StudioV2Bounds,
): StudioV2Rect {
  const delta = {
    x: direction === "left" ? -amount : direction === "right" ? amount : 0,
    y: direction === "up" ? -amount : direction === "down" ? amount : 0,
  };
  return moveStudioV2Rect(rect, delta, bounds);
}

export type StudioV2CanonicalCropBox = [number, number, number, number];

function pageCropBase(
  dimensions: { width: number; height: number },
  cropBox?: number[] | null,
): StudioV2CanonicalCropBox {
  if (cropBox?.length === 4 && cropBox[2] > cropBox[0] && cropBox[3] > cropBox[1]) {
    return [cropBox[0], cropBox[1], cropBox[2], cropBox[3]];
  }
  return [0, 0, dimensions.width, dimensions.height];
}

export interface StudioV2PageGeometry {
  dimensions: { width: number; height: number };
  rotation: number;
  cropBox?: number[] | null;
}

export function getStudioV2VisiblePageSize(page: StudioV2PageGeometry): StudioV2Bounds {
  const [left, bottom, right, top] = pageCropBase(page.dimensions, page.cropBox);
  const width = right - left;
  const height = top - bottom;
  return page.rotation === 90 || page.rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

function visiblePointToCanonical(
  page: StudioV2PageGeometry,
  point: { x: number; y: number },
): { x: number; y: number } {
  const [left, bottom, right, top] = pageCropBase(page.dimensions, page.cropBox);
  switch (((page.rotation % 360) + 360) % 360) {
    case 90:
      return { x: left + point.y, y: bottom + point.x };
    case 180:
      return { x: right - point.x, y: bottom + point.y };
    case 270:
      return { x: right - point.y, y: top - point.x };
    default:
      return { x: left + point.x, y: top - point.y };
  }
}

function canonicalPointToVisible(
  page: StudioV2PageGeometry,
  point: { x: number; y: number },
): { x: number; y: number } {
  const [left, bottom, right, top] = pageCropBase(page.dimensions, page.cropBox);
  switch (((page.rotation % 360) + 360) % 360) {
    case 90:
      return { x: point.y - bottom, y: point.x - left };
    case 180:
      return { x: right - point.x, y: point.y - bottom };
    case 270:
      return { x: top - point.y, y: right - point.x };
    default:
      return { x: point.x - left, y: top - point.y };
  }
}

export function visibleStudioV2RectToCanonicalCrop(
  page: StudioV2PageGeometry,
  rect: StudioV2Rect,
): StudioV2CanonicalCropBox {
  const normalized = normalizeStudioV2Rect(rect);
  const points = [
    { x: normalized.x, y: normalized.y },
    { x: normalized.x + normalized.width, y: normalized.y },
    { x: normalized.x, y: normalized.y + normalized.height },
    { x: normalized.x + normalized.width, y: normalized.y + normalized.height },
  ].map((point) => visiblePointToCanonical(page, point));
  return [
    Math.min(...points.map((point) => point.x)),
    Math.min(...points.map((point) => point.y)),
    Math.max(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y)),
  ];
}

export function canonicalStudioV2CropToVisibleRect(
  page: StudioV2PageGeometry,
  cropBox: number[],
): StudioV2Rect {
  if (cropBox.length !== 4) return { x: 0, y: 0, width: 0, height: 0 };
  const points = [
    { x: cropBox[0], y: cropBox[1] },
    { x: cropBox[2], y: cropBox[1] },
    { x: cropBox[0], y: cropBox[3] },
    { x: cropBox[2], y: cropBox[3] },
  ].map((point) => canonicalPointToVisible(page, point));
  return {
    x: Math.min(...points.map((point) => point.x)),
    y: Math.min(...points.map((point) => point.y)),
    width: Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    height: Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
  };
}

export function roundStudioV2CropBox(cropBox: number[], precision = 2): number[] {
  const factor = 10 ** precision;
  return cropBox.map((value) => Math.round(value * factor) / factor);
}

/** Convert a page-local VDM overlay rectangle [x, y, width, height] into the
 * visible top-left-origin rectangle used by the Canvas. */
export function canonicalStudioV2OverlayToVisibleRect(
  page: StudioV2PageGeometry,
  rect: number[],
): StudioV2Rect {
  if (rect.length < 4) return { x: 0, y: 0, width: 0, height: 0 };
  return canonicalStudioV2CropToVisibleRect(page, [rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]]);
}

/** Convert a visible rectangle back to the VDM overlay [x, y, width, height]. */
export function visibleStudioV2RectToCanonicalOverlay(
  page: StudioV2PageGeometry,
  rect: StudioV2Rect,
): [number, number, number, number] {
  const crop = visibleStudioV2RectToCanonicalCrop(page, rect);
  return [crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]];
}

/** Conservative browser hit-box estimate matching the backend's Helvetica
 * preview/finalizer contract without inventing a second text layout engine. */
export function getStudioV2TextOverlaySize(text: string, fontSize: number): StudioV2Bounds {
  const lines = text.split(/\r?\n/);
  const longestLine = Math.max(1, ...lines.map((line) => [...line].length));
  return {
    width: Math.max(fontSize, longestLine * fontSize * 0.55 + 8),
    height: Math.max(fontSize, lines.length * fontSize * 1.2),
  };
}
