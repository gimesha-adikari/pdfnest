# M1-S2-25R-P5 — Persistent Markdown conversion feedback

## Scope and identity

This is a local frontend correction and qualification. The branch must remain
unpublished pending independent verification and a separate publication decision.

- Repository: `gimesha-adikari/pdfnest`.
- Verified GitHub `main` and correction parent:
  `2549aa88808c8357d78c8a994ab59eda1deaf925`.
- Verified baseline tree: `372144d9dcef06a18dd552607d6341da7c2727cd`.
- Branch: `codex/m1-s2-25r-p5-persistent-markdown-error`.
- Worktree:
  `/home/gimesha/My_Projects/platen-worktrees/m1-s2-25r-p5-persistent-markdown-error`.
- [Independent P4 review, checkpoint 45](https://github.com/gimesha-adikari/platen-docs/blob/707198fbb79b1e96e1c0f15d847048e96a306ece/ai-handoffs/platen-antigravity-transition-2026-10-15/45-M1-S2-25R-P4-INDEPENDENT-INVESTIGATION-REVIEW-FEEDBACK-CORRECTION-GATE.md)
  was read before implementation.

The unrelated primary checkout and its existing `AGENTS.md` modification were
preserved. The accepted ownership worktree and backend checkout were preserved.
Codebase graph tools were unavailable; bounded source reads and executed tests
provided the evidence. Existing installed dependencies were reused with a local
`node_modules` symlink; no installation or lockfile changes occurred.

## Confirmed problem and bounded correction

The accepted source correctly invalidates previous PDF output on a new input and
clears output on failure. Its only error explanation was the optional global toast,
which normally expires after seven seconds. There was no durable explanation in
the workspace. This correction addresses that confirmed local design gap; it does
not establish which event caused the original production observer to miss a toast.

Only `components/tools/MarkdownToPdfWorkspace.tsx` changes application behavior:

- The existing attempt now includes normalized failure information alongside its
  immutable input token, settled flag and output. There is no separate error state.
- The same active-generation and non-aborted-signal guard controls both errors and
  results. File object identity, mode, paper size and all four margins remain part
  of that token. Render-time reset invalidates old failure and output together.
- A successful current preview clears failure. Remove, input/configuration changes
  and unmount invalidate it. Late execution, Blob decoding and preview responses
  cannot restore errors or output from an obsolete generation.
- Recognized policy failures use static explanatory copy: **Markdown resource
  blocked** — external image URLs/local paths are unsupported; embed PNG/JPEG.
  Other terminal failures receive static retry guidance. A transport cancellation
  that occurs while the generation remains active has a neutral canceled status;
  aborted or obsolete attempts remain silent.
- The workspace contains a named conversion-status region with a stable polite,
  atomic status. Pending work, ready preview and terminal failure have distinct
  text. Failure text remains visibly rendered after toast expiry and without the
  global handler. The inline status adds no second assertive live region.
- Policy notification arguments use the same normalized safe message, preserving
  existing policy title, dispatch, error type and expiry without echoing raw server
  diagnostics. Shared notification code is unchanged; non-policy notification and
  genuine billing contracts are unchanged. All new inline copy is static.

The effect dependencies, PDF/preview ownership checks, cleanup and Save/auth
continuation checks are preserved. Error-state rendering does not submit another
conversion. Shared download metadata and the download page were not modified.

## Regression method and results

The new `tests/unit/markdownPersistentFeedback.test.mts` uses mounted React
components in JSDOM, following the existing ownership harness. It runs the actual
workspace, shared tool provider, action button, global notifications, API decoder,
CloudExecutor and ExecutionManager. HTTP is deferred at Axios; `fetch` throws if
used. Client-capability/telemetry collaborators, Next routing, authentication and
PDF preview resources are controlled. Real `AxiosError` instances contain HTTP 400
and a real JSON Blob carrying `MARKDOWN_RESOURCE_FORBIDDEN`. No network services
or production APIs are used by this fixture.

Virtual notification timers establish t=0, t=6999 and t=7000 ms behavior without
arbitrary sleeps. Synthetic result bytes identify ownership; they are not claimed
to be real PDF-rendering or structural-validation evidence.

The final fixture against an archive of baseline main yields **0/24 passed,
24 failed, 0 skipped**, because the persistent region/feedback is absent. The
corrected source yields **24/24 passed, 0 failed, 0 skipped**. Baseline reproduction
used a disposable directory without overwriting any worktree source.

Coverage includes:

- Valid A, relative-image B and remote-image C; A bytes cannot survive B's failure.
- Actual Axios JSON-Blob policy decoding through the execution chain; no billing
  advice and no raw policy paths/internal URLs/diagnostics in the rendered DOM.
- Inline persistence after toast expiry, missing handler and provider unmount.
- Pending versus failed/ready semantics; safe generic and preview-failure feedback.
- File/mode/paper/margin invalidation; one execution per replacement generation.
- Out-of-order success/error, supersession during Blob decoding, late preview
  disposal, A-to-B-to-A identity, cancellation, Remove/reupload and unmount/remount.
- Delayed authentication cannot publish the obsolete PDF after a newer failure.

## Executed qualification

Versions: Node `v24.11.1`, npm `11.6.2`, Next `16.3.4`, React `19.2.4`, Axios
`1.19.0`, JSDOM `29.1.1`, tsx `4.23.11`, TypeScript `5.9.3`, ESLint `9.39.4`.

All commands run locally with:

```sh
NEXT_PUBLIC_API_URL=http://127.0.0.1:9
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NEXT_TELEMETRY_DISABLED=1
npm_config_offline=true
```

| Command | Completed result |
| --- | --- |
| `node_modules/.bin/tsx -e "import {runEsmUnitTest} from './tests/runEsmUnitTest'; process.exitCode = runEsmUnitTest('tests/unit/markdownPersistentFeedback.test.mts') || 0"` | 24 passed, 0 failed, 0 skipped |
| Same command targeting `tests/unit/markdownResultOwnership.test.mts` | 26 passed, 0 failed |
| `node_modules/.bin/tsx tests/unit/apiErrorClassification.test.ts` | 18 passed, 0 failed; all HTTP mocked |
| `npm run test:unit` | 103/103 test files passed, including the new fixture; exit 0 |
| `node_modules/.bin/tsx tests/runHybridTests.ts` | 13 suites completed; 201 case PASS lines, no FAIL/SKIP lines; exit 0 |
| `node_modules/.bin/tsc --noEmit` | Passed; exit 0 |
| `node_modules/.bin/eslint components/tools/MarkdownToPdfWorkspace.tsx tests/unit/markdownPersistentFeedback.test.mts` | 0 errors / 0 warnings; exit 0 |
| `npm run build -- --webpack` | Passed compilation, TypeScript and production page generation; exit 0 |
| `git diff --check` | Passed |

The baseline component also passes scoped ESLint. Repository-wide ESLint and
Playwright/browser/production tests were not executed in P5. No repository-wide
lint pass or new deployed/browser acceptance is claimed. The supported Webpack
build was used directly; the default Turbopack build was not run. Build-time catalog
requests target the intentionally unavailable loopback API and use the existing
fallback. The DOM harness emits existing styled-JSX attribute warnings because it
does not run Next's transform; the actual Webpack build succeeds.
Unit-suite logs also contain PDF.js `standardFontDataUrl` warnings; the complete
unit runner exits successfully. These warnings were retained in the raw evidence.

## Preservation and remaining limits

- The prior ownership/API suites are unchanged. Byte comparisons confirm unchanged
  shared tool provider, download page, execution manager/executor, API error and
  notification code, dependencies and root `vercel.json`. The workspace Save/auth
  handler is byte-for-byte unchanged from the baseline.
- Backend source, billing architecture, authentication, storage, OCR and
  infrastructure are outside this patch. No backend or notification infrastructure
  changes were made.
- Existing `vercel.json` excludes only the earlier review branch. **The P5 branch
  is not covered and must remain unpublished.** No safeguard configuration changed.
- A genuinely unresolved request stays visibly pending; this patch adds no timeout,
  retry button, notification queue or new conversion submission mechanism.
- Polite live-region semantics are verified in mounted DOM tests; physical
  screen-reader behavior and real-browser visual rendering remain untested.
- The original production missing-toast cause remains unverified. Backend offline
  policy, Chromium isolation, parser/resource budgets and production capacity are
  not newly qualified by these frontend tests.
- Independent verification is required before any separately authorized publication.
  No push, PR, merge, deployment, production conversion request, settings change,
  secret/customer-data access or infrastructure modification occurred.

Complete raw logs, commands, source copies, Git identities, binary-safe patch and
SHA-256 manifest are retained in the external portable review evidence bundle.
