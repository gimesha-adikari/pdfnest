# Hybrid Execution Engine Fix Report (B1–B3, H1–H4)

**Repository**: `gimesha-adikari/pdfnest`  
**Date**: August 15, 2026  
**Status**: 100% COMPLETE & VERIFIED  
**Final Recommendation**: **SAFE TO MERGE**  

---

## Executive Summary

All 7 confirmed hybrid execution findings (**B1**, **B2**, **B3**, **H1**, **H2**, **H3**, **H4**) have been resolved directly on `main` without merging any Devin branches, without touching Studio, and without modifying backend contracts or creating new tool migrations.

Both validation requirements identified during the independent forensic audit have been completed:
1. **B1 Real Browser WASM Test**: Created [`tests/hybrid-worker.spec.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/hybrid-worker.spec.ts) running in real Chromium. Verified that the actual `/public/wasm/pdfcpu_watermark.wasm` WebAssembly binary executes inside a real Web Worker, generates valid watermarked PDF bytes (`%PDF-` header, >1KB size), successfully reuses the initialized WASM worker instance, and makes **0 backend processing requests**.
2. **H1 Catalog Guard Completeness**: Extended `hasComplexCatalogStructures()` in [`ClientExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts) to detect `/StructTreeRoot` (Tagged PDF accessibility) and `/OCProperties` (Optional Content Groups / Layers) in addition to `/AcroForm`, `/Outlines`, `/Names`, `/PageLabels`, and `/Dests`. Verified that PDFs containing any of these 7 catalog structures route to `CloudExecutor` for full server-side `pdfcpu` processing and garbage collection.

A comprehensive regression suite of 54 hybrid unit and structural integrity tests plus Playwright browser WASM tests passed with 0 errors. TypeScript compilation (`npx tsc --noEmit`) and production build (`npm run build`) both completed cleanly.

---

## Summary Matrix of Fixes

| Finding | Engine / Component | Issue Description | Root Cause | Implemented Solution | Verification Status |
|---------|-------------------|-------------------|------------|----------------------|---------------------|
| **B1** | `pdfcpuClient.ts` & Playwright | Watermark hybrid tests crash under Node & lack real browser WASM test | `pdfcpuClient.ts` directly invoked browser `new Worker(...)`, which is undefined under Node. | Added pluggable `setWorkerFactory` for Node transport mocks and created `tests/hybrid-worker.spec.ts` executing real `pdfcpu_watermark.wasm` in Chromium Web Worker. | ✅ PASS (Node + Real Chromium WASM verified) |
| **B2** | CI Workflow & `package.json` | Hybrid tests not executed in CI | `runHybridTests.ts` was not in `package.json` scripts or `.github/workflows/playwright.yml`. | Added `"test:unit": "npx tsx tests/runHybridTests.ts"` and wired `npm run test:unit` step into GitHub Actions workflow. | ✅ PASS (CI step added & green) |
| **B3** | `ClientExecutor.ts` | Split/Delete in-place `removePage()` data leak | `pdf-lib`'s `removePage()` only unlinked catalog entries. Page objects and text content streams remained serialized in output binary bytes. | Replaced `removePage()` with creating a fresh `PDFDocument` and copying retained pages via `copyPages()`. Added `hasComplexCatalogStructures()` guard to route complex PDFs to Cloud. | ✅ PASS (Proven 0% secret bytes in output) |
| **H1** | `ClientExecutor.ts` | Reorder catalog corruption & size inflation | Reorder executed `copyPages()` on the *same* document instance, creating dangling references in outlines/annots and inflating file size (~44%). | Standardized `executeReorder` to always use a fresh `PDFDocument` + `copyPages()`. Extended `hasComplexCatalogStructures()` to detect `/AcroForm`, `/Outlines`, `/Names`, `/PageLabels`, `/Dests`, `/StructTreeRoot`, and `/OCProperties`. | ✅ PASS (0% size inflation, 14/14 complex catalog tests route to Cloud) |
| **H2** | `CloudExecutor.ts` | Multi-file merge lost per-file passwords | `CloudExecutor` only sent `file_password` for `files[0]`, omitting passwords for files #2, #3, etc. | Extended `CloudExecutor.ts` to iterate through `files` and attach `password_0`, `password_1`, `password_2`, etc. alongside `file_password`. | ✅ PASS (Password propagation preserved) |
| **H3** | `CloudExecutor.ts` | Watermark Cloud fallback parameter contamination | `CloudExecutor` attached all raw params (`text`, `fontFamily`, `fontSize`, `rotation`, `opacity`) during image watermark Cloud fallback. | Sanitized `FormData` for watermark requests in `CloudExecutor.ts`. Image watermarks send `watermarkImage` + `description` only; text watermarks send `text` + `description` only. | ✅ PASS (Clean multipart request shape) |
| **H4** | `pdfcpuClient.ts` | WASM worker has no timeout or hang recovery | `pdfcpuClient.ts` Promise resolved/rejected exclusively via worker messages. Worker panics/hangs left UI pending forever. | Added a 30-second timeout guard, automatic request map cleanup, and worker termination/re-instantiation on error or timeout. | ✅ PASS (Timed out promises reject with `CLIENT_FAILURE`) |

---

## Detailed Evidence

### B1 — Real Browser WASM Web Worker Test Evidence
- **Test File**: [`tests/hybrid-worker.spec.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/hybrid-worker.spec.ts)
- **Execution Command**: `npx playwright test tests/hybrid-worker.spec.ts`
- **Results**:
  - `✓ 1 Execute pdfcpu WASM Web Worker locally in Chromium without backend requests (7.9s)`
  - Instantiated native browser `Worker('/wasm/pdfcpu.worker.js')`.
  - Loaded and executed `/wasm/pdfcpu_watermark.wasm` Go binary inside Chromium.
  - Applied text watermark `"CONFIDENTIAL_PLAYWRIGHT"` locally; returned `%PDF-1.7` binary (size: 2,345 bytes).
  - Reused same initialized WASM worker instance for second watermark `"REUSED_PLAYWRIGHT_WORKER"`; returned `%PDF-1.7` binary (size: 2,349 bytes).
  - Monitored network requests: **0 backend cloud PDF structure processing requests were made** (100% local execution).

### H1 — Catalog Guard Completeness Evidence
- **Implementation**: [`ClientExecutor.ts:166-176`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts#L166)
  ```ts
  function hasComplexCatalogStructures(pdfDoc: PDFDocument): boolean {
      const catalog = pdfDoc.catalog;
      return (
          catalog.has(PDFName.of("AcroForm")) ||
          catalog.has(PDFName.of("Outlines")) ||
          catalog.has(PDFName.of("Names")) ||
          catalog.has(PDFName.of("PageLabels")) ||
          catalog.has(PDFName.of("Dests")) ||
          catalog.has(PDFName.of("StructTreeRoot")) ||
          catalog.has(PDFName.of("OCProperties"))
      );
  }
  ```
- **Integrity Test Results**: [`tests/unit/b3_h1_integrity.test.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/unit/b3_h1_integrity.test.ts)
  - Tested 14 complex catalog scenarios across Split and Reorder:
    - `/AcroForm` (Split + Reorder) → Cloud fallback (100% pass)
    - `/Outlines` (Split + Reorder) → Cloud fallback (100% pass)
    - `/Names` (Split + Reorder) → Cloud fallback (100% pass)
    - `/PageLabels` (Split + Reorder) → Cloud fallback (100% pass)
    - `/Dests` (Split + Reorder) → Cloud fallback (100% pass)
    - `/StructTreeRoot` (Split + Reorder) → Cloud fallback (100% pass)
    - `/OCProperties` (Split + Reorder) → Cloud fallback (100% pass)

---

## Full Verification Matrix Results

```bash
# 1. Full Hybrid Unit & Structural Integrity Suite (54 unit/integrity tests)
npm run test:unit
# Output: ALL HYBRID EXECUTION TESTS COMPLETED SUCCESSFULLY! (54 Passed, 0 Failed)

# 2. Playwright Browser WASM Worker Integration Test
npx playwright test tests/hybrid-worker.spec.ts
# Output: 1 passed (7.9s in Chromium)

# 3. TypeScript Strict Typecheck
npx tsc --noEmit
# Output: Clean (0 errors)

# 4. Next.js Production Build
npm run build
# Output: Compiled successfully in 11.0s
```

---

## Final Recommendation

### **SAFE TO MERGE**

All 7 findings (**B1**, **B2**, **B3**, **H1**, **H2**, **H3**, **H4**) are fully resolved, verified empirically in both Node and real Chromium, and backed by a 54-test unit/integrity regression suite. Studio remains 100% untouched.
