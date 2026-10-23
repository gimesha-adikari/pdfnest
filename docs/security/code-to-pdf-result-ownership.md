# Code-to-PDF frontend result ownership

Baseline: `cbb6426da8f8d5b884f75274ec71b8557d1ffd7c` (`main`).

Code previously published conversion bytes before preview completion, retained old
output across input changes, and allowed unowned results into the shared download
page. Errors only reached a transient toast. This correction follows the existing
Markdown ownership approach, without changing its workspace or execution engines.

A generation includes the actual File object, processing mode, paper size and all
four margins. Input changes immediately remove preview/Save eligibility, clear
staged downloads, and abort superseded conversion and preview work. Both stages
must finish for the current generation before Save is available. Obsolete preview
resources are revoked. Delayed authentication rechecks ownership. An authenticated
Save explicitly transfers its generation to the download page; other unmounts
invalidate it. Code joins Markdown's existing file/generation download guard;
unrelated tools retain their existing download contract.

Only HTTP 413 paired with `CODE_SOURCE_TOO_LARGE` selects fixed, actionable 16 MiB
raw-source copy. Other rendering failures use generic safe copy in both the
persistent accessible status and optional toast. Existing billing notification
handling and Device/Cloud/Auto execution policies remain unchanged. A source
within the raw limit can still exceed the backend's independent HTML budget or
encounter a rendering limit; the UI does not guarantee every 16 MiB file renders.

## Verified regressions

All checks below ran sequentially with a 1 GiB Node heap cap, a 1.5 GiB cgroup
limit including native children, no swap allowance for that group, and timeouts.
No dependency installation or development server was needed.

| Check | Result |
| --- | --- |
| Code component ownership and persistent feedback | 44/44 PASS |
| Existing Code execution/PDF tests | 14/14 PASS |
| Markdown ownership | 26/26 PASS |
| Markdown persistent feedback | 37/37 PASS |
| Markdown universal policy | 69/69 PASS |
| Strict Device privacy | 32/32 PASS |
| Controlled Chromium fixture | 4/4 PASS |
| TypeScript (`tsc --noEmit --incremental false`) | PASS |
| Formatting (`git diff --check`) | PASS |
| New/changed-file lint comparison | No new diagnostics |

The Chromium check uses one browser/context/page and loopback fixtures. It checks
real local Code PDF generation, preview, owned download, page count and extracted
text; persistent Cloud 413 after toast expiry; successful retry; and Device/Auto
without uploads. Framework/auth/catalog context and the Cloud endpoint are test
fixtures. Race and delayed-auth cases use deferred mounted-component tests.

The physical Linux fixture filename is `source.x"><img src=x onerror=alert(1)>`.
It has no path separator and is displayed as React text. Chromium sends the quote
as `%22` in the multipart Content-Disposition header; the loopback multipart parser
returns the original filename. No unexpected browser requests or script dialogs
occurred. No production conversion or backend injection audit was performed.

## Reproduction

With dependencies and the matching Playwright Chromium installed:

```sh
# Keep these commands sequential and resource-bounded on a small machine.
NODE_OPTIONS=--max-old-space-size=1024 npx tsx -e 'import {runEsmUnitTest} from "./tests/runEsmUnitTest"; process.exitCode=runEsmUnitTest("tests/unit/codeResultOwnership.test.mts") ?? 1'
NODE_OPTIONS=--max-old-space-size=1024 npx tsx tests/runCodeWorkspaceBrowser.mts
```

The browser runner requires `pdftotext`, starts its local fixture only for the
check, and closes Chromium and the fixture in `finally`. It is intentionally
outside Playwright's automatic test-file matching. Its local API never proxies to
production, and unexpected browser origins are blocked and fail the test.

## Outstanding qualification

Repository-wide lint reports 678 errors and 705 warnings. Comparing every changed
existing file to the baseline confirms no new diagnostics; the Code workspace
removes its previous two errors and four warnings. The shared layout retains its
13 baseline errors and four warnings. All newly added test files lint cleanly.

The local production build stops because Turbopack refuses a dependency symlink
outside its project root. The reused dependency versions match the lockfile for
Next, React, Axios, TypeScript, tsx, esbuild, jsdom, PDF.js, pdf-lib and jpeg-js.
A fresh installation/build and the full unit suite are deferred to GitHub CI.
No application configuration was changed to work around local resource limits.

The existing seven Vercel branch exclusions remain intact, with an additional
exact exclusion for `codex/code-pdf-result-ownership`. This is a draft for focused
independent review, not deployment or production acceptance.
