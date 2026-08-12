# Preview Renderer Discovery

## Status

- **Discovery Status**: COMPLETE
- **Last Updated**: 2026-08-12
- **Files Inspected**:
  - `pdfnest/hooks/usePdfPreview.ts`
  - `pdfnest/hooks/useStudioPreview.ts`
  - `pdfnest/hooks/useStudioDocument.ts`
  - `pdfnest/components/shared/LoadPdfJs.tsx`
  - `pdfnest/components/studio/StudioWorkspace.tsx`
  - `pdfnest/components/studio/StudioCanvasPreview.tsx`
  - `pdfnest/components/studio/tools/SignPdfTool.tsx`
  - `pdfnest/components/studio/tools/StrikeoutTool.tsx`
  - `pdfnest/components/studio/tools/RotateTool.tsx`
  - `pdfnest/components/studio/tools/DeletePagesTool.tsx`
  - `pdfnest/components/studio/tools/ReorderPagesTool.tsx`
  - `pdfnest/components/studio/tools/CropTool.tsx`
  - `pdfnest/components/studio/tools/RedactTool.tsx`
  - `pdfnest/components/studio/tools/SplitTool.tsx`
  - `pdfnest/components/studio/tools/WatermarkTool.tsx`
  - `pdfnest/components/tools/SignPdfWorkspace.tsx`
  - `pdfnest/components/tools/DeletePagesWorkspace.tsx`
  - `pdfnest-backend/internal/conversion/routes.go`
  - `pdfnest-backend/internal/conversion/controller.go`
  - `pdfnest-backend/internal/conversion/pageToImageStream.go`
  - `pdfnest-worker/app/api/tools/render/router.py`
  - `pdfnest-worker/app/api/tools/render/session.py`
  - `pdfnest-worker/app/api/tools/render/renderer.py`

---

## Existing Preview Implementations

### Implementation 1: `usePdfPreview` Hook
- **File Path**: `pdfnest/hooks/usePdfPreview.ts`
- **Purpose**: Manages server-side PDF page rendering for individual tool workspaces (Sign, Highlight, Strikeout, Underline).
- **Type**: Server-side rendering (fetches JPEG from backend/worker session API).
- **Input**: `{ file: File | null, pageNumber: number, scale?: string, enabled?: boolean, onError?: (message: string) => void }`
- **Output**: `{ previewSrc: string (Object URL), isLoading: boolean, sessionId: string | null, pageCount: number, clearCache: () => void, resetPreview: () => void }`
- **Page Numbering**: 1-based index (`requestedPage`).
- **Scale/Dimensions**: Accepts string scale (default `"2.0"` -> maps to 144 DPI on backend).
- **PDF Representation**: Expects browser `File` object. Computes identity via `${file.name}:${file.size}:${file.lastModified}:${file.type}`.
- **Binary Transfer**: `POST` multipart form data with `file` field to `/api/conversion/preview/session`.
- **PDF.js Usage**: No. Uses backend HTTP REST endpoints.
- **Canvas Usage**: No.
- **Blob/Object URL**: Converts HTTP response to `Blob`, then `URL.createObjectURL(blob)`.
- **Revoke Behavior**: Revokes old Object URLs via `URL.revokeObjectURL(url)` on page change, identity change, or unmount.
- **Cancellation**: Uses `AbortController` signal passed to `fetch()`. Aborts previous request on page/file change.
- **Error Handling**: Captures fetch/HTTP errors, supports 404 auto-session recovery (creates new session and retries page fetch once).
- **Caching**: Local `cacheRef` (`Map<string, string>`) keyed by `${sessionId}:${pageNumber}:${scale}`.
- **Deduplication**: In-flight `sessionPromiseRef` deduplicates concurrent `createSession` calls.
- **Thumbnails/Sizes**: Hardcoded scale `"2.0"`.
- **Suitability for ServerPdfRenderer**: Highly suitable as the reference pattern for `ServerPdfRenderer`.

### Implementation 2: `useStudioPreview` Hook
- **File Path**: `pdfnest/hooks/useStudioPreview.ts`
- **Purpose**: Dedicated server-side preview hook for `StudioWorkspace`.
- **Type**: Server-side rendering.
- **Input**: `{ activeFile: File | null, pageNumber: number, onError: (message: string) => void }`
- **Output**: `{ previewSrc, isRendering, sessionId, pageCount, clearPreview, resetPreview, clearPreviewCache }`
- **Differences from `usePdfPreview`**:
  - Checks cache *before* making network request; returns cached Object URL instantly without fetching if present.
  - Uses boolean `cancelled` flag in cleanup effect rather than `AbortController`.
  - Duplicate implementation of `usePdfPreview` logic.

### Implementation 3: PDF.js Client-Side Page Renderer (`LoadPdfJs` / Studio Tools)
- **File Paths**:
  - `pdfnest/components/shared/LoadPdfJs.tsx`
  - `pdfnest/components/studio/tools/RotateTool.tsx`
  - `pdfnest/components/studio/tools/DeletePagesTool.tsx`
  - `pdfnest/components/studio/tools/ReorderPagesTool.tsx`
  - `pdfnest/components/tools/DeletePagesWorkspace.tsx`
- **Purpose**: Dynamic client-side PDF page rendering directly onto HTML5 `<canvas>` using PDF.js.
- **Type**: Client-side rendering.
- **Input**: `File` or `ArrayBuffer` -> `pdfjsLib.getDocument({ data: typedArray })` -> `doc.getPage(pageNumber)`.
- **Output**: HTML5 `<canvas>` element rendered with page content, or `canvas.toDataURL("image/jpeg", 0.6)`.
- **Page Numbering**: 1-based index (`doc.getPage(1)` .. `doc.getPage(numPages)`).
- **Scale/Dimensions**: `page.getViewport({ scale: 0.3 })` for thumbnails, `scale: 1.0` or custom scale for workspace tools.
- **PDF Representation**: `ArrayBuffer` / `Uint8Array` of the PDF file.
- **PDF.js Usage**: Yes (`pdfjs-dist`, setting `GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs"`).
- **Canvas Usage**: Yes (`page.render({ canvasContext, viewport })`).
- **Blob/Object URL**: N/A for canvas; uses `toDataURL` for image data strings in grid thumbnails.
- **Cancellation**: Page render task returns `{ promise, cancel() }`. Some components call `renderTask.cancel()` on unmount/abort.
- **Error Handling**: `try/catch` blocks around `getDocument` and `getPage`.
- **Caching**: Ad-hoc component state or refs.
- **Deduplication**: None.
- **Thumbnails/Sizes**: Supports custom scale per component (0.3 for grid thumbnails, 1.0 for main editor).
- **Suitability for ClientPdfRenderer**: Highly suitable pattern for `ClientPdfRenderer`.

### Implementation 4: Backend Preview Session Pipeline (`pdfnest-backend`)
- **File Paths**:
  - `pdfnest-backend/internal/conversion/routes.go`
  - `pdfnest-backend/internal/conversion/controller.go`
  - `pdfnest-backend/internal/conversion/pageToImageStream.go`
- **Purpose**: Receives PDF uploads from frontend, manages session creation, computes SHA-256 fingerprints, proxies rendering requests to worker.
- **Endpoints**:
  - `POST /api/conversion/preview/session` -> accepts multipart `file`, returns `{ session_id, page_count }`.
  - `GET /api/conversion/preview/session/:sessionId/page/:pageNumber?scale=2.0` -> streams `image/jpeg` payload.
- **DPI Calculation**: `dpi = int(72.0 * scale)` (scale `2.0` -> `144 DPI`).

### Implementation 5: Worker PyMuPDF Rendering Engine (`pdfnest-worker`)
- **File Paths**:
  - `pdfnest-worker/app/api/tools/render/router.py`
  - `pdfnest-worker/app/api/tools/render/session.py`
  - `pdfnest-worker/app/api/tools/render/renderer.py`
- **Purpose**: Uses **PyMuPDF (`fitz`)** to open PDF document handles and rasterize pages into JPEG images (`PIL` quality 85).
- **Worker Cache**: In-memory `page_cache["<page>:<dpi>"]` stores rendered JPEG bytes per session.

---

## Client Rendering Analysis

### Current Implementation
- Loads `pdfjs-dist` dynamically (`import("pdfjs-dist")`).
- Sets `pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + "/pdf.worker.mjs"`.
- Reads `File` into `ArrayBuffer` (`await file.arrayBuffer()`).
- Calls `pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise`.
- Fetches page via `pdfDoc.getPage(pageNumber)`.
- Calculates viewport `const viewport = page.getViewport({ scale })`.
- Renders to `<canvas>` via `page.render({ canvasContext, viewport })`.

### Reusable Logic
- `LoadPdfJs.tsx` helper pattern for initializing worker source and importing `pdfjs-dist`.
- `pdfDoc.getPage(pageNumber)` and `page.render({ canvasContext, viewport })` workflow.

### Problems & Limitations
- Duplicate loading of PDF.js across 10+ tool components.
- Repeated parsing of the same PDF `ArrayBuffer` on every tool open / page switch.
- Unbound memory usage when multiple `PDFDocumentProxy` instances remain un-destroyed.
- Ad-hoc canvas creation without central lifecycle management.

---

## Server Rendering Analysis

### Current Implementation
- `usePdfPreview` and `useStudioPreview` make HTTP requests to the backend preview session endpoints.
- Backend forwards request to Python worker running PyMuPDF (`fitz`).
- Returns raw `image/jpeg` byte stream.
- Frontend turns stream into `Blob` and `URL.createObjectURL(blob)`.

### Reusable Logic
- Session creation (`POST /api/conversion/preview/session`).
- Page rendering request (`GET /api/conversion/preview/session/:id/page/:num?scale=:scale`).
- `404` session expiration recovery flow.

### Problems & Limitations
- `usePdfPreview` and `useStudioPreview` duplicate 90% of the same session fetch, caching, and state management code.
- `usePdfPreview` re-fetches pages even when already cached in memory.
- Object URLs are stored in ad-hoc React `useRef` maps without central LRU cache limits.

---

## Existing Data Flow

```
[ User Uploads File / Changes Page ]
                 │
                 ├──► Client-Side PDF.js Path (e.g., DeletePages, Page Grid, Tool Previews)
                 │    │
                 │    ├─► file.arrayBuffer()
                 │    ├─► pdfjsLib.getDocument({ data: Uint8Array })
                 │    ├─► pdfDoc.getPage(pageNumber)
                 │    ├─► page.getViewport({ scale })
                 │    └─► page.render({ canvasContext, viewport })
                 │
                 └──► Server-Side Preview Path (usePdfPreview / useStudioPreview)
                      │
                      ├─► POST /api/conversion/preview/session (Multipart Form)
                      │   └─► Backend SHA-256 Hash -> Worker Session (PyMuPDF fitz.open)
                      │
                      └─► GET /api/conversion/preview/session/:id/page/:num?scale=2.0
                          └─► Worker PyMuPDF fitz.render_page -> PIL JPEG (quality 85)
                              └─► Response Blob -> URL.createObjectURL(blob) -> <img src="blob:..." />
```

---

## PreviewRequest Mapping

| Field | Current Usage | Notes |
|---|---|---|
| `document` | `document.id`, `document.file` used for identity & source | `DocumentHandle` provides `file` or `id` for session |
| `page` | 1-based page number | Directly mapped to `page` in PDF.js `getPage(p)` and API `:page` |
| `mode` | Observed existing usages: `thumbnail` (~0.3), `small` (~0.5), `page`/`large`/`full` (1.5–2.0) | **Architectural Note**: These scale values are observations of current hooks. They MUST NOT become hardcoded PreviewRequest/type-level rendering policy. Mode/size policy remains isolated. |
| `renderer` | `"auto"`, `"client"`, `"server"` | Renderer selection managed by `PreviewManager` |
| `width` | Optional override | Used to compute viewport scale if explicit `scale` is omitted |
| `height` | Optional override | Used to compute viewport scale if explicit `scale` is omitted |
| `priority` | Currently ignored | Can be passed to request queue in future |
| `scale` | Explicit number (e.g., 2.0) | **Adapter behavior**: Renderer respects `request.scale` when explicitly supplied. Adapters do not invent arbitrary default scale policies. |

---

## Resource Lifecycle

1. **Canvas Lifecycle**:
   - `ClientPdfRenderer` produces `PreviewResource { type: "canvas", canvas: HTMLCanvasElement, width, height }`.
   - Cleanup: Clear canvas context (`ctx.clearRect(0, 0, width, height)`), reset canvas width/height to 0 to free GPU memory.

2. **Blob / Object URL Lifecycle**:
   - `ServerPdfRenderer` produces `PreviewResource { type: "image-url", url: string, revoke: () => void }`.
   - `revoke` callback executes `URL.revokeObjectURL(url)`.
   - `PreviewCache` / `PreviewManager` invokes `revoke()` when reference count drops to 0.

3. **PDF.js Document Lifecycle**:
   - `PDFDocumentProxy` destroyed via `pdfDoc.destroy()` when document changes or renderer unmounts.

---

## Cancellation

- **Server-side**: Cancelled via `AbortController.abort()` passed to `fetch()`.
- **Client-side**: Cancelled via `renderTask.cancel()` returned by PDF.js `page.render()`.

---

## Caching & Deduplication

- **Existing**: Ad-hoc `useRef` maps in `usePdfPreview` and `useStudioPreview`. No central LRU eviction.
- **Centralized**: Handled completely by `PreviewCache` and `PreviewManager` (already implemented and tested in Phase 1 Milestones 2-3).

---

## Duplication Identified

1. `usePdfPreview.ts` vs `useStudioPreview.ts`: Two parallel hooks doing identical server session creation and page fetching.
2. 10+ tool components loading PDF.js independently with redundant worker setup and document parsing.

---

## Proposed Thin Adapter Boundary

```
PreviewManager (Orchestrator, Cache, Deduplication, Retain/Release)
    │
    ├── ClientPdfRenderer (Capabilities: client=true, server=false)
    │   ├── Loads PDF.js document once
    │   ├── Calls page.getViewport() and page.render()
    │   └── Returns PreviewResource { type: "canvas", canvas, width, height, revoke }
    │
    └── ServerPdfRenderer (Capabilities: client=false, server=true)
        ├── Calls POST /api/conversion/preview/session (or reuses active session)
        ├── Calls GET /api/conversion/preview/session/:id/page/:num?scale=:scale
        └── Returns PreviewResource { type: "image-url", url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) }
```

---

## Open Questions

- *None* — All source code, data flows, API contracts, and component usages have been fully inspected and mapped.

---

## Recommended Milestone 4 Implementation Sequence

1. **Step 4B: Implement `ClientPdfRenderer`** (`pdfnest/lib/preview/ClientPdfRenderer.ts`):
   - Thin wrapper over PDF.js (`pdfjs-dist`).
   - Accepts `PreviewRequest` with `document.file`.
   - Renders PDF page to HTML5 `<canvas>`.
   - Implements `PreviewRenderer` interface (`capabilities: { client: true, server: false }`).

2. **Step 4C: Implement `ServerPdfRenderer`** (`pdfnest/lib/preview/ServerPdfRenderer.ts`):
   - Thin wrapper over backend preview session REST API.
   - Manages session lifecycle (`POST /session`, `GET /page`).
   - Fetches page blob, creates Object URL.
   - Implements `PreviewRenderer` interface (`capabilities: { client: false, server: true }`).

3. **Step 4D: Unit Tests**:
   - `tests/unit/clientPdfRenderer.test.ts`
   - `tests/unit/serverPdfRenderer.test.ts`
