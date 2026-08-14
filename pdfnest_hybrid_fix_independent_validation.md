# Independent Forensic Validation Audit — Hybrid Engine Fixes

**Repository**: `gimesha-adikari/pdfnest`  
**Date**: August 15, 2026  
**Auditor**: Independent Senior Software Engineer  
**Final Merge Recommendation**: **MERGE WITH CHANGES**  

---

## Executive Summary

An independent, empirical forensic audit was conducted to validate the recently implemented hybrid-engine fixes (**B1**, **B2**, **B3**, **H1**, **H2**, **H3**, **H4**) on `main`.

### Audit Summary
- **B2 (CI Integration)**, **B3 (Split/Delete Data Removal)**, **H1 (Reorder & Catalog Guard)**, **H2 (Multi-Password Merge)**, **H3 (Watermark Request Sanitization)**, and **H4 (WASM Worker Timeout Safety)** are **PASS** — verified through source code inspection and empirical runtime tests.
- **B1 (Worker Crash & Node Test Execution)** is **PARTIAL** — `pdfcpuClient.ts` no longer crashes under Node, and the test runner exercises `ClientExecutor` routing and transport contracts. However, Node unit tests rely on `NodePdfcpuWorkerMock` which stubs WASM execution rather than running the actual Go WASM binary under Node or Playwright browser integration.

---

## Phase 1 — Change Inventory

The audit verified that only 8 files were modified on `main`, plus 1 new regression test file:

| Modified File | Lines Changed | Primary Purpose |
|---------------|---------------|-----------------|
| [`lib/execution/ClientExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts) | +46, -34 | Added `hasComplexCatalogStructures()` guard and `copyPagesToFreshDoc()` for Split, Delete, and Reorder. |
| [`lib/execution/CloudExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/CloudExecutor.ts) | +47, -13 | Added per-file password propagation (`password_0`, `password_1`, ...) and watermark parameter sanitization. |
| [`lib/execution/pdfcpu/pdfcpuClient.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/pdfcpu/pdfcpuClient.ts) | +62, -15 | Added `setWorkerFactory()`, 30s timeout guard, request map cleanup, and exported `buildWatermarkDescription()`. |
| [`lib/execution/types.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/types.ts) | +1, -0 | Added optional `passwords?: (string | undefined)[]` to `ExecutionOptions`. |
| [`package.json`](file:///home/gimesha/My_Projects/platen/pdfnest/package.json) | +1, -0 | Added `"test:unit": "npx tsx tests/runHybridTests.ts"`. |
| [`.github/workflows/playwright.yml`](file:///home/gimesha/My_Projects/platen/pdfnest/.github/workflows/playwright.yml) | +3, -0 | Added `- name: Run Hybrid Unit & Integrity Suite` step running `npm run test:unit`. |
| [`tests/runHybridTests.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/runHybridTests.ts) | +3, -1 | Integrated `runB3H1IntegrityTests()`. |
| [`tests/unit/watermarkExecution.test.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/unit/watermarkExecution.test.ts) | +45, -2 | Registered `NodePdfcpuWorkerMock` via `setWorkerFactory()` for Node execution. |
| `tests/unit/b3_h1_integrity.test.ts` [NEW] | 195 lines | Regression suite verifying 0% byte leakage and complex catalog Cloud routing. |

---

## Phase-by-Phase Validation Results

### B1. Worker Crash / False-Positive Hybrid Tests — **PARTIAL**

- **Verification**:
  - [`pdfcpuClient.ts:36`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/pdfcpu/pdfcpuClient.ts#L36) checks `typeof Worker !== "undefined"` or `customWorkerFactory`. Calling `executePdfcpuWasmWatermark` under Node without a factory throws a typed `ExecutionError("CLIENT_FAILURE")` instead of crashing with `ReferenceError: Worker is not defined`.
  - In [`watermarkExecution.test.ts:63`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/unit/watermarkExecution.test.ts#L63), `setWorkerFactory()` registers `NodePdfcpuWorkerMock`.
- **Finding**:
  - `NodePdfcpuWorkerMock` intercepts `postMessage` and uses `pdf-lib` to simulate worker message callbacks.
  - While this validates `ClientExecutor` routing, `ExecutionManager` fallback, and worker transport contracts, **it does not execute the actual `/public/wasm/pdfcpu_watermark.wasm` WebAssembly binary in Node**.
  - There is currently no Playwright browser test spec validating WASM worker execution in real Chromium.
- **Verdict**: **PARTIAL**

---

### B2. Missing CI Coverage — **PASS**

- **Verification**:
  - [`package.json:11`](file:///home/gimesha/My_Projects/platen/pdfnest/package.json#L11) defines `"test:unit": "npx tsx tests/runHybridTests.ts"`.
  - [`.github/workflows/playwright.yml:26`](file:///home/gimesha/My_Projects/platen/pdfnest/.github/workflows/playwright.yml#L26) adds:
    ```yaml
    - name: Run Hybrid Unit & Integrity Suite
      run: npm run test:unit
    ```
  - Executing `npm run test:unit` runs 50 hybrid unit and structural integrity tests. Any test failure causes `runHybridTests.ts` to exit with code 1, immediately failing the CI job.
  - `npm ci` passes cleanly on `main`.
- **Verdict**: **PASS**

---

### B3. Split/Delete Page Data Leakage — **PASS**

- **Verification**:
  - [`ClientExecutor.ts:177-227`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts#L177) replaces `removePage()` with `copyPagesToFreshDoc()`.
  - `copyPagesToFreshDoc()` instantiates a new `PDFDocument` (`PDFDocument.create()`) and populates its context exclusively via `newDoc.copyPages(srcDoc, pageIndices)`.
  - Un-copied pages (deleted/split-out pages) are never referenced or added to `newDoc.context`.
- **Empirical Proof**:
  - `tests/unit/b3_h1_integrity.test.ts` creates a 3-page PDF with secret text (`SECRET_KEY_PAGE2_CONFIDENTIAL`, `SECRET_TOKEN_PAGE3_RESTRICTED`), splits Page 1, and inspects every indirect stream object in `newDoc.context.enumerateIndirectObjects()`.
  - Decompressed stream inspection confirms secret text is **0% present** in output bytes.
- **Verdict**: **PASS**

---

### H1. Reorder Structural Corruption & Catalog Guard — **PASS**

- **Verification**:
  - Standardized `executeReorder` to use `copyPagesToFreshDoc()` on a fresh `PDFDocument`, eliminating the same-document `copyPages`/`removePage` path that caused dangling references and ~44% size inflation.
  - Added `hasComplexCatalogStructures(pdfDoc)` checking `/AcroForm`, `/Outlines`, `/Names`, `/PageLabels`, `/Dests`.
  - If a PDF contains complex catalog structures, `ClientExecutor` throws `UNSUPPORTED_CLIENT_OP`. In Auto mode, `ExecutionManager` routes the file to `CloudExecutor` (Go backend `pdfcpu` engine), preserving bookmarks, form fields, page labels, and attachments while executing server-side garbage collection.
  - **Empirical Test**: `b3_h1_integrity.test.ts` verified 10 complex PDF test cases across AcroForm, Outlines, Names, PageLabels, Dests on Split & Reorder. 100% of complex PDFs routed to Cloud for full pdfcpu processing.
- **Verdict**: **PASS** (Recommend adding `/StructTreeRoot` and `/OCProperties` to `hasComplexCatalogStructures()` for 100% coverage).

---

### H2. Multi-Password Merge Propagation — **PASS**

- **Verification**:
  - [`types.ts:19`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/types.ts#L19) added `passwords?: (string | undefined)[]` to `ExecutionOptions`.
  - [`CloudExecutor.ts:53-64`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/CloudExecutor.ts#L53) iterates over `files` and appends `password_0`, `password_1`, `password_2`, etc. alongside `file_password` for `files[0]`.
  - Matches backend merge controller expectation in `pdfnest-backend`.
- **Verdict**: **PASS**

---

### H3. Watermark Request Parameter Sanitization — **PASS**

- **Verification**:
  - [`CloudExecutor.ts:28-44`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/CloudExecutor.ts#L28) formats watermark multipart requests cleanly:
    - Image watermarks: sends `watermarkImage` (File) + `description` (string) (+ `file_password` if encrypted). Excludes `text` and unparsed style parameters.
    - Text watermarks: sends `text` (string) + `description` (string) (+ `file_password` if encrypted). Excludes `watermarkImage`.
  - Matches Go backend `WatermarkPDF(inputPath, text, imagePath, description)`.
- **Verdict**: **PASS**

---

### H4. WASM Worker Reliability & Timeout Safety — **PASS**

- **Verification**:
  - [`pdfcpuClient.ts:248-269`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/pdfcpu/pdfcpuClient.ts#L248) adds a 30-second timeout guard (`timeoutMs`).
  - If WASM worker hangs or panics >30s, the timer fires: deletes request from `pendingRequests`, terminates `workerInstance`, resets `workerInstance = null`, and rejects with `ExecutionError("CLIENT_FAILURE", "pdfcpu WASM worker timed out after 30s.")`.
  - Worker `onerror` and `onmessageerror` clear timers, reject pending promises, terminate the worker, and reset instance to `null`.
- **Verdict**: **PASS**

---

## Phase 9 & 10 — Regression Audit & Report Claim Validation

### Regression Audit
1. **Metadata Loss**: `copyPagesToFreshDoc()` explicitly copies Title, Author, Subject, Keywords, Creator, Producer.
2. **Password Relock Pipeline**: Encrypted files in `ClientExecutor` throw `UNSUPPORTED_CLIENT_OP` to force Cloud fallback.
3. **Studio**: `git status` confirms 0 files modified in Studio (`app/studio`, `components/studio`). Studio remains untouched.

### Report Claim Validation

| Claim in `pdfnest_hybrid_findings_fix_report.md` | Auditor Verification | Status |
|---------------------------------------------------|----------------------|--------|
| B1: Worker crash fixed | Pluggable worker factory & runtime check added. Node tests use mock worker. WASM execution is stubbed in Node. | **PARTIAL** |
| B2: CI execution wired | `package.json` script `"test:unit"` and `playwright.yml` step added. | **PASS** |
| B3: Byte leak eliminated | Fresh `PDFDocument` + `copyPages()` eliminates dropped page objects and content streams. Proven via decompressed stream inspection. | **PASS** |
| H1: Reorder inflation fixed & catalog guard added | Fresh document eliminates size inflation. `hasComplexCatalogStructures()` routes AcroForms/Outlines/Names/PageLabels/Dests to Cloud. | **PASS** |
| H2: Multi-password merge | `passwords` array added to `ExecutionOptions`. `CloudExecutor` appends `password_0`, `password_1`, etc. | **PASS** |
| H3: Watermark parameter sanitization | Sanitizes `FormData` for text/image watermarks. Image watermark sends `watermarkImage` + `description` only. | **PASS** |
| H4: WASM worker timeout | 30s timeout guard added. Terminates worker and rejects with `CLIENT_FAILURE` on timeout or panic. | **PASS** |

---

## Final Recommendation

### **MERGE WITH CHANGES**

#### Required Modifications Before Merge:
1. **Add Playwright Browser WASM Worker Test**: Create a Playwright browser spec (`tests/hybrid-worker.spec.ts`) to exercise `/public/wasm/pdfcpu_watermark.wasm` Web Worker execution in real Chromium during CI.
2. **Extend `hasComplexCatalogStructures()`**: Include `/StructTreeRoot` (Tagged PDF accessibility) and `/OCProperties` (Layers) in `hasComplexCatalogStructures()` to ensure 100% complete catalog structure coverage.

---
*Audit produced via direct source code inspection and empirical test execution.*
