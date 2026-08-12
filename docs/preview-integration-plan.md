# Preview Integration Plan

> **Status**: Investigation COMPLETE — Implementation NOT started  
> **Phase**: Pre-Milestone 5 Discovery  
> **Created**: 2026-08-12

---

## Investigation Status

| Area | Status |
|------|--------|
| A. Existing preview producers | ✅ Complete |
| B. Existing preview consumers | ✅ Complete |
| C. Preview type classification | ✅ Complete |
| D. Loading states | ✅ Complete |
| E. Error behavior | ✅ Complete |
| F. Cancellation behavior | ✅ Complete |
| G. Object URL / canvas cleanup | ✅ Complete |
| H. Document identity / version | ✅ Complete |
| I. Upload / file lifecycle | ✅ Complete |
| J. Page navigation behavior | ✅ Complete |
| K. Preview quality / scale | ✅ Complete |
| L. Caching / deduplication | ✅ Complete |
| M. PreviewManager gap analysis | ✅ Complete |
| N. Proposed usePreview API | ✅ Complete |
| O. Migration strategy | ✅ Complete |

---

## 1. Background

The new PreviewManager foundation (types, cache, manager, ClientPdfRenderer, ServerPdfRenderer) is complete and tested. Before any React integration, we must understand every existing preview flow, so we can build a usePreview hook that replaces the existing mechanisms with **zero behavioral regression**.

The existing preview code is entirely self-contained in hooks — it does **not** use PreviewManager. The goal of this milestone is to bridge them.

---

## 2. Existing Preview Producers

### 2A. usePdfPreview — Server-session page preview

**Location**: `hooks/usePdfPreview.ts`

**What it does**: Produces a server-rendered page preview image as an objectUrl (blob URL) backed by the backend preview session REST API.

**Mechanism**:
1. `POST /api/conversion/preview/session` — uploads file, receives `session_id` (and optional `page_count`).
2. `GET /api/conversion/preview/session/:id/page/:num?scale=:scale` — fetches a page as a JPEG blob.
3. Creates `URL.createObjectURL(blob)` and stores it as `previewSrc`.
4. Caches results by `sessionId:pageNumber:scale` key in a `Map<string, string>`.
5. On 404, invalidates session and recreates it once.

**Scale used**: Caller-provided, defaults to `"2.0"` (i.e., 2.0x viewport scale → 144 DPI equivalent).

---

### 2B. useStudioPreview — Studio server-session page preview

**Location**: `hooks/useStudioPreview.ts`

**What it does**: Produces a server-rendered page preview image for the studio canvas area. Architecturally near-identical to usePdfPreview but with slightly different return values.

**Scale used**: Hardcoded `"2.0"` string constant.

---

### 2C. Tool-level PDF.js thumbnail rendering

Used by: DeletePagesTool, ReorderPagesTool, RotateTool, SplitTool, MergeTool (studio tools), and DeletePagesWorkspace, ReorderPagesWorkspace, RotatePdfWorkspace, SplitPdfWorkspace, MergePdfWorkspace (standalone tool workspaces).

**What they do**: Load the entire PDF with PDF.js into memory, render each page to an offscreen `<canvas>` at small scale, call `canvas.toDataURL("image/jpeg", quality)`, then store the JPEG data-URL as a thumbnail string.

**Scales used** (extracted from code):
- First-page thumbnail only (for file cards): `scale: 0.2` → `toDataURL(jpeg, 0.65)`
- All-pages thumbnail grid: `scale: 0.3` → `toDataURL(jpeg, 0.6–0.7)`
- Merge workspace: `scale: 0.2` → `toDataURL(jpeg, 0.5)`

**Output format**: JPEG data-URL strings (not Object URLs).

---

### 2D. Tool-level PDF.js page-count / dimension extraction

Used by: SignPdfTool, SignPdfWorkspace, many annotation tools (Highlight, Underline, Strikeout, AddText, EditPdf, CropTool, WatermarkTool, PageNumbersTool, RedactTool, etc.)

**What they do**: Use PDF.js **only** to count pages and extract per-page viewport dimensions for coordinate mapping. They do **not** use PDF.js to render preview images for display — display previews come from usePdfPreview.

---

### 2E. useStudioDocument.scanPages — PDF page-count scan

**Location**: `hooks/useStudioDocument.ts` `scanPages()`

Loads PDF with PDF.js to count pages and create `StudioPage[]` records. Does not render any images. Called when a file is accepted.

---

### 2F. Non-PDF-preview object URLs

Miscellaneous object URL creation in the app (e.g. signature images, export downloads, image upload previews) is **not part of the PDF preview subsystem** and is out of scope.

---

## 3. Preview Consumers

### 3A. Studio main canvas — StudioCanvasPreview

**Component**: `components/studio/Preview.tsx`

**Input props**:
- `previewSrc: string` — blob URL (server-rendered JPEG)
- `isRendering: boolean` — shows loading overlay
- `isScanning: boolean` — shows loading overlay with "Reading PDF..."

**Source of previewSrc**: useStudioPreview → flows up through useStudio → studio/page.tsx → StudioWorkspace → StudioCanvasPreview.

**How it renders**: Renders the blob URL inside an `<img>` tag. No canvas. No direct PDF.js. Uses `zoom` prop for CSS scaling. Reads `naturalWidth/naturalHeight` from `onLoad` to compute aspect ratio.

---

### 3B. Standalone tool workspaces using usePdfPreview

- `components/tools/SignPdfWorkspace.tsx`
- `components/tools/HighlightPdfWorkspace.tsx`
- `components/tools/UnderlinePdfWorkspace.tsx`
- `components/tools/StrikeoutPdfWorkspace.tsx`

These are the **only standalone tool workspaces** that use usePdfPreview. They consume `previewSrc` (blob URL) and display it in a `<img>` tag alongside canvas-based annotation overlays.

**Key pattern**:
- Display the server-rendered image as the page background.
- Overlay annotation boxes (highlights, underlines, etc.) as SVG/HTML elements on top.
- Page dimensions come from PDF.js (separate `getDocument` call) for coordinate mapping.
- usePdfPreview is called with `enabled: isScannedPage` in Highlight/Underline/Strikeout — they only fetch the server preview for scanned pages.

**usePdfPreview inputs**:
```ts
usePdfPreview({
    file,
    pageNumber: currentPage,   // 1-indexed
    scale: "2.0",
    enabled?: boolean,         // only Highlight/Underline/Strikeout use enabled flag
    onError: (msg) => notify(msg, "error"),
})
```

**Destructured output**: `{ previewSrc, isLoading }` — sessionId, pageCount, clearCache, resetPreview are NOT used by any consumer.

---

### 3C. Studio tool panels using usePdfPreview

- `components/studio/tools/SignPdfTool.tsx`
- `components/studio/tools/HighlightTool.tsx`
- `components/studio/tools/UnderlineTool.tsx`
- `components/studio/tools/StrikeoutTool.tsx`

Studio versions of the above. Same pattern. Same usePdfPreview inputs and destructured outputs.

---

### 3D. Tool thumbnail grids (out of scope for Milestone 5)

**Components**: DeletePages, Reorder, Rotate, Split, Merge (both studio and standalone).

These do **not** use usePdfPreview or useStudioPreview. They render thumbnails using their own inline PDF.js code. Thumbnails are JPEG data-URL strings kept in local useState. Entirely self-contained — out of scope for Milestone 5.

---

## 4. usePdfPreview — Detailed API Analysis

### Inputs

```ts
interface UsePdfPreviewOptions {
    file: File | null;          // null = preview disabled + cleanup
    pageNumber: number;         // 1-indexed; < 1 = disabled
    scale?: string;             // default "2.0"
    enabled?: boolean;          // default true; false = disabled (no cleanup)
    onError?: (message: string) => void;
}
```

### Outputs

```ts
interface UsePdfPreviewResult {
    previewSrc: string;          // blob URL ("") when unavailable
    isLoading: boolean;          // true while fetching
    sessionId: string | null;    // NOT used by any consumer
    pageCount: number;           // NOT used by any consumer
    clearCache: () => void;      // NOT called by any consumer
    resetPreview: () => void;    // NOT called by any consumer
}
```

### Trigger mechanism

Preview fires automatically on useEffect when [file, pageNumber, enabled, loadPreview, clearObjectUrlCache] change. Each effect invocation creates a new AbortController, aborts the previous one via cleanup, and starts a new load.

### Cancellation

Uses AbortController. Cleanup function aborts the controller. Page fetch passes the signal. Session creation is NOT abortable.

### Object URL cleanup

- On file change: all cached URLs are revoked via clearObjectUrlCache()
- On unmount: cleanup effect revokes all cached URLs
- On 404 session expiry: all cached URLs are revoked before session recreation
- When overwriting a cache entry (same key): previous URL is revoked

### Cache behavior — IMPORTANT

**usePdfPreview**: cache is write-only for ownership tracking, NOT for read-side hits. Each re-render of the same page/scale fetches again. The cache exists only so previous blob URLs for the same key are properly revoked when overwritten.

**useStudioPreview**: HAS read-side cache hits — returns the cached URL directly without re-fetching if the same sessionId+page+scale key exists.

### Loading state

`isLoading` is set to `true` at start of effect, then `false` in `.finally()` only if signal is not aborted. If aborted (page navigates before fetch completes), `isLoading` stays `true` until the next fetch completes. This means loading state can appear stuck during rapid navigation.

### Error behavior

Errors delivered via `onErrorRef.current(message)`. No error state returned. If no `onError` provided, errors are silently logged via `console.error`.

---

## 5. useStudioPreview — Detailed Differences

| Aspect | usePdfPreview | useStudioPreview |
|--------|---------------|-------------------|
| Cache reads | None (write-only) | Yes — short-circuits fetch on hit |
| `enabled` flag | Yes | No |
| Scale | Configurable string | Hardcoded "2.0" |
| Loading state name | `isLoading` | `isRendering` |
| Extra outputs | sessionId, pageCount | sessionId, pageCount, clearPreview, clearPreviewCache, resetPreview |
| Cancellation | AbortController | manual `cancelled` boolean flag |

### Imperative methods used from outside

**clearPreviewCache()**: Called from `useStudio.commitDocument()` and `studio/page.tsx` (before project restore, before opening .pns project).

**resetPreview()**: Called from `useStudio.resetStudio()`.

These imperative calls are the main complication for studio migration. The new usePreview hook must expose a `reset()` method equivalent.

### Studio document version changes

When a tool edits the document (commitDocument), the flow is:
1. `preview.clearPreviewCache()` — revokes all cached URLs
2. `document.replaceCurrentDocument(file)` — sets new File object
3. useStudioPreview detects file identity change → invalidates session
4. New preview request fires automatically

---

## 6. Preview Mode Classification

### What exists in the application today

| Mode | Scale | Method | Output | Used in |
|---|---|---|---|---|
| Page preview | 2.0 (server) | Backend PyMuPDF | blob URL → img | Studio canvas, Sign, Highlight (scanned) |
| Thumbnail | 0.2–0.3 (client) | PDF.js canvas | JPEG data-URL → img | Delete, Reorder, Rotate, Split, Merge |

**The PreviewRequest.mode field mapping**:
- `mode: "page"` → scale 2.0, renderer: server
- `mode: "thumbnail"` → scale 0.3, renderer: client

The application does NOT use "small", "large", or "full" modes — these were defined in the PreviewManager architecture as potential values but do not correspond to actual usage. They are reserved for future use.

---

## 7. Client vs. Server Rendering Policy

### What the current application does

| Scenario | Current behavior |
|---|---|
| Studio canvas preview | Always server (useStudioPreview) |
| Standalone tool page preview | Always server (usePdfPreview) |
| Thumbnail grids | Always client (PDF.js canvas.toDataURL) |
| Scanned page annotation overlay | Server (usePdfPreview with enabled: isScannedPage) |

### What the future PreviewManager should do

| Scenario | Intended renderer |
|---|---|
| Studio canvas preview | renderer: "server" → ServerPdfRenderer |
| Standalone tool page preview | renderer: "server" → ServerPdfRenderer |
| Thumbnail grids | renderer: "client" → ClientPdfRenderer (future, out of scope) |
| Scanned page overlay | renderer: "server", enabled flag in hook |

**renderer: "auto"**: The application has no existing fallback behavior. For Milestone 5, auto = server for page previews.

---

## 8. PreviewManager Gap Analysis

### Does the current PreviewManager API support all use cases?

| Use case | Gap? | Resolution |
|---|---|---|
| Studio canvas (server, single page) | None | request() + subscribe |
| Tool page preview with `enabled` flag | Low — hook-level | Hook conditionally calls request() |
| Thumbnail grids (canvas output) | Medium — deferred | Out of scope Milestone 5 |
| Session ID / pageCount exposure | None | Not used by consumers |
| Imperative clearCache / reset | Low | Expose reset() from usePreview |
| PreviewDocument.id derivation from File | Low | Hook derives from file identity |
| pageCount from session | None | Not used; omit |
| React Strict Mode | None | PreviewManager handles via _terminated + requestId |
| Multiple subscribers to same resource | None — improved | Cache deduplication |

**Conclusion: The current PreviewManager API is sufficient for Milestone 5. No modifications to PreviewManager, PreviewCache, or renderers are needed.**

---

## 9. Proposed usePreview API

### Design inputs

All current consumers use exactly:
```ts
const { previewSrc, isLoading } = usePdfPreview({ file, pageNumber, scale, enabled, onError });
```
Output is always a blob URL string displayed in an img tag.

### Proposed interface

```ts
interface UsePreviewOptions {
    file: File | null;           // null → disabled + cleanup
    page: number;                // 1-indexed; < 1 → disabled

    // Optional with defaults
    scale?: number;              // default 2.0
    mode?: "page" | "thumbnail"; // "page" = scale 2.0 server; "thumbnail" = scale 0.3 client
    renderer?: "server" | "client" | "auto"; // default "server"
    enabled?: boolean;           // default true; false = no-op, no cleanup
    onError?: (error: PreviewError) => void;
}

interface UsePreviewResult {
    src: string;                 // blob URL or "" when unavailable
    isLoading: boolean;          // true while fetching
    error: PreviewError | null;  // last error; cleared on new request
    reset: () => void;           // unsubscribe + clear local state
}
```

### Key design decisions

**`src` not `previewSrc`**: More general name. Backward-compatible rename.

**`error` state**: Returns last error in state AND calls `onError` callback. More testable than callback-only.

**No sessionId, pageCount, clearCache**: None used by current consumers. Omitted from new API.

**`mode` maps to scale**: `mode: "page"` → 2.0, `mode: "thumbnail"` → 0.3. If scale is explicitly set, it takes priority over mode.

**Automatic subscription lifecycle**: Hook calls manager.request() → retain() on mount/change, release() on cleanup. Transparent to consumers.

**`reset()` for imperative control**: Calls release() + clears local state. Replaces clearCache() + resetPreview().

---

## 10. Migration Sequence

### Order of migration

1. **Implement usePreview** (`lib/preview/usePreview.ts`) with unit tests — Milestone 5
2. **Migrate SignPdfWorkspace** (simplest: server, page=currentPage, no enabled flag)
3. **Migrate SignPdfTool** (studio version, same pattern)
4. **Migrate HighlightPdfWorkspace, UnderlinePdfWorkspace, StrikeoutPdfWorkspace** (enabled flag)
5. **Migrate HighlightTool, UnderlineTool, StrikeoutTool** (studio versions with enabled flag)
6. **Migrate studio via useStudio/useStudioPreview** (most complex: imperative reset calls)
7. **Delete usePdfPreview and useStudioPreview** after all consumers migrated

### Consumer migration map

| Consumer | File | Complexity |
|---|---|---|
| SignPdfWorkspace | components/tools/SignPdfWorkspace.tsx | Low — start here |
| SignPdfTool | components/studio/tools/SignPdfTool.tsx | Low |
| HighlightPdfWorkspace | components/tools/HighlightPdfWorkspace.tsx | Medium (enabled flag) |
| StrikeoutPdfWorkspace | components/tools/StrikeoutPdfWorkspace.tsx | Medium (enabled flag) |
| UnderlinePdfWorkspace | components/tools/UnderlinePdfWorkspace.tsx | Medium (enabled flag) |
| HighlightTool | components/studio/tools/HighlightTool.tsx | Medium (enabled flag) |
| StrikeoutTool | components/studio/tools/StrikeoutTool.tsx | Medium (enabled flag) |
| UnderlineTool | components/studio/tools/UnderlineTool.tsx | Medium (enabled flag) |
| Studio canvas (via useStudio) | hooks/useStudio.ts | High (imperative reset methods) |

### NOT in scope for Milestone 5 migration

- Thumbnail grid tools (DeletePages, Reorder, Rotate, Split, Merge) — use inline PDF.js, no hook.
- Any backend, worker, or PDF.js page-dimension extraction code.

---

## 11. Files Created / Modified in This Milestone

**Created**:
- `pdfnest/docs/preview-integration-plan.md` (this file)

**Not modified**:
- usePdfPreview.ts
- useStudioPreview.ts
- Any component
- Any backend
- PreviewManager, PreviewCache, renderers

---

## 12. Remaining Unknowns

| Unknown | Impact | Resolution path |
|---|---|---|
| Whether Strict Mode causes observable double-fetch in production | Medium | Validate during Milestone 5 hook implementation |
| Whether studio page count from session was ever used | Low | Confirmed no consumer reads it; safe to omit |
| Thumbnail tool migration timing | Low | Future milestone; keep existing code as-is |

---

## 13. Exact Next Milestone

**Milestone 5**: Implement `usePreview` hook

### Scope

Create:
- `pdfnest/lib/preview/usePreview.ts`

Create:
- `pdfnest/tests/unit/usePreview.test.ts`

Do NOT modify any existing component or hook.

### Implementation order

1. Implement the hook following the proposed API above.
2. Wire up `PreviewManager` (singleton or injected).
3. Handle `enabled` flag via conditional `request()`.
4. Handle `reset()` via `release()` + state clear.
5. Write unit tests covering: basic render, file change, page change, enabled=false, unmount cleanup, error propagation, reset().
6. Run all existing tests to confirm no regressions.
7. Update `preview-manager-implementation-progress.md`.

