# M1-S2-25R — Markdown PDF result ownership qualification

## Scope and source identity

This is a frontend correction and local qualification. No production conversion requests, merges, deployments, infrastructure changes, backend source changes, or customer-data access were performed.

- Frontend GitHub `main` and correction parent: `0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b`.
- Branch: `codex/m1-s2-25r-markdown-result-ownership`.
- Backend GitHub `master`: `eb90ab778b06c0bdcfe9ca0d506402f8c0e18742`.
- Backend local test source: accepted F-04 head `7ba26aa39d16b203b376056d40816f48b77306fd`; its complete tree and the merged backend tree both equal `6a5e172c67cc94bc47330b4e9762c6d170b3003b`.
- Existing frontend checkout and its unrelated `AGENTS.md` modification were preserved. The correction uses a separate worktree.
- The codebase graph tools were unavailable. Evidence uses bounded source reads, caller searches and executed local tests.

Incident checkpoint: [permanent M25 report at cdc81001](https://github.com/gimesha-adikari/platen-docs/blob/cdc810014f65baf34c9a3145769bbcbabc8bdf7d/ai-handoffs/platen-antigravity-transition-2026-10-15/36-M1-S2-25-PRODUCTION-SMOKE-FAIL-FRONTEND-STALE-ARTIFACT-INVESTIGATION.md).

## Confirmed reproduction and limits

The test harness mounts the actual Markdown workspace, shared tool provider, download page and notification component in React DOM/JSDOM. Execution responses, PDF preview resources, authentication continuation and Next navigation are controlled. Deferred execution promises intentionally ignore abort, proving that correctness does not depend on cancellation stopping the transport. The harness transpiles actual checked-in TSX, rather than simulating a separate state machine. Synthetic output bytes identify provenance; these mocked bytes are not presented as real PDF-rendering evidence. Tiny valid PNG/JPEG input data URIs are forwarded unchanged to the mocked executor.

Against an archive of starting `main`, a valid A completion followed by a rejected B produces:

```json
{"selectedFile":"B.md","saveEnabled":true,"previewVisible":true,"offeredFileName":"A.pdf","offeredBytes":"PDF:A","successNavigation":["/markdown-to-pdf/download"],"errorCount":1}
```

Against the corrected components:

```json
{"selectedFile":"B.md","saveEnabled":false,"previewVisible":false,"successNavigation":[],"errorCount":1}
```

The final component regression suite yields **3 pass / 23 fail** on starting components and **26 pass / 0 fail** after correction. The separate API classification regression first failed because `MARKDOWN_RESOURCE_FORBIDDEN` was stored as `billing`, and now passes.

| Controlled sequence | Starting behavior reproduced | Corrected behavior |
| --- | --- | --- |
| A succeeds; B with `../image.png` fails | A remains previewable/saveable; Save publishes A and navigates despite the B error | No preview, Save, shared result or success navigation for B |
| A pending; select B; A finishes after B starts/fails | A can overwrite B's failed state | Obsolete result ignored; previous signal aborted |
| Old A fails after successful B | Obsolete error is displayed | B remains the only ready result; obsolete error suppressed |
| Paper or margin changes during execution | Old output can remain saveable or arrive late | Configuration identity changes; old response cannot publish |
| Execution mode changes | Old result remains available during new attempt | Current generation required; pending/failed mode cannot save |
| Previous download exists when new input begins | Shared success/download remains available | Provider clears shared data at Markdown input boundary; page refuses old provenance |
| Delayed authentication after file/options change | Old callback publishes/navigates | Callback rechecks committed generation and cancellation before publication |
| Preview fails or resolves after invalidation | Blob may remain ready despite preview failure; old preview can return | Failure has no output; late resource is released |

These establish a concrete mechanism consistent with M25-05. They do not reconstruct the original production request ordering, identify the suspect production Blob, or prove that the backend accepted a forbidden filesystem image. The suspect production artifact remains unexamined.

## Implementation and ownership contract

- `components/tools/MarkdownToPdfWorkspace.tsx`: one attempt state binds result Blob, filename and preview to an immutable token containing the File object, mode, paper size and all four margins. An input change resets local output during render; committed boundaries clear shared downloads before paint. Both execution and preview receive an AbortSignal. Every async continuation checks token ownership and cancellation. A unique PDF.js preview identity avoids collisions in its filename/size/time cache. Preview resources are released on supersession/unmount or late arrival. Save uses only a settled current result and revalidates ownership after authentication. Saving does not submit a second conversion.
- `app/(site)/[toolId]/ClientToolLayout.tsx`: Markdown file selection clears the shared result and generation. Download metadata can carry source File and conversion token. Existing non-Markdown download contracts remain accepted.
- `app/(site)/[toolId]/download/page.tsx`: Markdown success, download and onward-transfer UI require nonempty provenance matching the provider's current File object and generation. Missing, mismatched and obsolete metadata fail closed.
- `lib/api.ts`: Axios upload, `fetchJson` and `fetchBlob` preserve general structured errors as `backend`. Only the eight existing billing/quota/purchase error codes also populate `billing`. Missing error codes default to `REQUEST_FAILED`, not `BILLING_ERROR`.
- `lib/errorHandler.ts` and `lib/notify.ts`: structured Markdown policy failures show **Markdown resource blocked**, retain the backend policy explanation and receive no billing description, upgrade action or account guidance. The existing notification UI labels described errors as Billing, so this resource-policy notification intentionally supplies no description. Genuine billing notification behavior is preserved and tested.

Blob and filename are published atomically from the same execution result. File object identity distinguishes different uploads even with identical names, sizes and timestamps. Reverting options/files cannot revive an earlier token. Download provenance stays in the existing client tool context; no storage, billing, authentication or execution-manager architecture was changed.

## Backend boundary verification

The unchanged backend's `prepareMarkdownDocument` inspects parsed Goldmark image nodes. `validateMarkdownImage` accepts only validated embedded PNG/JPEG data URIs; `../image.png` takes the policy-error branch. `ConvertMarkdownToPDF` maps `ErrMarkdownPolicy` to HTTP 400 / `MARKDOWN_RESOURCE_FORBIDDEN`, before PDF delivery. The asynchronous controller calls the same renderer and returns through its failure branch before publication.

Executed existing tests using local miniredis and synthetic fixtures only:

```sh
GOPROXY=off GOSUMDB=off go test ./internal/conversion \
  -run 'TestMarkdownImagePolicyResolvesAllReferenceForms|TestMarkdownRoutesPolicyFailureNeverPublishesOrCharges' \
  -count=1 -json
```

Result: **77 passed test events** (two top-level tests and 75 subtests), **0 fail / 0 skip**. Policy cases include relative and parent-relative paths. Existing route cases verify synchronous policy error/no PDF and asynchronous failure/no artifact/no guest usage charge. The existing route fixture uses a forbidden synthetic URL; the specific relative-path HTTP mapping is established by the relative-path policy test plus controller source, not a newly added route test. No backend bypass was found within this bounded verification.

## Frontend qualification

Versions: Node `v24.11.1`, npm `11.6.2`, Next `16.3.4`, React `19.2.4`. Existing installed dependencies were reused; no dependency or lockfile change.

For local suites/builds, `NEXT_PUBLIC_API_URL=http://127.0.0.1:9`, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` and `NEXT_TELEMETRY_DISABLED=1` prevent production API use. The build uses the bundled catalog fallback when that intentionally unavailable API cannot be fetched. Adapter tests replace Axios/fetch; they make no HTTP calls.

| Command | Actual result |
| --- | --- |
| `npm run test:unit` on starting source | 100/100 files passed |
| `node_modules/.bin/tsx -e "import {runEsmUnitTest} from './tests/runEsmUnitTest'; process.exitCode = runEsmUnitTest('tests/unit/markdownResultOwnership.test.mts') || 0"` | 26 passed, 0 failed |
| `node_modules/.bin/tsx tests/unit/apiErrorClassification.test.ts` | 18 passed, 0 failed; mocked upload/JSON/Blob errors and actual CloudExecutor wrapping |
| `npm run test:unit` on corrected source | 102/102 files passed |
| `node_modules/.bin/tsx tests/runHybridTests.ts` | 13 suites completed successfully; 201 per-case PASS lines; no failed/skipped cases reported |
| `node_modules/.bin/tsc --noEmit` | Passed |
| `node_modules/.bin/eslint components/tools/MarkdownToPdfWorkspace.tsx tests/unit/markdownResultOwnership.test.mts tests/unit/apiErrorClassification.test.ts` | 0 errors / 0 warnings |
| `node_modules/.bin/eslint . --format json` | Repository gate remains failing: 696 errors / 712 warnings, versus 698 errors / 715 warnings on archived starting source. No added lint diagnostics; retained shared-file findings predate this patch. |
| `npm run build` | Environment-limited: Turbopack rejects the reused node_modules symlink outside its filesystem root |
| `npm run build -- --webpack` | Passed compilation, TypeScript and static page generation using the supported local Webpack option; no configuration change |
| `git diff --check` | Passed |

The DOM harness emits benign warnings for Next's `style jsx global` attributes because it does not run Next's styled-JSX transform. It still runs the actual component event/effect logic and real policy toast rendering. This is local component integration evidence, not a real-browser or production retest.

## Remaining boundaries

- Exact M25-05 production HTTP response, ordering and artifact identity remain unknown.
- Abort is best effort at the server boundary; superseded work may already have reached the backend. Generation checks prevent frontend publication even when cancellation is ignored. Billing/lifecycle semantics were not changed.
- This patch trusts the existing backend PDF validation and offline renderer. It does not add a browser PDF structural validator or claim additional network/OS isolation.
- Independent source/security review is mandatory before merge, deployment, or a separately authorized production smoke-test repetition.
- No merge, deployment, rollback, production API submission, infrastructure/configuration change, or backend source change is part of this task.
