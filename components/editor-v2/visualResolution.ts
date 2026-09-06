export const STUDIO_TILE_SCALE_BUCKETS = [0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
export const STUDIO_TILE_MIN_SCALE = STUDIO_TILE_SCALE_BUCKETS[0];
export const STUDIO_TILE_MAX_SCALE = STUDIO_TILE_SCALE_BUCKETS[STUDIO_TILE_SCALE_BUCKETS.length - 1];

export interface StudioVisualResolutionInput {
  pageWidthPt: number;
  zoom: number;
  devicePixelRatio: number;
}

export interface StudioVisualResolution {
  displayedWidthCss: number;
  targetWidthPx: number;
  requiredScale: number;
  scale: number;
  requestedWidthPx: number;
}

const finitePositive = (value: number, fallback: number): number => Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Select the smallest bounded Studio tile scale that can cover the raster
 * width actually displayed by SharedEditor. The editor's logical page
 * coordinates remain in PDF points; this only changes the source image
 * resolution.
 */
export function studioVisualResolution({ pageWidthPt, zoom, devicePixelRatio }: StudioVisualResolutionInput): StudioVisualResolution {
  const safePageWidth = finitePositive(pageWidthPt, 612);
  const safeZoom = Math.min(2, Math.max(0.5, finitePositive(zoom, 1)));
  const safeDpr = Math.min(4, Math.max(1, finitePositive(devicePixelRatio, 1)));
  const displayedWidthCss = safePageWidth * safeZoom;
  const targetWidthPx = displayedWidthCss * safeDpr;
  const requiredScale = targetWidthPx / safePageWidth;
  const scale = STUDIO_TILE_SCALE_BUCKETS.find((candidate) => candidate >= requiredScale) ?? STUDIO_TILE_MAX_SCALE;
  const requestedWidthPx = Math.max(1, Math.round(safePageWidth * scale));
  return { displayedWidthCss, targetWidthPx, requiredScale, scale, requestedWidthPx };
}
