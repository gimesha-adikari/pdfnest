import { PreviewKey, PreviewResource } from "./types";

export interface PreviewCacheOptions {
    /** Maximum number of preview resources to hold in memory (default: 32) */
    capacity?: number;
}

export class PreviewCache {
    private readonly maxCapacity: number;
    /** Map of cache entries preserving insertion order for LRU behavior */
    private readonly entries = new Map<PreviewKey, PreviewResource>();
    /** Reference count for each stored or retained PreviewResource */
    private readonly refCounts = new Map<PreviewResource, number>();

    constructor(options: PreviewCacheOptions = {}) {
        const capacity = options.capacity ?? 32;
        if (capacity <= 0) {
            throw new Error("PreviewCache capacity must be a positive integer.");
        }
        this.maxCapacity = capacity;
    }

    /** Current number of cached entries */
    get size(): number {
        return this.entries.size;
    }

    /** Configured maximum capacity */
    get capacity(): number {
        return this.maxCapacity;
    }

    has(key: PreviewKey): boolean {
        return this.entries.has(key);
    }

    /** Retrieve a resource and promote it to most‑recently‑used */
    get(key: PreviewKey): PreviewResource | undefined {
        const resource = this.entries.get(key);
        if (!resource) {
            return undefined;
        }
        // Refresh LRU order
        this.entries.delete(key);
        this.entries.set(key, resource);
        return resource;
    }

    /** Insert or replace a resource */
    set(key: PreviewKey, resource: PreviewResource): void {
        const existing = this.entries.get(key);
        if (existing) {
            // Same object -> treat as a refresh, no ref‑count change
            if (existing === resource) {
                this.entries.delete(key);
                this.entries.set(key, resource);
                return;
            }
            // Different object: replace and adjust reference counts
            this.entries.delete(key);
            this.entries.set(key, resource);
            this.decrementRef(existing);
            this.incrementRef(resource);
            return;
        }

        // Evict LRU if necessary
        if (this.entries.size >= this.maxCapacity) {
            const lruKey = this.entries.keys().next().value;
            if (lruKey !== undefined) {
                const lruResource = this.entries.get(lruKey);
                this.entries.delete(lruKey);
                if (lruResource) {
                    this.decrementRef(lruResource);
                }
            }
        }

        this.entries.set(key, resource);
        this.incrementRef(resource);
    }

    delete(key: PreviewKey): boolean {
        const resource = this.entries.get(key);
        if (!resource) {
            return false;
        }
        this.entries.delete(key);
        this.decrementRef(resource);
        return true;
    }

    clear(): void {
        for (const resource of this.entries.values()) {
            this.decrementRef(resource);
        }
        this.entries.clear();
    }

    /**
     * Invalidate all cache entries belonging to a document.
     * If `version` is omitted, all versions of the document are removed.
     * Returns the number of entries removed.
     */
    invalidateDocument(documentId: string, version?: string): number {
        const prefix = version !== undefined
            ? `${documentId}:${version}:`
            : `${documentId}:`;
        const toDelete: PreviewKey[] = [];
        for (const key of this.entries.keys()) {
            if (key.startsWith(prefix)) {
                toDelete.push(key);
            }
        }
        for (const key of toDelete) {
            const resource = this.entries.get(key);
            this.entries.delete(key);
            if (resource) {
                this.decrementRef(resource);
            }
        }
        return toDelete.length;
    }

    /** Increment reference count for a resource (internal or external) */
    private incrementRef(resource: PreviewResource): void {
        const count = this.refCounts.get(resource) ?? 0;
        this.refCounts.set(resource, count + 1);
    }

    /** Decrement reference count and revoke when it reaches zero */
    private decrementRef(resource: PreviewResource): void {
        const count = this.refCounts.get(resource);
        if (count === undefined) {
            return;
        }
        if (count <= 1) {
            this.refCounts.delete(resource);
            this.safeRevoke(resource);
        } else {
            this.refCounts.set(resource, count - 1);
        }
    }

    /** Execute a resource's revoke callback safely */
    private safeRevoke(resource: PreviewResource): void {
        const revokeFn = resource.revoke;
        if (typeof revokeFn === "function") {
            try {
                revokeFn();
            } catch (err) {
                console.warn("PreviewCache: error during resource revocation", err);
            }
        }
    }

    /**
     * Public API for external owners (e.g., PreviewManager) to retain a resource.
     * Increments the internal reference count without needing a cache key.
     */
    retain(resource: PreviewResource): void {
        this.incrementRef(resource);
    }

    /**
     * Public API for external owners to release a previously retained resource.
     * Decrements the reference count and revokes when the count drops to zero.
     */
    release(resource: PreviewResource): void {
        this.decrementRef(resource);
    }
}
