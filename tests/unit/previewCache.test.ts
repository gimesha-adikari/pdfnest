import { PreviewCache } from "../../lib/preview/PreviewCache";
import { createPreviewKey, PreviewRequest, PreviewResource } from "../../lib/preview/types";

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function makeMockRequest(docId: string, version: string, page: number, width?: number, height?: number): PreviewRequest {
    return {
        document: {
            id: docId,
            version,
            pageCount: 10,
        },
        page,
        width,
        height,
    };
}

function runTests() {
    console.log("Running PreviewCache Ownership Tests...");

    // 1. set/get basic (existing test retained)
    {
        const cache = new PreviewCache({ capacity: 5 });
        const req = makeMockRequest("doc1", "v1", 1);
        const key = createPreviewKey(req);
        const res: PreviewResource = { type: "image-url", url: "blob:test-1" };
        cache.set(key, res);
        assert(cache.has(key), "Cache should have key after set");
        assert(cache.get(key) === res, "Cache get should return stored resource");
        assert(cache.size === 1, "Cache size should be 1");
    }

    // 2. same resource under multiple keys (ref counting)
    {
        const cache = new PreviewCache({ capacity: 5 });
        const revokes: string[] = [];
        const sharedRes: PreviewResource = {
            type: "image-url",
            url: "blob:shared",
            revoke: () => revokes.push("revoked"),
        };
        const keyA = createPreviewKey(makeMockRequest("docA", "v1", 1));
        const keyB = createPreviewKey(makeMockRequest("docA", "v1", 2));
        cache.set(keyA, sharedRes);
        cache.set(keyB, sharedRes);
        // Both entries present; revoke should not have fired yet
        assert(revokes.length === 0, "Revoke should not fire while both keys exist");
        // Delete one key – still referenced by other key
        cache.delete(keyA);
        assert(revokes.length === 0, "Revoke should not fire after deleting one of multiple keys");
        // Delete second key – now count reaches zero, revoke should fire once
        cache.delete(keyB);
        assert(revokes.length === 1, "Revoke should fire exactly once after last reference removed");
    }

    // 3. replacement with same resource object (no double revoke)
    {
        const cache = new PreviewCache({ capacity: 5 });
        let revokeCount = 0;
        const res: PreviewResource = { type: "image-url", url: "blob:res", revoke: () => revokeCount++ };
        const key = createPreviewKey(makeMockRequest("doc1", "v1", 1));
        cache.set(key, res);
        // replace with identical object
        cache.set(key, res);
        // No revoke should have happened yet
        assert(revokeCount === 0, "Revoke should not fire on replace with same object");
        cache.delete(key);
        assert(revokeCount === 1, "Revoke should fire once after final delete");
    }

    // 4. eviction triggers revoke when ref count reaches zero
    {
        const cache = new PreviewCache({ capacity: 2 });
        let revoked = false;
        const resEvict: PreviewResource = { type: "image-url", url: "blob:evict", revoke: () => { revoked = true; } };
        const k1 = createPreviewKey(makeMockRequest("doc1", "v1", 1));
        const k2 = createPreviewKey(makeMockRequest("doc1", "v1", 2));
        const k3 = createPreviewKey(makeMockRequest("doc1", "v1", 3));
        cache.set(k1, resEvict);
        cache.set(k2, { type: "image-url", url: "blob:stay" });
        // Adding third entry evicts LRU (k1)
        cache.set(k3, { type: "image-url", url: "blob:new" });
        assert(revoked, "Evicted resource should be revoked");
    }

    // 5. invalidateDocument removes correct keys and revokes once
    {
        const cache = new PreviewCache({ capacity: 10 });
        let revokes = 0;
        const res1: PreviewResource = { type: "image-url", url: "blob:1", revoke: () => revokes++ };
        const res2: PreviewResource = { type: "image-url", url: "blob:2", revoke: () => revokes++ };
        const k1 = createPreviewKey(makeMockRequest("docX", "v1", 1));
        const k2 = createPreviewKey(makeMockRequest("docX", "v2", 1));
        const k3 = createPreviewKey(makeMockRequest("docY", "v1", 1));
        cache.set(k1, res1);
        cache.set(k2, res2);
        cache.set(k3, { type: "image-url", url: "blob:3" });
        const removed = cache.invalidateDocument("docX");
        assert(removed === 2, "Should remove two entries for docX");
        assert(revokes === 2, "Both resources for docX should be revoked once each");
        // ensure docY entry still present
        assert(cache.has(k3), "docY entry must remain");
    }

    // 6. revoke callback throwing does not break cache
    {
        const cache = new PreviewCache({ capacity: 5 });
        const res: PreviewResource = {
            type: "image-url",
            url: "blob:error",
            revoke: () => { throw new Error("revoke failure"); },
        };
        const key = createPreviewKey(makeMockRequest("docE", "v1", 1));
        cache.set(key, res);
        // Deleting should catch error internally and not throw
        cache.delete(key);
        // If we reach here without exception, test passes
    }

    console.log("ALL PREVIEWCACHE OWNERSHIP TESTS PASSED");
}

runTests();
