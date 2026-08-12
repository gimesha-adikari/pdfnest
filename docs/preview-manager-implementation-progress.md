# PreviewManager Implementation Progress

## Phase 1 — Milestone 3: PreviewManager Core — COMPLETED

### Summary

The framework‑agnostic `PreviewManager` core has been implemented and all correctness issues have been resolved.

---

### Completed Work

#### `pdfnest/lib/preview/types.ts`
- Added required `capabilities: { client: boolean; server: boolean }` field to `PreviewRenderer`.
- No other changes to foundational types.

#### `pdfnest/lib/preview/PreviewManager.ts`
Full implementation including:

1. **Manager Retained Ownership** — `managerRetainedRefs: Map<PreviewResource, number>` tracks exactly how many active subscribers the manager retains for each resource. Map entry removed when count reaches zero.

2. **Cache‑Hit Ownership** — Resource is not retained during `request()`. Retain happens exactly when `subscribe()` is called. If `subscribe()` is never called, no retain occurs and no release is needed.

3. **Synchronous Cache‑Hit Delivery** — No `setTimeout`/`queueMicrotask`. The handle stores a pending result; `subscribe()` delivers it synchronously on the same call stack.

4. **Handle Lifecycle** (`PreviewHandleImpl`):
   - `_subscribed` — set on first `subscribe()` call; prevents re-subscription.
   - `_terminated` — permanently set by `unsubscribe()`; subsequent `subscribe()` and `unsubscribe()` calls are no-ops.
   - `subscribe()` is idempotent after the first call.
   - `unsubscribe()` is idempotent; release happens exactly once.
   - Zero callbacks after `unsubscribe()`.

5. **`clear()` contract** — Aborts all in‑flight renders, notifies active subscribers with `PreviewError { code: "CANCELLED" }`, clears inflight map. Does NOT release manager‑retained resources. Manager remains usable.

6. **`dispose()` contract** — Calls `clear()`, then releases all manager‑retained resources exactly once, marks manager disposed. Further `request()` calls throw `Error("PreviewManager disposed")`. `unsubscribe()` on terminated handles remains safe.

7. **Renderer Capability Selection** — `_selectRenderer` uses `renderer.capabilities.client` / `renderer.capabilities.server` exclusively. Renderer ID is identity only; no string matching for capability.

8. **Stale‑Result Protection** — Identity check `inflight.get(key) !== entry` guards all resolution paths. Old renderer results are never cached or delivered after the inflight entry has been replaced.

9. **Synchronous Renderer Throw** — `renderer.render()` invocation is wrapped in try/catch. Both sync throws and rejected promises follow the same `normalizeError` path.

10. **`normalizeError(err: unknown): PreviewError`** — Private helper. Guarantees `code: string` (numeric codes converted via `String(code)`). Default `"UNKNOWN"`. Preserves `message`, `cause`, and optional numeric `status`.

---

## Phase 1 — Milestone 4B: ClientPdfRenderer — COMPLETED

### Summary

The `ClientPdfRenderer` adapter wrapping PDF.js has been implemented and tested.

---

### Completed Work

#### `pdfnest/lib/preview/ClientPdfRenderer.ts` (NEW)
- Implements `PreviewRenderer` contract:
  - `id: "client-pdfjs"`
  - `capabilities: { client: true, server: false }`
- **`canRender(request)`**: Returns `true` if `request.document.file` exists.
- **`render(request, signal)`**:
  - Validates `request.document.file` presence.
  - Converts `file` to `ArrayBuffer` (`Uint8Array`).
  - Loads PDF document using PDF.js (`pdfjsLib.getDocument({ data })`).
  - Obtains 1-based page via `pdfDoc.getPage(request.page)`.
  - Calculates viewport: respects explicit `request.scale` if supplied; derives scale from `request.width` or `request.height` if provided; defaults to `1.0`.
  - Creates HTML5 `<canvas>` and renders page content via `page.render({ canvasContext: ctx, viewport })`.
  - **Cancellation Handling**: Listens to `AbortSignal`. Aborts `loadingTask` or calls `renderTask.cancel()` on abort. Converts `RenderingCancelledException` or signal abort into standard `AbortError`.
  - **Document Cleanup**: Terminates PDF document handle via `pdfDoc.destroy()` in `finally` block (isolated ownership per render operation).
  - **Resource Revoke**: Returns `PreviewResource { type: "canvas", canvas, width, height, renderedBy: "client-pdfjs", revoke }` where `revoke()` clears context and resets canvas width/height to 0 to free memory.
  - No caching, no deduplication, no subscribers, no Blob conversion, no React dependencies.

---

### Test Coverage (`pdfnest/tests/unit/clientPdfRenderer.test.ts` - NEW)

8 tests covering the full client adapter contract:

| # | Test | Result |
|---|------|--------|
| 1 | Identity & Capabilities (`client: true, server: false`) | PASSED |
| 2 | `canRender` check | PASSED |
| 3 | Missing file throws meaningful error | PASSED |
| 4 | Page number & explicit scale calculation | PASSED |
| 5 | Derived scale from width/height | PASSED |
| 6 | `AbortSignal` cancellation (`AbortError`) | PASSED |
| 7 | PDF.js error propagation | PASSED |
| 8 | Safe `revoke()` behavior (canvas memory reset) | PASSED |

---

### Validation Results

```
npx tsx tests/unit/clientPdfRenderer.test.ts → Results: 8 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts       → ALL PREVIEWCACHE OWNERSHIP TESTS PASSED
npx tsx tests/unit/previewManager.test.ts     → Results: 21 passed, 0 failed
npx tsc --noEmit (scoped to preview files)    → 0 errors
```

---

---

## Phase 1 — Milestone 4C: ServerPdfRenderer — COMPLETED

### Summary

The `ServerPdfRenderer` adapter wrapping the backend preview session REST API has been implemented and tested.

---

### Completed Work

#### `pdfnest/lib/preview/ServerPdfRenderer.ts` (NEW)
- Implements `PreviewRenderer` contract:
  - `id: "server-pymupdf"`
  - `capabilities: { client: false, server: true }`
- **`canRender(request)`**: Returns `true` if `request.document.file` exists.
- **`render(request, signal)`**:
  - Validates `request.document.file` presence.
  - Calls `_ensureSession()` — creates session via `POST /api/conversion/preview/session` (multipart `file` field) or reuses the cached session for the same file identity.
  - Session deduplication: a single in-flight `_sessionPromise` is shared across concurrent render calls for the same file. Clears on resolution/rejection.
  - File identity: `${name}:${size}:${lastModified}:${type}` — invalidates session when file changes.
  - Fetches page image via `GET /api/conversion/preview/session/:id/page/:num?scale=:scale`.
  - **404 recovery**: On session-not-found (404), invalidates cached session, creates a fresh session, and retries the page fetch exactly once.
  - **Scale resolution**: Respects explicit `request.scale` if supplied; defaults to `2.0` (144 DPI equivalent on backend). `width`/`height` hints are not applicable for server-side rendering.
  - **Cancellation**: `AbortSignal` checked before each async boundary. Aborts propagate through fetch via signal forwarding. Both `DOMException { name: "AbortError" }` and `Error { name: "AbortError" }` are recognized.
  - **Resource lifecycle**: Returns `PreviewResource { type: "image-url", url: objectUrl, renderedBy: "server-pymupdf", revoke: () => URL.revokeObjectURL(url) }`. `PreviewCache`/`PreviewManager` are responsible for invoking `revoke()` when reference count drops to zero.
  - No React dependencies. No caching or deduplication beyond session reuse (central LRU handled by `PreviewCache`).
  - `fetchImpl` is injectable for test isolation.

---

### Test Coverage (`pdfnest/tests/unit/serverPdfRenderer.test.ts` - NEW)

14 tests covering the full server adapter contract:

| # | Test | Result |
|---|------|--------|
| 1 | Identity & Capabilities (`client: false, server: true`) | PASSED |
| 2 | `canRender` true when file present | PASSED |
| 3 | `canRender` false when file absent | PASSED |
| 4 | Missing file throws meaningful error | PASSED |
| 5 | Successful render returns `image-url` resource | PASSED |
| 6 | Session reused across pages of same file | PASSED |
| 7 | 404 triggers session recreation and page retry | PASSED |
| 8 | Non-404 HTTP error propagates meaningful message | PASSED |
| 9 | Session creation failure propagates | PASSED |
| 10 | Pre-aborted signal throws `AbortError` immediately | PASSED |
| 11 | `revoke()` calls `URL.revokeObjectURL` | PASSED |
| 12 | Explicit `request.scale` forwarded to page URL | PASSED |
| 13 | Default scale `2.0` used when `request.scale` absent | PASSED |
| 14 | Different file identity invalidates session | PASSED |

---

### Validation Results

```
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 14 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → ALL PREVIEWCACHE OWNERSHIP TESTS PASSED
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsc --noEmit (scoped to preview files)     → 0 errors
```

---

---

## Phase 1 — Milestone 4C: Post-completion Lifecycle Corrections — COMPLETED

Two concurrency/lifecycle issues were corrected in `ServerPdfRenderer` after the initial 4C implementation.

### Correction 1 — Shared Session Creation Cancellation

**Problem**: `_createSession` was called with the first caller's `AbortSignal` and that signal was passed directly to `fetch`. If caller A aborted, the shared `_sessionPromise` rejected, which also failed caller B who was awaiting the same promise.

**Fix**: `_createSession` now runs without any caller `AbortSignal` (the fetch call has no `signal`). Each caller instead uses `Promise.race([sharedPromise, abortRejector])` inside `_ensureSession`, so aborting A throws only for A while the underlying fetch continues for B. The shared promise reference is captured before the race so the `.then()` cleanup closures compare against the correct identity.

### Correction 2 — Idempotent `revoke()`

**Problem**: `revoke()` on the returned `PreviewResource` called `URL.revokeObjectURL(url)` unconditionally on every invocation.

**Fix**: A local `revoked` boolean guards the closure. The first call executes `URL.revokeObjectURL(url)` and sets `revoked = true`. All subsequent calls are no-ops.

### Tests Added

| # | Test | Result |
|---|------|--------|
| 15 | Concurrent cancellation — A aborts, B succeeds, one session created | PASSED |
| 16 | `revoke()` idempotent — `URL.revokeObjectURL` called exactly once on triple invocation | PASSED |

### Validation Results

```
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → ALL PREVIEWCACHE OWNERSHIP TESTS PASSED (21)
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsc --noEmit (scoped to preview files)     → 0 errors
```

---

### Phase 1 — Milestone 4 Status

| Milestone | Description | Status |
|-----------|-------------|--------|
| 4A | Discovery Correction (architecture notes) | COMPLETE |
| 4B | `ClientPdfRenderer` (PDF.js thin adapter) | COMPLETE |
| 4C | `ServerPdfRenderer` (backend session REST adapter) | COMPLETE |

---

## Phase 1 — Milestone 5: `usePreview` React Bridge — COMPLETED

### Implementation Summary

**[`lib/preview/usePreview.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/preview/usePreview.ts)**

React bridge hook connecting components to `PreviewManager`:
- **API**: `usePreview({ file, page, scale?, mode?, renderer?, enabled?, onError?, manager? }): { src, isLoading, error, reset }`
- **Manager Strategy**: Uses a module-level `defaultManager` singleton lazily initialized via `getDefaultPreviewManager()`. Registered with `ClientPdfRenderer` and `ServerPdfRenderer` once. SSR-safe. Supports custom `manager` override option for unit testing.
- **Resource Ownership**: Does **not** invoke `URL.createObjectURL()`, `resource.revoke()`, or manage cache directly. Subscribes via `manager.request(req).subscribe()`, which retains resources in `PreviewManager`. On unmount or prop change, calls `handle.unsubscribe()`, which releases references for `PreviewCache` to clean up when ref count reaches zero.
- **Mode & Renderer Rules**:
  - `mode: "page"` → default `renderer: "server"`, default `scale: 2.0`
  - `mode: "thumbnail"` → default `renderer: "client"`, default `scale: 0.3`
  - Explicit `scale` overrides mode default scale. Explicit `renderer` overrides mode default renderer.
- **Disabled State**: When `file === null`, `page < 1`, or `enabled === false`, returns `{ src: "", isLoading: false, error: null }` without sending requests to `PreviewManager`.
- **Lifecycle & Cancellation**: `useEffect` cleanup sets local `cancelled = true` flag and calls `handle.unsubscribe()`. Stale callbacks cannot mutate component state. `reset()` unsubscribes active handle and resets state without revoking resources.

### Tests

**[`tests/unit/usePreview.test.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/unit/usePreview.test.ts)** — **25/25 passed**

| # | Test | Result |
|---|------|--------|
| 1 | Initial disabled state | PASSED |
| 2 | Basic server preview success | PASSED |
| 3 | Loading -> success transition | PASSED |
| 4 | Correct PreviewRequest construction | PASSED |
| 5 | File change creates new request | PASSED |
| 6 | Page change creates new request | PASSED |
| 7 | Scale change creates new request | PASSED |
| 8 | Renderer change creates new request | PASSED |
| 9 | `mode="page"` defaults correctly | PASSED |
| 10 | `mode="thumbnail"` defaults correctly | PASSED |
| 11 | Explicit scale overrides mode | PASSED |
| 12 | `enabled=false` prevents requests | PASSED |
| 13 | `enabled=true` after false requests correctly | PASSED |
| 14 | Error state | PASSED |
| 15 | `onError` receives `PreviewError` | PASSED |
| 16 | Error clears when new request starts | PASSED |
| 17 | `reset()` clears state | PASSED |
| 18 | `reset()` unsubscribes handle | PASSED |
| 19 | `unmount` unsubscribes handle | PASSED |
| 20 | No state update after unsubscribe | PASSED |
| 21 | Synchronous cache-hit delivery | PASSED |
| 22 | Asynchronous render delivery | PASSED |
| 23 | Stale request cannot overwrite newer request | PASSED |
| 24 | React Strict Mode mount cleanup | PASSED |
| 25 | Multiple hook instances share resource without premature release | PASSED |

### Validation Results

```
npx tsx tests/unit/usePreview.test.ts          → Results: 25 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → Results: 21 passed, 0 failed
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsc --noEmit (scoped to preview files)     → 0 errors
```

### Remaining Limitations

- Existing preview consumers (other than `SignPdfWorkspace`) are not yet migrated to `usePreview` (scheduled for subsequent Phase 2 milestones).
- `usePreview` currently exposes `src` as string (Object URL). Canvas elements returned by `ClientPdfRenderer` can be adapted to Object URLs or consumed via `src` blob URLs.

---

## Phase 2 — Milestone 1: `SignPdfWorkspace` Migration — COMPLETED

### Migration Summary

**[`components/tools/SignPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/SignPdfWorkspace.tsx)**

Migrated `SignPdfWorkspace` to consume `usePreview` instead of legacy `usePdfPreview`:
- **Old preview logic removed**: Direct reference to `usePdfPreview` hook.
- **`usePreview` Integration**:
  ```ts
  const { src: pagePreviewUrl, isLoading: isPreviewLoading } = usePreview({
      file,
      page: currentPage,
      scale: 2.0,
      onError: (err: PreviewError) => notify(err.message, "error"),
  });
  ```
- **Lifecycle & Resource Ownership**: `SignPdfWorkspace` relies entirely on `usePreview` and `PreviewManager` for session creation, page fetching, URL generation, ref counting, and resource cleanup. `SignPdfWorkspace` does not perform any manual Object URL revocation.
- **Preserved Functionality**: All signing UI, signature canvas creation, stamp dragging/dropping, PDF.js coordinate dimension parsing (`parsePdfLength`), and backend submission logic remain 100% unchanged.

### Validation Results

```
npx tsx tests/unit/usePreview.test.ts          → Results: 25 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → Results: 21 passed, 0 failed
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsc --project tsconfig.json --noEmit        → 0 errors across SignPdfWorkspace & preview subsystem
```

### Remaining Limitations

- Existing preview consumers (other than `SignPdfWorkspace` and `SignPdfTool`) are not yet migrated to `usePreview` (scheduled for subsequent Phase 2 milestones).

---

## Phase 2 — Milestone 2: `SignPdfTool` Migration — COMPLETED

### Migration Summary

**[`components/studio/tools/SignPdfTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/SignPdfTool.tsx)**

Migrated `SignPdfTool` (the Studio version of the signing tool) to consume `usePreview` instead of legacy `usePdfPreview`:
- **Old preview logic removed**: Direct reference to `usePdfPreview` hook.
- **`usePreview` Integration**:
  ```ts
  const { src: pagePreviewUrl, isLoading: isPreviewLoading } = usePreview({
      file: baseFile,
      page: currentPage,
      scale: 2.0,
      onError: (err: PreviewError) => notify(err.message, "error"),
  });
  ```
- **Renderer / Mode / Scale Rationale**:
  - `renderer`: `"server"` (default). Page previews use `ServerPdfRenderer` backend sessions.
  - `mode`: `"page"` (default).
  - `scale`: `2.0` (explicit). Renders 144 DPI equivalent page background for interactive signature stamp placement.
- **Lifecycle & Resource Ownership**: `SignPdfTool` relies completely on `usePreview` and `PreviewManager` for backend session creation, page fetching, reference counting, and resource cleanup. Object URLs are managed exclusively by `PreviewManager` / `PreviewCache`.
- **Preserved Functionality**: Signature pad drawing (`signatureBlob`, `signatureUrl`), stamp dragging/dropping, PDF.js page coordinate dimension extraction (`loadDocument`), backend signing submission via `/api/structure/sign`, callback to `onSignedFile(signedFile)`, and all Studio tool panel UI layout remain 100% unchanged.

### Validation Results

```
npx tsx tests/unit/usePreview.test.ts          → Results: 25 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → Results: 21 passed, 0 failed
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsc --project tsconfig.json --noEmit        → 0 errors across SignPdfTool & preview subsystem
```

### Remaining Limitations

- Studio annotation tools (`HighlightTool`, `UnderlineTool`, `StrikeoutTool`) and `useStudioPreview` / Studio canvas still use legacy preview hooks and will be migrated in subsequent Phase 2 milestones.

---

## Phase 2 — Milestone 3: Annotation Workspace Migration — COMPLETED

### Migration Summary

**Workspaces Migrated**:
- **[`components/tools/HighlightPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/HighlightPdfWorkspace.tsx)**
- **[`components/tools/UnderlinePdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/UnderlinePdfWorkspace.tsx)**
- **[`components/tools/StrikeoutPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/StrikeoutPdfWorkspace.tsx)**

Migrated all 3 standalone annotation tool workspaces from legacy `usePdfPreview` to `usePreview`:
- **Old preview logic removed**: Legacy `usePdfPreview` hook calls and import references.
- **`usePreview` Integration**:
  ```ts
  const { src: scannedPreviewSrc, isLoading: scannedPreviewLoading } = usePreview({
      file,
      page: currentPage,
      scale: 2.0,
      enabled: isScannedPage,
      onError: (err: PreviewError) => console.error("Failed to render scanned page preview:", err.message),
  });
  ```
- **Configuration & Rationale**:
  - `renderer`: `"server"` (default). Uses `ServerPdfRenderer` backend sessions.
  - `mode`: `"page"` (default).
  - `scale`: `2.0` (explicit). Renders 144 DPI equivalent page background for manual annotation box creation over scanned pages.
  - `enabled`: `isScannedPage` (boolean). When `isScannedPage` is `false` (text/vector pages), `usePreview` receives `enabled: false` and makes zero preview requests. When `isScannedPage` is `true`, `usePreview` conditionally requests a scale 2.0 image preview.
- **Lifecycle & Resource Ownership**: All session creation, page fetching, reference counting, and Object URL revocation are managed entirely by `PreviewManager` / `PreviewCache`. Workspaces do not perform manual Object URL revocation.
- **Preserved Functionality**: Text selection rendering, text layer parsing, page type classification (`isScannedPage`, `isTextPage`, `isMixedPage`), smart mode box creation, drawing drag-to-size handlers, annotation box overlays, history undo/redo, and backend annotation submission logic remain 100% unchanged.

### Validation Results

```
npx tsx tests/unit/usePreview.test.ts          → Results: 25 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → Results: 21 passed, 0 failed
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsc --project tsconfig.json --noEmit        → 0 errors across migrated annotation workspaces & preview subsystem
```

### Remaining Limitations

- Studio main canvas (`useStudioPreview` / `useStudio.ts`) still uses the legacy studio preview hook and is scheduled for Phase 2 Milestone 5.

---

## Phase 2 — Milestone 4: Studio Annotation Preview Migration — COMPLETED

### Architectural Discovery

Inspection of the Studio architecture revealed that:
1. **Tool Independence**: `HighlightTool.tsx`, `UnderlineTool.tsx`, and `StrikeoutTool.tsx` render vector text pages using client-side PDF.js, BUT call `usePdfPreview` directly for scanned pages (`isScannedPage`). They do **not** use `useStudioPreview`.
2. **`usePdfPreview` Elimination**: With the completion of Milestone 4, **zero** active consumers of `usePdfPreview` remain in the entire codebase.
3. **`useStudioPreview` Scope**: `useStudioPreview.ts` is only consumed by `useStudio.ts` for the main Studio canvas preview (`StudioCanvasPreview`).

### Migration Summary

**Files Migrated**:
- **[`components/studio/tools/HighlightTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/HighlightTool.tsx)**
- **[`components/studio/tools/UnderlineTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/UnderlineTool.tsx)**
- **[`components/studio/tools/StrikeoutTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/StrikeoutTool.tsx)**

Migrated all 3 Studio annotation tools from legacy `usePdfPreview` to `usePreview`:
- **Old preview logic removed**: Direct references to `usePdfPreview` hook calls and imports.
- **`usePreview` Integration**:
  ```ts
  const { src: scannedPreviewSrc, isLoading: scannedPreviewLoading } = usePreview({
      file: baseFile,
      page: currentPage,
      scale: 2.0,
      enabled: isScannedPage,
      onError: (err: PreviewError) => console.error("Failed to render scanned page preview:", err.message),
  });
  ```
- **Configuration & Rationale**:
  - `renderer`: `"server"` (default). Uses `ServerPdfRenderer` backend sessions.
  - `mode`: `"page"` (default).
  - `scale`: `2.0` (explicit). Renders 144 DPI equivalent page background for manual annotation box creation over scanned pages.
  - `enabled`: `isScannedPage` (boolean). When `isScannedPage` is `false` (text/vector pages), `usePreview` receives `enabled: false` and makes zero preview requests. When `isScannedPage` is `true`, `usePreview` conditionally requests a scale 2.0 image preview.
- **Lifecycle & Resource Ownership**: All session creation, page fetching, reference counting, and Object URL revocation are managed entirely by `PreviewManager` / `PreviewCache`. Workspaces do not perform manual Object URL revocation.
- **Preserved Functionality**: Text selection rendering, text layer parsing, page type classification (`isScannedPage`, `isTextPage`, `isMixedPage`), smart mode box creation, drawing drag-to-size handlers, annotation box overlays, history undo/redo, and backend annotation submission logic remain 100% unchanged.

### Validation Results

```
npx tsx tests/unit/usePreview.test.ts          → Results: 25 passed, 0 failed
npx tsx tests/unit/previewCache.test.ts        → Results: 21 passed, 0 failed
npx tsx tests/unit/previewManager.test.ts      → Results: 21 passed, 0 failed
npx tsx tests/unit/clientPdfRenderer.test.ts   → Results: 8 passed, 0 failed
npx tsx tests/unit/serverPdfRenderer.test.ts   → Results: 16 passed, 0 failed
npx tsc --project tsconfig.json --noEmit        → 0 errors across Studio annotation tools & preview subsystem
```

### Remaining Limitations

- `useStudioPreview` (consumed by `useStudio.ts` for main Studio canvas preview) is the last remaining legacy preview hook in the codebase and will be migrated in Phase 2 Milestone 5.





