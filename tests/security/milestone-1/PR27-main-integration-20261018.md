# PR #27 integration with current main — 2026-10-18

## Identity and preservation

- Existing PR: https://github.com/gimesha-adikari/pdfnest/pull/27 (kept draft).
- Starting branch: `codex/m1-s2-25r-p12-universal-markdown-policy`.
- Starting local and remote head: `e590710594c8ee873ca973e422a8d27f91a19289`.
- Verified remote main and normal merge parent: `3897e984f91833112f32889c9ef1483352e80f87`.
- The dedicated P12 worktree began clean. The original frontend checkout at `0f6fa13361778917afbeeef19e977f7bd8002944` retained its preexisting AGENTS.md edit; no original checkout, backend or worker files were changed.
- A normal merge preserves both parents and all original commits. No rebase or force push.

## Integration decisions

Main already contains P12 source via PR #29 and the subsequent F-01 changes. The final application source, dependency manifest/lockfile and Vercel configuration are byte-identical to the verified main tree. Only the expanded policy test and this report differ from main.

- `tests/unit/markdownUniversalPolicy.test.ts`: add/add conflict resolved using main's F-01 expectation: disabling the client feature flag in Device mode throws `UNSUPPORTED_CLIENT_OP` with zero Cloud calls. Added nine cases that exercise remote references across Auto/Device/Cloud and eligible/flag-disabled/safety-rejected routing, alongside the existing relative-reference cases.
- `vercel.json`: content conflict resolved using main's complete six exact-branch exclusions, including P12. All values remain false.
- `ExecutionManager.ts`: merged automatically to main's combined source. Resource admission remains before venue/flags/safety routing; typed policy failures remain terminal in Auto. Explicit Device remains client-only and cannot fall back for unsupported tools, disabled flags, protected inputs, safety rejection or engine failure.
- `ClientExecutor.ts` and execution types required no conflict resolution; both already match main, retaining Markdown cancellation and typed policy handling.
- The automatic dependency merge duplicated `jpeg-js`; the final package.json was restored exactly from main, retaining one pinned decoder entry and Next.js/eslint-config-next 16.4.2.
- F-01 shared uploader, isolated local unlock, prepared-file checks, Repair compatibility and content-based PDF detection are retained unchanged from main.

The original `M1-S2-25R-P12-qualification.md` remains historical evidence. Its publication prohibition, pre-G1 exclusion state, older Next.js baseline and pre-F-01 Device routing table describe that earlier qualification; this report records the current integration. No historical investigation was repeated. Graph tools were unavailable, so exact Git objects and targeted source reads were used without a graph-completeness claim.

## Fresh local qualification

Commands ran in the dedicated P12 worktree with `NEXT_PUBLIC_API_URL=http://127.0.0.1:3199` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3187`. Tests mock their conversion HTTP boundaries. The worktree's ignored old dependency links were preserved at `/tmp/platen-pr27-integration/node_modules-p12`; it now uses the existing F-01 runtime with Next.js 16.4.2, sharp 0.35.5 and jpeg-js 0.4.4. No dependency installation or shared package mutation was performed.

| Check | Result |
|---|---|
| `npm run test:unit` | PASS, 107/107 test files |
| Markdown universal policy | PASS, 69/69, zero skipped; includes real PNG/JPEG decode, PDF image objects and raster checks |
| Markdown execution | PASS, 12/12 |
| Persistent feedback / result ownership | PASS, 37/37 and 26/26 |
| API error classification | PASS, 18/18, all HTTP mocked |
| Device privacy | PASS, 32/32, zero skipped |
| Uploader decryption / input policy | PASS, 28/28 and 25/25, zero skipped and zero network attempts |
| `npx tsx tests/runHybridTests.ts` | PASS, 13 suites; 201 `[PASS]` markers |
| `npm run build -- --webpack` | PASS, Next.js 16.4.2 optimized production build |
| `npx tsc --noEmit --incremental false` after build | PASS, exit 0 |
| `npx eslint <23 scoped TS/TSX/MTS paths> --format json` | Exit 1, 55 inherited errors + 2 warnings; no new diagnostics |
| ESLint inheritance proof | Every scoped file except the clean expanded test is byte-identical to main. Main's test checked separately with `npx eslint --stdin --stdin-filename tests/unit/markdownUniversalPolicy.test.ts --format json`: zero diagnostics on both versions. Exact scoped paths and JSON are in the local evidence directory. |
| `git diff --check` and staged equivalent | PASS |

Build catalog warnings reflect unavailable loopback backend and bundled fallback data, not production behavior. Existing parser differences, bounded decoder memory/responsiveness and production limitations from the P12 report remain. This integration does not reopen or expand F-01's accepted scope.

## Browser and publication observations

Browser Use Personal Chrome against the built loopback application: PASS for relative and HTTPS image references in Auto, Device and Cloud (six cases), with persistent blocked-resource status, no preview and disabled Save. Valid embedded PNG+JPEG produced a loaded preview and enabled Save in Auto and Device (two cases). The local API fixture recorded zero POST requests. No Save/download or production processing was performed. `browser.json`, `browser.log` and the local API log are in the evidence directory. Browser scripting initially hit a malformed inspection expression, stale/absent input nodes during navigation, and missing inspection state; after focus emulation and settled-state checks, the final run passed. Those harness failures are not counted as application passes.

Before publishing: all six exclusions exactly match main, with the exact P12 branch false; GitHub reports zero deployments for the original P12 SHA. The latest repository deployment is the preexisting production deployment of main `3897e984...`, deployment ID `7151574175`. GitHub's container quality workflow is active; the broad Playwright workflow is already `disabled_manually` and was left unchanged. The PR workflow builds without pushing a container unless the event is a push to main. Post-push CI, branch identity, mergeability and deployment observations will be reported separately after publishing the immutable merge commit. No production processing, release, infrastructure changes, main merge or replacement PR is authorized or performed.

Local raw logs and lint path inventory: `/tmp/platen-pr27-integration/`.

## Exact files changed by the merge relative to the starting PR head

- `app/(site)/[toolId]/page.tsx`
- `components/pdf/PdfUploader.tsx`
- `lib/execution/ExecutionManager.ts`
- `lib/execution/pdfcpu/isolatedUnlock.ts`
- `lib/execution/pdfcpu/pdfcpuClient.ts`
- `lib/pdf/localPreparation.ts`
- `package-lock.json`
- `package.json`
- `tests/helpers/repairablePdf.ts`
- `tests/unit/cropExecution.test.ts`
- `tests/unit/deviceModeSafety.test.ts`
- `tests/unit/markdownUniversalPolicy.test.ts`
- `tests/unit/pdfToImagesExecution.test.ts`
- `tests/unit/uploaderDecryption.test.ts`
- `tests/unit/uploaderInputPolicy.test.ts`
- `tests/uploader-privacy.spec.ts`
- `vercel.json`
- `tests/security/milestone-1/PR27-main-integration-20261018.md` (this report).
