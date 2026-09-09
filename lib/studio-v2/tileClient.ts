const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
const API_BASE_URL = rawBaseUrl.endsWith("/api")
  ? `${rawBaseUrl}/studio/v1`
  : `${rawBaseUrl}/api/studio/v1`;

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

const MAX_CONCURRENT_TILE_REQUESTS = 2;
const MAX_BUSY_RETRIES = 1;

export class StudioTileRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, statusText: string, retryAfterMs: number | null) {
    super(`Tile request failed: status=${status} ${statusText}`);
    this.name = "StudioTileRequestError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
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

interface SharedTileRequest {
  controller: AbortController;
  consumers: number;
  promise: Promise<string>;
}

/**
 * Keeps the Studio canvas from overwhelming the worker render limiter. The
 * worker remains the authority on capacity; this client-side coordinator only
 * makes the normal viewport demand bounded and coalesces identical tiles.
 */
class TileRequestCoordinator {
  private active = 0;
  private queue: Array<() => void> = [];
  private inFlight = new Map<string, SharedTileRequest>();

  private async schedule<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT_TILE_REQUESTS) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }

  get(
    key: string,
    work: (signal: AbortSignal) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    let shared = this.inFlight.get(key);
    if (!shared) {
      const controller = new AbortController();
      const promise = this.schedule(() => work(controller.signal));
      shared = { controller, consumers: 0, promise };
      this.inFlight.set(key, shared);
      void promise.then(
        () => this.inFlight.delete(key),
        () => this.inFlight.delete(key),
      );
    }

    shared.consumers += 1;
    return this.waitForConsumer(shared, signal);
  }

  private waitForConsumer(shared: SharedTileRequest, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        shared.consumers -= 1;
        if (shared.consumers === 0) shared.controller.abort();
      };
      const onAbort = () => {
        release();
        reject(new DOMException("The operation was aborted", "AbortError"));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      shared.promise.then(
        (value) => {
          if (settled) return;
          release();
          resolve(value);
        },
        (error) => {
          if (settled) return;
          release();
          reject(error);
        },
      );
    });
  }
}

const globalTileRequests = new TileRequestCoordinator();

function tileCacheKey(
  sessionId: string,
  versionId: string,
  pageId: string,
  options?: TileOptions,
): string {
  return `${sessionId}:${versionId}:${pageId}:s${options?.scale || 1.5}:x${options?.tileX || 0}:y${options?.tileY || 0}:w${options?.tileW || 0}:h${options?.tileH || 0}`;
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("Retry-After");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, 5000);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function buildTileUrl(
  sessionId: string,
  versionId: string,
  pageId: string,
  options?: TileOptions
): string {
  const url = new URL(
    `${API_BASE_URL}/sessions/${sessionId}/versions/${versionId}/pages/${pageId}/tile`
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
  const cacheKey = tileCacheKey(sessionId, versionId, pageId, options);

  const cached = globalTileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  return globalTileRequests.get(cacheKey, async (requestSignal) => {
    const url = buildTileUrl(sessionId, versionId, pageId, options);
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        signal: requestSignal,
      });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        globalTileCache.set(cacheKey, objectUrl);
        return objectUrl;
      }
      const retryMs = retryAfterMs(response);
      if (response.status === 429 && attempt < MAX_BUSY_RETRIES) {
        await delay(retryMs ?? 2000, requestSignal);
        continue;
      }
      throw new StudioTileRequestError(response.status, response.statusText, retryMs);
    }
  }, options?.signal);
}
