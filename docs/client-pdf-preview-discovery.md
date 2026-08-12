# Phase 4 Discovery & Audit: Client-Side PDF Preview Generation

This document provides a comprehensive audit of all client-side PDF preview rendering across the codebase, assesses compatibility with `ClientPdfRenderer` / `usePreview` / `PreviewManager`, identifies non-preview PDF.js usages, and proposes a phased implementation plan for Phase 4.

---

## 1. Executive Summary

- **Total Client-Side Rendering Sites Audited**: 31 components across standalone workspaces and Studio tools.
- **Pure Preview Rendering Sites (Candidates for Migration)**: 21 components (14 workspace/tool thumbnail grids/previews + 7 interactive canvas background previews).
- **Non-Preview / Analysis Sites (MUST NOT Migrate)**: 10 components/helpers (text selection/extraction, coordinate transformation, PDF structure parsing, metadata extraction).
- **Core API Gap Identified**: `ClientPdfRenderer.render()` currently returns `{ type: "canvas", canvas: HTMLCanvasElement }` without a `url: string` property. `usePreview` extracts `resource.url ?? ""`. For `usePreview` to support client-side rendering (`renderer: "client"`), `ClientPdfRenderer` must populate `url` (e.g., via `canvas.toDataURL()` or `URL.createObjectURL(blob)`).

---

## 2. Detailed Audit of Client-Side PDF Rendering Locations

### Category A: Studio Tool Panel Thumbnails (Single Page / Low Scale)

| Component | PDF.js Usage | Purpose | Scale / Zoom | Current Lifecycle & Cancellation | PreviewManager Benefit | Migration Decision |
|---|---|---|---|---|---|---|
| [`components/studio/tools/RotateTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/RotateTool.tsx) | `pdf.getPage(1)` + `page.render()` | Render side-panel page 1 thumbnail | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH (reused when toggling tool) | **Migrate** to `usePreview({ scale: 0.2, renderer: "client" })` |
| [`components/studio/tools/DeletePagesTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/DeletePagesTool.tsx) | `pdf.getPage(n)` + `page.render()` | Side-panel page deletion thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/studio/tools/ReorderPagesTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/ReorderPagesTool.tsx) | `pdf.getPage(n)` + `page.render()` | Side-panel page reorder thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/studio/tools/SplitTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/SplitTool.tsx) | `pdf.getPage(n)` + `page.render()` | Side-panel split preview thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/studio/tools/MergeTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/MergeTool.tsx) | `pdf.getPage(1)` + `page.render()` | Side-panel merge list file thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/studio/tools/DuplicatePagesTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/DuplicatePagesTool.tsx) | `pdf.getPage(n)` + `page.render()` | Side-panel page duplication thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/studio/tools/InsertBlankTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/InsertBlankTool.tsx) | `pdf.getPage(n)` + `page.render()` | Side-panel page thumbnails | Scale 0.2 | `canvas.toDataURL()`, no cancellation | HIGH | **Migrate** to `usePreview` |

---

### Category B: Standalone Workspace Grid Previews (Multi-Page Grid Views)

| Component | PDF.js Usage | Purpose | Scale / Zoom | Current Lifecycle & Cancellation | PreviewManager Benefit | Migration Decision |
|---|---|---|---|---|---|---|
| [`components/tools/RotatePdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/RotatePdfWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for rotation | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview({ scale: 0.3, renderer: "client" })` |
| [`components/tools/SplitPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/SplitPdfWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for page splitting | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/tools/DeletePagesWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/DeletePagesWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for page deletion | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/tools/ReorderPagesWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/ReorderPagesWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for drag-and-drop reorder | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/tools/MergePdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/MergePdfWorkspace.tsx) | `pdf.getPage(1)` per file | File preview thumbnails in merge queue | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/tools/DuplicatePagesWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/DuplicatePagesWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for page duplication | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |
| [`components/tools/InsertBlankWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/InsertBlankWorkspace.tsx) | `pdf.getPage(i)` in loop | Grid thumbnail previews for page insertion | Scale 0.3 | `canvas.toDataURL("image/jpeg", 0.6)`, no cancellation | HIGH | **Migrate** to `usePreview` |

---

### Category C: Interactive Canvas Overlay Workspaces & Studio Tools

| Component | PDF.js Usage | Purpose | Scale / Zoom | Current Cancellation & Coordinate Math | Migration Decision |
|---|---|---|---|---|---|
| [`components/tools/CropPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/CropPdfWorkspace.tsx) & [`CropTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/CropTool.tsx) | `page.render()` on DOM `<canvas>` ref | Background raster + `baseViewport` PDF point calculation | Scale 1.5 | Cancels via `renderTask.cancel()`. Calculates PDF page point bounds for crop box coordinates | **Migrate Background Rendering** to `usePreview`, keep viewport geometry calculation local |
| [`components/tools/WatermarkPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/WatermarkPdfWorkspace.tsx) & [`WatermarkTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/WatermarkTool.tsx) | `page.render()` on DOM `<canvas>` ref | Background raster + page dimension math | Scale 1.5 | Cancels via `renderTask.cancel()`. Calculates page geometry for watermark placement | **Migrate Background Rendering** to `usePreview`, keep geometry local |
| [`components/tools/PageNumbersWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/PageNumbersWorkspace.tsx) & [`PageNumbersStudioTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/PageNumbersStudioTool.tsx) | `page.render()` on DOM `<canvas>` ref | Background raster + position selection geometry | Scale 1.5 | Cancels via `renderTask.cancel()`. Calculates page bounds | **Migrate Background Rendering** to `usePreview`, keep geometry local |
| [`components/tools/AddTextWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/AddTextWorkspace.tsx) & [`AddTextTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/AddTextTool.tsx) | `page.render()` on DOM `<canvas>` ref | Background raster + text overlay drag coordinates | Scale 1.5 | Cancels via `renderTask.cancel()`. Calculates page bounds | **Migrate Background Rendering** to `usePreview`, keep geometry local |
| [`components/tools/RedactPdfWorkspace.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/tools/RedactPdfWorkspace.tsx) & [`RedactTool.tsx`](file:///home/gimesha/My_Projects/platen/pdfnest/components/studio/tools/RedactTool.tsx) | `page.render()` on DOM `<canvas>` ref | Background raster + redaction box coordinates | Scale 1.5 | Cancels via `renderTask.cancel()`. Calculates page bounds | **Migrate Background Rendering** to `usePreview`, keep geometry local |

---

## 3. Non-Preview / Document Analysis Usages (MUST NOT BE MIGRATED)

The following PDF.js usages do **NOT** perform preview image rendering and **MUST NOT** be migrated to `ClientPdfRenderer` / `usePreview`:

1. **`HighlightPdfWorkspace.tsx` / `HighlightTool.tsx` (text pages)**
   - **Usage**: Calls `page.getTextContent()` to extract text items and character bounding boxes for text selection highlights.
   - **Reason**: This is document content analysis for text selection, not image rendering.

2. **`UnderlinePdfWorkspace.tsx` / `UnderlineTool.tsx` (text pages)**
   - **Usage**: Calls `page.getTextContent()` for text selection.
   - **Reason**: Document content analysis.

3. **`StrikeoutPdfWorkspace.tsx` / `StrikeoutTool.tsx` (text pages)**
   - **Usage**: Calls `page.getTextContent()` for text selection.
   - **Reason**: Document content analysis.

4. **`hooks/useStudioDocument.ts`**
   - **Usage**: Calls `pdfjsLib.getDocument()` to inspect total page count (`numPages`) and document structure when loading a file into Studio.
   - **Reason**: Structural document metadata analysis.

5. **`components/shared/LoadPdfJs.tsx`**
   - **Usage**: Utility loader for configuring `pdfjsLib.GlobalWorkerOptions.workerSrc`.
   - **Reason**: Shared infrastructure helper.

---

## 4. Contract Analysis & Prerequisite Engine Improvements

### Current Gap in `ClientPdfRenderer`

- **Contract**: `usePreview` consumes `result.resource.url ?? ""`.
- **Current `ClientPdfRenderer` Return Value**:
  ```ts
  return {
      type: "canvas",
      canvas: HTMLCanvasElement,
      width: number,
      height: number,
      renderedBy: "client-pdfjs",
      revoke: () => { ... }
  };
  ```
- **Problem**: `url` is `undefined`. When a component calls `usePreview({ renderer: "client" })`, `usePreview` receives `resource.url` as `undefined` and sets `src = ""`, failing to deliver the preview image.
- **Required Modification**: Update `ClientPdfRenderer.render()` to generate a data URL or Blob Object URL (e.g. `canvas.toDataURL("image/png")`) and attach it as `url` on the returned `PreviewResource`.

---

## 5. Proposed Phased Implementation Plan

### Step 0: Contract Adaptation & Infrastructure Tests (Prerequisite)
1. **Update `ClientPdfRenderer.ts`**: Generate `url` on the returned `PreviewResource` so `usePreview` receives a valid image URL string when `renderer: "client"`.
2. **Update Unit Tests**: Update `tests/unit/clientPdfRenderer.test.ts` and `tests/unit/usePreview.test.ts` to test client-side rendering delivering `src` via `usePreview`.

### Step 1: Phase 4A — Studio Side-Panel Tool Thumbnails (Lowest Risk)
- Migrate 7 Studio side-panel tools to `usePreview({ scale: 0.2, renderer: "client" })`:
  1. `components/studio/tools/RotateTool.tsx`
  2. `components/studio/tools/DeletePagesTool.tsx`
  3. `components/studio/tools/ReorderPagesTool.tsx`
  4. `components/studio/tools/SplitTool.tsx`
  5. `components/studio/tools/MergeTool.tsx`
  6. `components/studio/tools/DuplicatePagesTool.tsx`
  7. `components/studio/tools/InsertBlankTool.tsx`

### Step 2: Phase 4B — Standalone Workspace Grid Previews (Medium Risk)
- Migrate 7 standalone workspace page grid previews to `usePreview({ scale: 0.3, renderer: "client" })`:
  1. `components/tools/RotatePdfWorkspace.tsx`
  2. `components/tools/SplitPdfWorkspace.tsx`
  3. `components/tools/DeletePagesWorkspace.tsx`
  4. `components/tools/ReorderPagesWorkspace.tsx`
  5. `components/tools/MergePdfWorkspace.tsx`
  6. `components/tools/DuplicatePagesWorkspace.tsx`
  7. `components/tools/InsertBlankWorkspace.tsx`

### Step 3: Phase 4C — Interactive Overlay Tools (Highest Risk)
- Migrate background page preview rendering to `usePreview({ scale: 1.5, renderer: "client" })` while preserving local coordinate transformation and viewport geometry logic:
  1. `CropPdfWorkspace.tsx` & `CropTool.tsx`
  2. `WatermarkPdfWorkspace.tsx` & `WatermarkTool.tsx`
  3. `PageNumbersWorkspace.tsx` & `PageNumbersStudioTool.tsx`
  4. `AddTextWorkspace.tsx` & `AddTextTool.tsx`
  5. `RedactPdfWorkspace.tsx` & `RedactTool.tsx`

---
