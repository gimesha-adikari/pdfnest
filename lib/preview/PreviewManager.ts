// pdfnest/lib/preview/PreviewManager.ts

import { PreviewRequest, PreviewResource, PreviewKey, createPreviewKey, PreviewRenderer, PreviewResult, PreviewError } from "./types";
import { PreviewCache } from "./PreviewCache";

/**
 * Core orchestration layer for preview rendering. Handles request normalization, cache lookup,
 * in‑flight deduplication, renderer selection, subscriber management, and resource ownership.
 */
export class PreviewManager {
    private readonly cache: PreviewCache;
    private readonly renderers = new Map<string, PreviewRenderer>();
    // In‑flight render operations keyed by canonical PreviewKey
    private readonly inflight = new Map<PreviewKey, InflightEntry>();
    // Manager‑owned retained references count per resource
    private readonly managerRetainedRefs = new Map<PreviewResource, number>();
    // Disposed flag
    private disposed = false;

    // Bounded Render Queue settings
    private readonly maxConcurrency: number;
    private activeCount = 0;
    private readonly renderQueue: Array<{
        key: PreviewKey;
        request: PreviewRequest;
        renderer: PreviewRenderer;
        controller: AbortController;
        deferredResolve: (res: PreviewResource) => void;
        deferredReject: (err: unknown) => void;
    }> = [];

    constructor(cache?: PreviewCache, options?: { maxConcurrency?: number }) {
        this.cache = cache ?? new PreviewCache();
        this.maxConcurrency = options?.maxConcurrency ?? 2;
    }

    /** Register a renderer with a unique identifier. */
    registerRenderer(renderer: PreviewRenderer): void {
        this.renderers.set(renderer.id, renderer);
    }

    /** Unregister a renderer by its identifier. */
    unregisterRenderer(id: string): void {
        this.renderers.delete(id);
    }

    /** Abort all in‑flight renders and notify active subscribers of cancellation. */
    clear(): void {
        this.renderQueue.length = 0;
        for (const [key, entry] of this.inflight.entries()) {
            entry.controller.abort();
            const cancelErr: PreviewError = { code: "CANCELLED", message: "Preview request cancelled by clear()" };
            const result: PreviewResult = {
                status: "error",
                resource: null,
                error: cancelErr,
                isLoading: false,
                isSuccess: false,
                isError: true,
            };
            for (const sub of entry.subscribers) {
                sub(result, null);
            }
        }
        this.inflight.clear();
        // does NOT release manager‑retained resources
    }

    /** Abort all in‑flight renders, release retained resources, and mark manager as disposed. */
    dispose(): void {
        if (this.disposed) return;
        this.clear();
        // Release all manager‑retained resources exactly once
        for (const [resource, count] of this.managerRetainedRefs.entries()) {
            for (let i = 0; i < count; i++) {
                this.cache.release(resource);
            }
        }
        this.managerRetainedRefs.clear();
        this.disposed = true;
    }

    /** Direct cache lookup without triggering rendering. */
    getCached(request: PreviewRequest): PreviewResource | undefined {
        const key = createPreviewKey(request);
        return this.cache.get(key);
    }

    /** Request a preview. Returns a handle for subscription and cancellation. */
    request(request: PreviewRequest): PreviewHandle {
        if (this.disposed) {
            throw new Error("PreviewManager disposed");
        }
        const key = createPreviewKey(request);
        const cached = this.cache.get(key);
        const handle = new PreviewHandleImpl(this, key);

        if (cached) {
            // Cache hit – store pending result; retain only when subscriber registers.
            const result: PreviewResult = {
                status: "success",
                resource: cached,
                error: null,
                isLoading: false,
                isSuccess: true,
                isError: false,
            };
            handle._setPendingResult(result, cached);
            return handle;
        }

        // Not cached – deduplicate in‑flight work.
        let entry = this.inflight.get(key);
        if (!entry) {
            const controller = new AbortController();
            const renderer = this._selectRenderer(request);
            if (!renderer) {
                const err: PreviewError = { code: "NO_RENDERER", message: "No suitable renderer registered" };
                const result: PreviewResult = {
                    status: "error",
                    resource: null,
                    error: err,
                    isLoading: false,
                    isSuccess: false,
                    isError: true,
                };
                handle._setPendingResult(result, null);
                return handle;
            }

            let deferredResolve!: (res: PreviewResource) => void;
            let deferredReject!: (err: unknown) => void;

            const promise = new Promise<PreviewResource>((resolve, reject) => {
                deferredResolve = resolve;
                deferredReject = reject;
            });

            // Prevent unhandled promise rejection warnings on initial queueing
            promise.catch(() => {});

            entry = { controller, subscribers: new Set(), promise };
            this.inflight.set(key, entry);

            let syncErrorResult: PreviewResult | null = null;

            this.renderQueue.push({
                key,
                request,
                renderer,
                controller,
                deferredResolve,
                deferredReject,
            });

            promise
                .then((resource) => {
                    if (this.inflight.get(key) !== entry) return; // stale result
                    this.cache.set(key, resource);
                    for (const sub of entry!.subscribers) {
                        this._incrementManagerRetain(resource);
                        sub({
                            status: "success",
                            resource,
                            error: null,
                            isLoading: false,
                            isSuccess: true,
                            isError: false,
                        }, resource);
                    }
                    this.inflight.delete(key);
                })
                .catch((e: unknown) => {
                    if (this.inflight.get(key) !== entry) return; // stale result
                    const isAbort = typeof e === "object" && e !== null && "name" in e && (e as { name: unknown }).name === "AbortError";
                    if (isAbort) {
                        this.inflight.delete(key);
                        return;
                    }
                    const previewErr = this.normalizeError(e);
                    const result: PreviewResult = {
                        status: "error",
                        resource: null,
                        error: previewErr,
                        isLoading: false,
                        isSuccess: false,
                        isError: true,
                    };
                    syncErrorResult = result;
                    for (const sub of entry!.subscribers) {
                        sub(result, null);
                    }
                    this.inflight.delete(key);
                });

            // Register subscriber for (new or existing) in‑flight entry.
            entry.subscribers.add(handle._callbackBound);
            this._processQueue();

            if (syncErrorResult) {
                handle._setPendingResult(syncErrorResult, null);
            }
            return handle;
        }

        // Register subscriber for (new or existing) in‑flight entry.
        entry.subscribers.add(handle._callbackBound);
        this._processQueue();
        return handle;
    }

    private _processQueue(): void {
        while (this.activeCount < this.maxConcurrency && this.renderQueue.length > 0) {
            const task = this.renderQueue.shift();
            if (!task) break;

            if (task.controller.signal.aborted || !this.inflight.has(task.key)) {
                continue;
            }

            const entry = this.inflight.get(task.key);
            if (!entry || entry.subscribers.size === 0) {
                this.inflight.delete(task.key);
                continue;
            }

            this.activeCount++;

            try {
                const resultOrPromise = task.renderer.render(task.request, task.controller.signal);
                Promise.resolve(resultOrPromise)
                    .then((res) => task.deferredResolve(res))
                    .catch((err) => task.deferredReject(err))
                    .finally(() => {
                        this.activeCount = Math.max(0, this.activeCount - 1);
                        this._processQueue();
                    });
            } catch (syncErr) {
                const isAbort = typeof syncErr === "object" && syncErr !== null && "name" in syncErr && (syncErr as { name: unknown }).name === "AbortError";
                if (!isAbort) {
                    const previewErr = this.normalizeError(syncErr);
                    const result: PreviewResult = {
                        status: "error",
                        resource: null,
                        error: previewErr,
                        isLoading: false,
                        isSuccess: false,
                        isError: true,
                    };
                    const entry = this.inflight.get(task.key);
                    if (entry) {
                        for (const sub of entry.subscribers) {
                            sub(result, null);
                        }
                        this.inflight.delete(task.key);
                    }
                }
                task.deferredReject(syncErr);
                this.activeCount = Math.max(0, this.activeCount - 1);
                this._processQueue();
            }
        }
    }

    /** Simple deterministic renderer selection respecting request.renderer preference. */
    private _selectRenderer(request: PreviewRequest): PreviewRenderer | undefined {
        const pref = request.renderer ?? "auto";
        for (const renderer of this.renderers.values()) {
            if (!renderer.canRender(request)) continue;
            const caps = renderer.capabilities;
            if (pref === "client" && caps.client) return renderer;
            if (pref === "server" && caps.server) return renderer;
            if (pref === "auto") return renderer;
        }
        return undefined;
    }

    /** Called by a handle when a subscriber unsubscribes. */
    _removeSubscriber(key: PreviewKey, cb: (result: PreviewResult, resource: PreviewResource | null) => void, retained: PreviewResource | null): void {
        const entry = this.inflight.get(key);
        if (entry) {
            entry.subscribers.delete(cb);
            if (entry.subscribers.size === 0) {
                entry.controller.abort();
                this.inflight.delete(key);
            }
        }
        if (retained) {
            this._releaseManagerRetain(retained);
        }
    }

    _incrementManagerRetain(resource: PreviewResource): void {
        const count = this.managerRetainedRefs.get(resource) ?? 0;
        this.managerRetainedRefs.set(resource, count + 1);
        this.cache.retain(resource);
    }

    private _releaseManagerRetain(resource: PreviewResource): void {
        const count = this.managerRetainedRefs.get(resource) ?? 0;
        if (count > 1) {
            this.managerRetainedRefs.set(resource, count - 1);
            this.cache.release(resource);
        } else if (count === 1) {
            this.managerRetainedRefs.delete(resource);
            this.cache.release(resource);
        }
    }

    /** Normalize an unknown error into a PreviewError with guaranteed string code. */
    private normalizeError(err: unknown): PreviewError {
        let code = "UNKNOWN";
        let message = "An unknown error occurred";
        let status: number | undefined;

        if (typeof err === "object" && err !== null) {
            const obj = err as Record<string, unknown>;
            if (obj.code !== undefined && obj.code !== null) {
                code = String(obj.code);
            }
            if (typeof obj.message === "string" && obj.message.length > 0) {
                message = obj.message;
            } else if (err instanceof Error) {
                message = err.message;
            }
            if (typeof obj.status === "number") {
                status = obj.status;
            }
        } else if (typeof err === "string" && err.length > 0) {
            message = err;
        } else if (err !== undefined && err !== null) {
            message = String(err);
        }

        const previewErr: PreviewError = {
            code,
            message,
            cause: err,
        };
        if (status !== undefined) {
            previewErr.status = status;
        }
        return previewErr;
    }
}

/** Internal representation of an in‑flight render. */
interface InflightEntry {
    controller: AbortController;
    subscribers: Set<(result: PreviewResult, resource: PreviewResource | null) => void>;
    promise: Promise<PromiseLike<PreviewResource> | PreviewResource>;
}

/** Public handle returned to callers. */
export class PreviewHandle {
    /** Subscribe to updates (will be called once with success or error). */
    subscribe(_: (result: PreviewResult) => void): void {}
    /** Unsubscribe and release any retained resource. */
    unsubscribe(): void {}
}

/** Concrete implementation used internally by PreviewManager. */
class PreviewHandleImpl extends PreviewHandle {
    private readonly manager: PreviewManager;
    private readonly key: PreviewKey;
    private _callback?: (result: PreviewResult) => void;
    private _retained: PreviewResource | null = null;
    private _subscribed = false;
    private _terminated = false;
    private _pendingResult?: PreviewResult;
    private _pendingResource?: PreviewResource | null;

    readonly _callbackBound = (result: PreviewResult, resource: PreviewResource | null) => {
        if (resource) this._retained = resource;
        const cb = this._callback;
        if (cb) {
            this._callback = undefined;
            cb(result);
        } else {
            this._pendingResult = result;
            this._pendingResource = resource;
        }
    };

    constructor(manager: PreviewManager, key: PreviewKey) {
        super();
        this.manager = manager;
        this.key = key;
    }

    subscribe(cb: (result: PreviewResult) => void): void {
        if (this._subscribed || this._terminated) return;
        this._subscribed = true;
        this._callback = cb;
        if (this._pendingResult) {
            if (this._pendingResource) {
                this.manager._incrementManagerRetain(this._pendingResource);
                this._retained = this._pendingResource;
            }
            const pendingCb = this._callback;
            this._callback = undefined;
            pendingCb(this._pendingResult);
        }
    }

    /** Store a result that will be delivered when/if a subscriber registers. */
    _setPendingResult(result: PreviewResult, resource: PreviewResource | null): void {
        this._pendingResult = result;
        this._pendingResource = resource;
        if (this._subscribed && !this._terminated && this._callback) {
            if (resource) {
                this.manager._incrementManagerRetain(resource);
                this._retained = resource;
            }
            const cb = this._callback;
            this._callback = undefined;
            cb(result);
        }
    }

    unsubscribe(): void {
        if (this._terminated) return;
        this._terminated = true;
        this.manager._removeSubscriber(this.key, this._callbackBound, this._retained);
        this._callback = undefined;
        this._retained = null;
        this._subscribed = false;
    }
}

export type { PreviewResult, PreviewError };
