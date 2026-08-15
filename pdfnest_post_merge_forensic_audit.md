# PDFNest / Platen PDF — Post-Merge Forensic Regression Audit

**Repository**: `gimesha-adikari/pdfnest`  
**Branch**: `main` (`HEAD` @ `a1e071b`)  
**Date**: August 15, 2026  
**Auditor**: Independent Senior Software Engineer  
**Final Conclusion**: **BLOCKED — FIX BEFORE WAVE 2**  

---

## Executive Summary

A comprehensive post-merge forensic regression audit was conducted on current `main` after the four Devin maintenance branches (`devin/1786730261-security-hardening`, `devin/1786730305-unit-tests-low-coverage`, `devin/1786730353-error-handling`, and `devin/1786730633-shared-markup-utils`) were merged into `main`.

### Key Findings
1. **Build & Typecheck Baseline**: `npx tsc --noEmit` passed with **0 errors**. `npm run build` compiled successfully (**32 static/dynamic pages**). Real Chromium Playwright WASM integration test ([`tests/hybrid-worker.spec.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/hybrid-worker.spec.ts)) passed **100%**.
2. **Security & Error-Handling Status**: All security-hardening fixes (open redirect protection, SSRF target guard, Lock 50MB payload limits, JSON-LD tag escaping, HTTP security headers) and error-handling fixes (5-consecutive-failure polling ceiling, safe DB JSON parsing) are **CLEAN & ACTIVE** on `main`.
3. **CRITICAL HYBRID ENGINE REGRESSION**: When the remote Devin PR branches were merged on GitHub (`origin/main`), they branched off commit `52a0ee9` (prior to local commit `ca555da` / `f908d4a` containing the B1–B3 & H1–H4 hybrid fixes). The subsequent git merge of `origin/main` into local `main` **overwrote 3 core execution files** ([`ClientExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts), [`CloudExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/CloudExecutor.ts), and [`pdfcpuClient.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/pdfcpu/pdfcpuClient.ts)) with pre-fix code.
4. **Impact of Overwrite**: Reintroduced **B3 (deleted page data leakage)**, **H1 (Reorder file size inflation & catalog corruption)**, **H2 (multi-password merge loss)**, **H3 (watermark parameter contamination)**, and **H4 (WASM worker 30s timeout guard loss)**. As a result, [`tests/unit/b3_h1_integrity.test.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/tests/unit/b3_h1_integrity.test.ts) fails 16/16 tests on current `main`.

---

## Phase 1 — Current Main Health Baseline

- **TypeScript Compilation**: `npx tsc --noEmit` → **PASS** (0 errors).
- **Next.js Production Build**: `npm run build` → **PASS** (32 static & dynamic routes compiled in 12.5s).
- **Unit Suite (`runUnitTests.ts`)**: 14 of 15 test files passed (136 individual tests green).
- **Playwright WASM Spec**: `npx playwright test tests/hybrid-worker.spec.ts` → **PASS** (100% pass in Chromium, 8.2s).
- **Hybrid Integrity Suite**: `npx tsx tests/unit/b3_h1_integrity.test.ts` → **FAIL** (16/16 tests failed due to merge overwrite).

---

## Phase 2 & 3 — Hybrid Execution Engine Overwrite Analysis

### Root Cause Mechanism
Devin's PR branches (#1, #2, #3) were opened on GitHub against an earlier remote base commit `52a0ee9` before local commit `ca555da` / `f908d4a` (which contained the B1–B3 and H1–H4 hybrid fixes) was pushed. When `git pull origin main` merged `origin/main` into local `main`, git auto-merged pre-fix versions of `ClientExecutor.ts`, `CloudExecutor.ts`, and `pdfcpuClient.ts` over the local changes.

### Detailed Component Inventory of Overwritten Fixes

#### 1. [`lib/execution/ClientExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/ClientExecutor.ts)
- *What was lost*: `hasComplexCatalogStructures()` guard (detecting `/AcroForm`, `/Outlines`, `/Names`, `/PageLabels`, `/Dests`, `/StructTreeRoot`, `/OCProperties`) and `copyPagesToFreshDoc()` fresh document copying.
- *Reintroduced Regression*: Reverted `executeSplit`, `executeDelete`, and `executeReorder` to `pdfDoc.removePage()`.
  - **B3 Data Leakage**: Deleted pages remain serialized in output binary bytes.
  - **H1 Catalog Corruption & Size Inflation**: Reorder on same document instance causes dangling object references and ~44% size inflation.

#### 2. [`lib/execution/pdfcpu/pdfcpuClient.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/pdfcpu/pdfcpuClient.ts)
- *What was lost*: `setWorkerFactory()` pluggable transport and the 30-second `timeoutMs` timer guard.
- *Reintroduced Regression*: **H4 (WASM worker hang risk)** — panics or deadlocks in WASM worker leave promises pending indefinitely without cleanup or worker re-instantiation.

#### 3. [`lib/execution/CloudExecutor.ts`](file:///home/gimesha/My_Projects/platen/pdfnest/lib/execution/CloudExecutor.ts)
- *What was lost*: Multi-file password array propagation (`password_0`, `password_1`, ...) and watermark multipart parameter sanitization (`watermarkImage` vs `text`).
- *Reintroduced Regression*: **H2 (multi-file merge passwords lost for files #2, #3)** and **H3 (image watermark Cloud requests contain contaminating `text` fields)**.

---

## Phase 4 — Watermark WASM Verification

- **Browser Web Worker Path**: Standalone WASM worker execution in real Chromium (`tests/hybrid-worker.spec.ts`) **functions 100% correctly**.
  - `/wasm/pdfcpu.worker.js` and `/wasm/pdfcpu_watermark.wasm` load in Chromium.
  - Generates valid watermarked PDF bytes (`%PDF-1.7` header, >1KB size).
  - Reuses initialized WASM worker instance successfully.
  - **0 backend cloud requests** occurred during browser execution.
- **Node Transport Path**: `pdfcpuClient.ts` lost `setWorkerFactory()` and the 30s timeout guard during the merge overwrite, requiring re-application for Node unit testing.

---

## Phase 5 — Studio & Shared Markup Refactor Audit

- **Studio Build & Runtime**: `npm run build` and `npx tsc --noEmit` compile Studio cleanly without errors.
- **Refactor Impact**: Commit `b3c3026` (`shared-markup-utils`) extracted a unified markup editor abstraction (`useMarkupEditor` hook, `MarkupPdfWorkspace` component, `MarkupStudioTool` component).
- **Functionality**: Replaced individual tool files (`HighlightTool.tsx`, `UnderlineTool.tsx`, `StrikeoutTool.tsx`) with the unified `MarkupPdfWorkspace` component routed via `app/(site)/[toolId]/workspace/page.tsx`. Studio page rendering and tool layouts are functional.

---

## Phase 6 & 7 — Security Hardening & Error Handling Audit

### Security Hardening (100% Active)
- `lib/safeRedirect.ts`: `safeRedirectPath()` active in auth login/register pages.
- `lib/safeUrl.ts`: `isPublicHttpUrl()` active in URL-to-PDF workspace.
- `app/(site)/api/lock/route.ts`: 50MB payload limit, password separator check, and filename sanitization active.
- `components/SEO/ToolSchema.tsx`: JSON-LD script escaping active.
- `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` active.

### Error Handling (100% Active)
- `hooks/useAsyncTask.ts`: `MAX_CONSECUTIVE_FAILURES = 5` ceiling active (prevents infinite status polling loops).
- `lib/server/tools.ts`: `parseJsonField()` active (prevents malformed DB JSON from crashing tool page SSR).

---

## Phase 8 — Cross-System Interaction Matrix

- No structural incompatibility exists between the security hardening, unit testing, error handling, and shared markup branches.
- The ONLY issue is that the remote branch merges on GitHub overwrote the 3 hybrid engine files (`ClientExecutor.ts`, `CloudExecutor.ts`, `pdfcpuClient.ts`) because Devin's branches were opened before the local engine fix commits were merged to `origin/main`.

---

## Phase 10 — Final Health Matrix

| Area | Status | Severity | Evidence |
|------|--------|----------|----------|
| **Build** | CLEAN | None | `npm run build` succeeded (32 routes compiled) |
| **Typecheck** | CLEAN | None | `npx tsc --noEmit` exited 0 with 0 errors |
| **Standalone tools** | CLEAN | None | All tool routes compiled & served |
| **Hybrid execution** | CRITICAL ISSUE | High | Merged remote PRs overwrote `ClientExecutor.ts`, `CloudExecutor.ts`, `pdfcpuClient.ts` to pre-fix state |
| **Watermark WASM** | CLEAN | None | Playwright Chromium WASM test passed 100% |
| **Cloud fallback** | MINOR ISSUE | Medium | `CloudExecutor.ts` lost H2 multi-password and H3 parameter sanitization |
| **Billing** | CLEAN | None | Billing checks intact |
| **Password handling** | MINOR ISSUE | Medium | `CloudExecutor.ts` lost `password_N` array propagation |
| **Studio** | CLEAN | None | Studio builds cleanly with unified markup abstraction |
| **Markup** | CLEAN | None | Unified `useMarkupEditor` and `MarkupPdfWorkspace` functional |
| **Security** | CLEAN | None | All 5 security fixes active & functional |
| **Error handling** | CLEAN | None | Task polling ceiling & safe DB JSON parsing active |

---

## Phase 11 — Final Verdict & Explicit Answers

### Conclusion: **BLOCKED — FIX BEFORE WAVE 2**

### Explicit Answers to Key Questions
1. *Is current `main` technically healthy?* **NO**. While TypeScript and Next.js build pass cleanly, 3 core execution files were overwritten by pre-fix Devin code during remote branch merging.
2. *Did any merged Devin change introduce a real regression?* **YES**. Merging the remote branches overwrote the local B1–B3 and H1–H4 engine fixes on 3 files.
3. *Which exact commits introduced the issue?* Merge commits `2ce6937` (PR #1), `418199b` (PR #2), `a1e071b` (PR #3), and `f5cfb2c` (Merge remote-tracking branch).
4. *Are all 8 current hybrid tools functioning?* **PARTIAL**. Basic operations run, but Split/Delete leak deleted page bytes (B3) and Reorder inflates file size (H1) due to the overwritten `ClientExecutor.ts`.
5. *Is Watermark WASM functioning?* **YES** in browser context (Chromium Playwright test passed 100%), but `pdfcpuClient.ts` lost the 30s timeout guard (H4).
6. *Is Studio functioning?* **YES**. Builds cleanly and uses unified markup components.
7. *Are security-hardening changes safe?* **YES**. 100% active and working.
8. *Are error-handling changes safe?* **YES**. 100% active and working.
9. *Is there anything that should be fixed before continuing Wave 2?* **YES**. Re-apply the B1–B3 and H1–H4 engine fixes to `ClientExecutor.ts`, `CloudExecutor.ts`, and `pdfcpuClient.ts`.
10. *Can we safely continue with Add Page Numbers?* **NO — MUST RE-APPLY HYBRID ENGINE FIXES FIRST**.

---
*Audit produced via direct source code inspection and empirical test execution on current main.*
