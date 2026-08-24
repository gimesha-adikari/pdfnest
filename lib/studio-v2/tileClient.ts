const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

export interface TileOptions {
  scale?: number;
  tileX?: number;
  tileY?: number;
  tileW?: number;
  tileH?: number;
  signal?: AbortSignal;
}

export interface TileMetricsDTO {
  total_requests: number;
  cache_hits: number;
  cache_misses: number;
  render_errors: number;
}

class TileBlobCache {
  private cache = new Map<string, string>();
  private maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  get(key: string): string | undefined {
    const item = this.cache.get(key);
    if (item) {
      // Refresh recency
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, objectUrl: string): void {
    if (this.cache.has(key)) {
      const old = this.cache.get(key);
      if (old && old !== objectUrl) {
        URL.revokeObjectURL(old);
      }
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const oldUrl = this.cache.get(oldestKey);
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, objectUrl);
  }

  clear(): void {
    for (const url of this.cache.values()) {
      URL.revokeObjectURL(url);
    }
    this.cache.clear();
  }
}

export const globalTileCache = new TileBlobCache(250);

export function buildTileUrl(
  sessionId: string,
  versionId: string,
  pageId: string,
  options?: TileOptions
): string {
  const url = new URL(
    `${API_BASE_URL}/studio/v1/sessions/${sessionId}/versions/${versionId}/pages/${pageId}/tile`
  );
  if (options?.scale) {
    url.searchParams.set("scale", options.scale.toFixed(2));
  }
  if (options?.tileX !== undefined) {
    url.searchParams.set("tile_x", options.tileX.toString());
  }
  if (options?.tileY !== undefined) {
    url.searchParams.set("tile_y", options.tileY.toString());
  }
  if (options?.tileW !== undefined) {
    url.searchParams.set("tile_w", options.tileW.toString());
  }
  if (options?.tileH !== undefined) {
    url.searchParams.set("tile_h", options.tileH.toString());
  }
  return url.toString();
}

export async function fetchTileBlobUrl(
  sessionId: string,
  versionId: string,
  pageId: string,
  options?: TileOptions
): Promise<string> {
  const cacheKey = `${versionId}:${pageId}:s${options?.scale || 1.5}:x${options?.tileX || 0}:y${options?.tileY || 0}:w${options?.tileW || 0}:h${options?.tileH || 0}`;

  const cached = globalTileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = buildTileUrl(sessionId, versionId, pageId, options);
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(
      `Tile request failed: status=${response.status} ${response.statusText}`
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  globalTileCache.set(cacheKey, objectUrl);
  return objectUrl;
}
