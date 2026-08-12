# PreviewManager Correctness Review & Enhancements – Updated Plan

## Goal

Finalize a safe, deterministic **PreviewManager** core implementation before any real renderers are added. The focus is on resource lifecycle integrity, clear public API semantics, minimal renderer capability handling, and comprehensive observable‑behavior tests.

## User Review Required

> [!IMPORTANT]
> Approve the updated plan before any code changes are made. The plan now reflects all required adjustments.

## Open Questions

> [!WARNING]
> * **Dispose Error Handling** – The plan specifies that after `dispose()` the manager should throw `Error` on further `request()` calls. Confirm that a generic `Error` with message *"PreviewManager disposed"* is acceptable, or provide an alternative.
> * **Capability Field Naming** – The contract uses a mandatory `capabilities` object on `PreviewRenderer`. If you prefer a different name (e.g., `kind`), let me know.

## Revised Proposed Changes

---
### 1. Renderer Capability Contract (`pdfnest/lib/preview/types.ts`)
- Extend `PreviewRenderer` with a **required** field:
```ts
interface PreviewRenderer {
  readonly id: string;               // identity only
  readonly capabilities: {
    client: boolean;   // can render client‑side preview
    server: boolean;   // can render server‑side preview
  };
  render(request: PreviewRequest, signal: AbortSignal): Promise<PreviewResource>;
}
```
- The manager will select a renderer based on the request’s desired `renderer` value (`"client"`, `"server"`, or `"auto"`). Selection logic will inspect the `capabilities` object rather than the renderer ID string.
- No larger capability framework is introduced – the contract is minimal and required.

---
### 2. Manager Retained Ownership (`pdfnest/lib/preview/PreviewManager.ts`)
- Introduce an internal map **managerRetainedRefs**: `Map<PreviewResource, number>` to track how many active subscribers the manager is currently retaining for each resource.
- On **subscriber delivery**: manager increments the count (`retain`).
- On **subscriber unsubscribe**: manager decrements the count and releases the resource in the cache when the count reaches zero.
- On **dispose()**: iterate over `managerRetainedRefs` and release every retained reference, then clear the map.
- This ensures the invariant *“Every retain has exactly one manager‑owned release”* and avoids double‑release.

---
### 3. Clear vs Dispose Contract
- **clear()**
  - Abort all in‑flight renders.
  - Remove transient `inflight` bookkeeping.
  - **Do NOT** release resources retained by subscribers.
  - **Do NOT** clear `PreviewCache`.
  - **Do NOT** mark the manager as permanently unusable.
- **dispose()**
  - Perform the same abort/cleanup as `clear()`.
  - Release **all** manager‑owned retained resources via `managerRetainedRefs`.
  - Mark the manager as *disposed*; subsequent `request()` calls throw an error.
- Both methods are public; `dispose()` is the definitive shutdown operation.

---
### 4. Stale‑Result Protection
- Identical requests for an active PreviewKey join the existing in‑flight entry. If an in‑flight entry has been cancelled/removed and a later request creates a new entry, the old entry's identity is no longer current. If the old renderer later resolves, its result must be ignored and must not be cached or delivered.

---
### 5. Handle API (`PreviewHandle`)
- Public API remains:
```ts
const handle = manager.request(request);
handle.subscribe(callback);
handle.unsubscribe();
```
- **subscribe** may be called at most once; a second call will be ignored or throw (deterministic behavior documented).
- **unsubscribe** is idempotent.
- An active subscriber receives exactly one terminal callback. A subscriber that unsubscribes before completion receives zero callbacks. No callback is delivered after unsubscribe.
- No other public methods are exposed.

---
### 6. Cache‑Hit Delivery without setTimeout
- When `request()` finds a cached resource, the returned `PreviewHandle` will **synchronously** invoke the subscriber’s callback if the subscription already exists, otherwise it will store the result and invoke the callback **immediately** upon the first `subscribe()` call.
- This removes the previous `setTimeout` workaround and guarantees delivery regardless of subscription timing.

---
### 7. Error Normalization
- Add a small internal helper `normalizeError(err: unknown): PreviewError` that extracts:
  - `code` (string, default `"UNKNOWN"`)
  - `message`
  - `cause` (original error if any)
  - optional `status`
- All render‑failure paths will pass errors through this helper before forwarding to subscribers.

---
### 8. Tests (`pdfnest/tests/unit/previewManager.test.ts`)
**All tests are written against observable outcomes only.**
1. **Single Subscriber Lifecycle** – subscribe, receive success, unsubscribe; verify retain/release counts.
2. **Multiple Subscribers Lifecycle** – two subscribers, both receive, each unsubscribe; manager releases only after the last.
3. **Early Unsubscribe Before Render** – first subscriber unsubscribes before render finishes; render continues for remaining subscriber.
4. **Last Subscriber Cancellation** – when the final subscriber unsubscribes, the in‑flight render is aborted.
5. **Active Subscriber Surviving Cache Eviction** – small‑capacity cache evicts a resource; manager‑retained reference prevents revocation until subscriber unsubscribes.
6. **Cache‑Hit Ownership** – resource already cached, verify renderer is not called, subscriber receives resource, manager retains correctly, and resource stays cached after unsubscribe.
7. **Manager.clear() Behavior** – aborts renders, does not release retained resources, manager remains usable.
8. **Manager.dispose() Behavior** – aborts renders, releases all retained resources, subsequent request throws.
9. **Renderer Capability Selection** – fake renderers with explicit `capabilities`; request for `client`, `server`, and `auto` yields expected renderer.
10. **Deduplication Invocation Count** – simultaneous identical requests result in exactly one renderer invocation; test with 1, 2, and 3 concurrent subscribers.
11. **Render Failure** – renderer rejects; subscribers receive normalized `PreviewError`; no cache entry; a later identical request can retry successfully.
12. **Aborted Render** – abort signal is received; subscribers get error; no cache entry; later request restarts render.
13. **Stale Result Protection** – asynchronous race as described; older render’s result is ignored, newer render succeeds.
14. **Handle Idempotency** – calling `subscribe` twice returns same behaviour (second call ignored); `unsubscribe` called multiple times is safe.
15. **Callback Not Invoked After Unsubscribe** – ensure no late callbacks after a subscriber has unsubscribed.
16. **Cache‑Hit Delivery** – verify synchronous delivery without `setTimeout` regardless of subscription order.
17. **Error Normalization** – confirm that errors forwarded to callbacks contain `code`, `message`, `cause`, and optional `status`.
18. **Retry After Failure** – after a failed request, a new request for the same key triggers a fresh render.

All fake renderers expose an `invocationCount` property and accept an `AbortSignal` to confirm cancellation behavior.

---
### 9. Progress Document Update (`pdfnest/docs/preview-manager-implementation-progress.md`)
- Record that **Milestone 3 – PreviewManager Core** is completed with the corrected ownership model, explicit `clear`/`dispose` semantics, minimal renderer capability contract, refined handle behavior, and full test coverage.
- List remaining limitations (e.g., real client/server renderer adapters pending).
- State next milestone: **Phase 1 — Milestone 4: Client/Server Renderer adapters**.

---
## Verification Plan

1. Run existing cache tests:
```bash
npx tsx tests/unit/previewCache.test.ts
```
2. Run the new manager test suite:
```bash
npx tsx tests/unit/previewManager.test.ts
```
3. Type‑check the project:
```bash
npx tsc --noEmit
```
All must pass with zero errors.

---
*All modifications are limited to the files listed in the strict scope.*
