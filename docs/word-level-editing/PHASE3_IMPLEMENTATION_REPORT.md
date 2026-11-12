# Platen PDF Phase 3 Implementation Report

> Sanitized archive copy. The source filename and source-derived fingerprints, runtime job IDs, local machine paths, and local object key are redacted; implementation scope, commands, outcomes, compatibility evidence, and limitations are retained.

Date: 2026-11-10
Status: **PASS — qualified local Phase 3 scanned-word workflow**

The Phase 3 acceptance path passed locally on the approved 13-page scanned PDF: browser word selection → versioned request → trusted-baseline validation → isolated worker compilation → stored candidate → actual compiled-page preview → repeatable download of the same bytes. The selected page 1 word changed from `Ministry` to one searchable `hello`; neighboring text, the other 12 pages and all page geometries were preserved. This is a local qualification for the documented supported scope, not a deployment or remote-storage qualification. The worker regression suite retains one independently reproduced Phase 2 baseline configuration failure and 10 fixture-limited skips; those are disclosed below.

## Resume audit

Work resumed from the existing dirty checkouts on `pdfnest/main`, `pdfnest-backend/master`, and `pdfnest-worker/main`. Phase 2 files and unrelated local changes were preserved.

The worker actor-side baseline resolver was already complete in the resumed state. `editor_word_edit_compile_job` revalidates the submitted request against the completed General Editor extraction, verifies the downloaded source SHA-256, then calls `resolve_word_edit_targets`. That resolver maps exact page/element/word IDs to geometry from the frozen extraction result. It does not trust client coordinates. `test_resolves_repeated_word_identity_to_frozen_server_geometry` and the actor forwarding tests cover this path.

The interrupted frontend import-mock patch was incomplete: `queuedPdfPublication.test.mts` rejected the new `wordEdits` module import. The test now mocks the pure helpers and preview identity function. A mounted parity test was added for the candidate path. That earlier import-mock repair did not change production code; the later Go transport correction found by the live browser run is recorded below.

## Implementation and transport

### Frontend

- `SharedEditor` keeps whole-line layout compilation on the existing `onCompile` callback. Word-operation mode uses the final serializer and the dedicated callback; mixed word and line edits fail before submission.
- `EditPdfWorkspace` submits the `platen_word_edits.v1` snapshot, verifies worker baseline/source/operation metadata, downloads the candidate once, checks the PDF header, page count and SHA-256, and checks the restored output bytes again.
- The existing server preview hook renders the prepared candidate `File`. Download publishes the same verified `Blob`. A changed editor revision invalidates that candidate; an unchanged snapshot can reuse it.
- Password-protected or protected-derived inputs are refused before compilation because the preview service cannot render the restored candidate with its password.

### Go backend

The live request exposed a Phase 2 wire mismatch: the Go word-edit transport added `source_name`, but the worker's strict `WordEditCompileRequest` forbids extra fields and derives that filename from its trusted extraction job. The backend transport now omits `source_name` from the dedicated versioned request; the worker job still derives its stored download name from the frozen extraction metadata. The standalone General Editor route remains the path used by the frontend. Studio's strict typed layout path was not extended with word operations.

### Python worker

- The extraction baseline binds the immutable source SHA-256, completed extraction job, OCR engine fingerprint, algorithm version and frozen page/element/word projection.
- Before compilation, the actor validates the baseline digest and source ownership through the existing job path, verifies the actual downloaded source bytes, resolves IDs from the server-held extraction, and sends the exact accepted operation envelope and resolved geometry through the existing isolated native-operation boundary.
- The compiler accepts only qualified image-backed, unrotated and uncropped scan geometry. It rejects uncertain backgrounds, insufficient fit, collisions, stamps/rules, conflicting visible text and ambiguous/misaligned hidden OCR. It preflights every operation before patching, preserves original image streams and fails closed without uploading a refused candidate.
- Output becomes a successful job artifact only after candidate checks and upload. A refusal produces a failed job with an explicit error code and no artifact key.

## Actual 13-page source evidence

The approved source PDF and source-derived outputs were not added to Git. Browser uploads and the worker artifact were kept in the root dev runner's Git-ignored local object store at `[Git-ignored local storage path]`; downloaded candidates, renders and screenshots are in the private `/private/test-artifacts/` directory. The original source SHA-256 remained `[redacted private source fingerprint]` before and after the workflow.

An earlier isolated compiler run selected page 1 `Ministry` with OCR identity (`p1-ocr-v2-line-1` / `page-0-token-0`) and produced a separate private candidate with SHA-256 `[redacted private candidate fingerprint]`. The browser-integrated candidate is separately identified below and is the one used for the end-to-end verification and final pixel comparison.

- `qpdf --check` accepted source and candidate.
- The candidate retained 13 pages and original page geometry; the original scan image streams remained present.
- Search on the edited page returned one `hello` and no stale `Ministry` at the selected target. `of Education, Higher` remained at its original position.
- The first isolated compiler visual inspection showed a localized page-one replacement and intact neighboring content. Its earlier exploratory pixel figures are superseded by the complete independent Poppler and MuPDF comparison of the downloaded browser candidate recorded below.
- The page 1 preview was visually inspected; the replacement was legible and neighboring text remained aligned.

These are local worker/compiler results, not proof of the live job/storage/API path. The one-off actual-source invocation was not captured as a reusable checked-in script.

## Automated tests

| Repository | Command | Result |
|---|---|---|
| Frontend | `npx tsc --noEmit --pretty false` | Pass |
| Frontend | `npx tsx tests/unit/editorWordEditsProtocol.test.ts` | Pass |
| Frontend | `npx tsx tests/unit/editorWordEditExport.test.ts` | Pass |
| Frontend | `npx tsx tests/unit/queuedPdfPublication.test.mts` | Pass after the import-mock repair |
| Frontend | `npx tsx tests/unit/wordEditCandidateParity.test.mts` | Pass; compiled bytes drive preview and download, unchanged retry reuses candidate |
| Frontend | `npx tsx tests/runUnitTests.ts` | **142/142 files passed** |
| Frontend | `npm run test:unit` | **Fail:** 8/9 preflight tests passed; the missing-origin test sees `NEXT_PUBLIC_API_URL` loaded from repository `.env.local`. The preflight test/script are unchanged. Running the preflight from `/tmp` with an empty environment returned the expected missing-origin error. The package script stops before the unit runner; the unit runner was run separately and passed. |
| Backend | `go test -count=1 ./internal/edit` | Pass |
| Backend | `go test ./...` | **Fail:** Studio tests requiring PostgreSQL could not connect to `127.0.0.1:5432` (`connection refused`). The changed `internal/edit` package passed. |
| Worker | `F11_INSTALLED_ENV_ROOT=.venv PYTHONPATH=. .venv/bin/pytest -q tests/test_scanned_word_compiler.py tests/test_word_edits_protocol.py` | **32 passed** |
| Worker | `F11_INSTALLED_ENV_ROOT=.venv PYTHONPATH=. .venv/bin/pytest -q tests/controller/test_operation_profiles.py -k compile_scanned_word_edits` | **2 passed, 58 deselected** |
| Worker | `F11_INSTALLED_ENV_ROOT=.venv PYTHONPATH=. .venv/bin/pytest -q tests/test_raster_sdk_boundary.py` | **196 passed** |
| Worker | `F11_INSTALLED_ENV_ROOT=.venv PYTHONPATH=. .venv/bin/pytest -q` | **1,494 passed, 16 failed, 10 skipped, 23 errors** in 198.21s |

The worker full-suite setup errors are in `tests/test_markdown_admission.py`: its isolated Redis fixture requires the `redis-server` executable, which is absent (`shutil.which` returned `None`). A Redis service answered `PONG`, but that does not satisfy the fixture. The 16 failures are in the existing renderer suites: persistent-pool production integration (6), production smoke (2), HTTP render capacity (2), render resource safety (5), and render session storage budget (1). The run included a managed-render guard failure (`persistent render pool lacks the required disposable-child resource limits`). These test/render files were not edited by Phase 3; this turn did not replay them on a clean baseline, so their attribution remains unresolved.

## Compatibility and limits

- The frontend 142-file unit run includes existing Studio suites; the Studio layout callback remains `onCompile`.
- The full Go backend suite, including Studio and `internal/edit`, passes with the isolated local PostgreSQL service. Live legacy and Studio UI requests were not repeated; their regression suites ran.
- The actual local browser → Go API → worker → local object storage → candidate preview → download path ran. Remote R2/object storage and deployment infrastructure were not used.
- Live oversized replacement was refused with `REPLACEMENT_DOES_NOT_FIT` and no artifact key. Ambiguous/duplicate identity, unsupported geometry, stamps/rules, hidden OCR conflicts and unsupported scripts remain covered by worker tests and fail closed; those broader cases were not individually driven through the browser UI.
- Unsupported native glyph editing, complex mixed PDFs, unsupported rotations/crops, stamps/rule intersections, ambiguous OCR and unsupported scripts remain outside the qualified editing scope.
- No Phase 4/5 work, deployment, commit, push, branch creation or branch switch was performed.

## Local repository state

| Repository | Branch at resume | HEAD at resume |
|---|---|---|
| `pdfnest` | `main` | `f198a04fe5ca47f620378f12167aad1d9922ea80` |
| `pdfnest-backend` | `master` | `fad98d0eb76bdef70ef9d4d62d5c290c66db955e` |
| `pdfnest-worker` | `main` | `76bfb29ed09a9ae46c87e71011cafa0409ee1822` |

All Phase 2/3 modifications remain local and uncommitted. The original PDF was not modified. Test PDFs and object-store files are Git-ignored; downloaded candidates, renders and screenshots are in the private `/tmp` directory. No private file was staged or committed. The live Phase 3 gate is complete for the qualified local scan workflow; remote storage, deployment and broader unsupported cases remain unqualified.

## Verification continuation — 2026-11-10

This section supersedes the earlier environment-limited full-suite rows above where a corrected invocation is now recorded. It records the browser integration completed after the earlier report was written.

### Local service configuration and health

- Started the existing root `run_dev.sh` topology with its Compose PostgreSQL service, Redis, frontend, Go API and worker. The active services returned frontend `200`, `/api/ready` `200`, `/health/ready` `200`, Redis `PONG`, and PostgreSQL accepted connections.
- The first stack restart failed because the default render-session root was nonempty and unversioned (`nonempty unversioned render session root is unsupported`). After checking the session-root guard, the stack was started with `PDFNEST_RENDER_SESSION_DIR=/tmp/private-render-session-dir`; this isolated path was accepted. Compose PostgreSQL ran on `127.0.0.1:5432`, Redis on `127.0.0.1:6381`, and `STORAGE_MODE=local`. The runner's actual `LOCAL_STORAGE_DIR` was the Git-ignored `[Git-ignored local storage path]` directory (mode `0775`); the system PostgreSQL cluster and unrelated Redis container on port `6379` were not used.
- `docker compose --project-name platenpdfdev-local --file dev-compose.yml ps` showed the managed PostgreSQL and Redis containers healthy. `./run_dev.sh status` incorrectly reported PostgreSQL stopped because it checks the stopped legacy `pdfnest-test-pg` container before the active Compose service; direct Compose status, `docker inspect`, and `pg_isready` confirmed the active isolated service. The legacy container remains stopped.
- The approved source PDF's SHA-256 matched the worker's baseline source digest and the pre-run checksum after verification. The source file was not edited. The local object store contained the uploaded source, the compiled worker artifact and a layout JSON; its `tmp/` path is Git-ignored. Downloaded candidates, Poppler/MuPDF renders and browser screenshots were kept under `/private/test-artifacts/`.

### Frontend preflight and regression suite

The preflight failure was reproduced without reading or changing `.env.local`: with an empty `NEXT_PUBLIC_API_URL`, the preflight correctly reported the missing value. The test helper omitted the variable entirely, allowing Next's dotenv loader to refill it from `.env.local`. The test helper now passes an explicit empty string for the intentional missing-origin case, keeping that case hermetic. The `.env.local` SHA-256 and mtime were unchanged.

| Command | Result |
|---|---|
| `env -i PATH="$PATH" NODE_ENV=production NEXT_PUBLIC_API_URL= node scripts/preflight-local-api-origin.mjs --dev` | Expected missing-origin error; `.env.local` did not override the explicit empty value. |
| `node --test scripts/preflight-local-api-origin.test.mjs` | 9 passed. |
| `npm run test:unit` | 9 preflight tests and 142/142 unit files passed. |

### Go backend regression suite

The first attempt supplied a TCP `DATABASE_URL`, which violated existing tests that require either no ambient URL or a test-owned private socket DSN; it also tripped test-only database-name guards. That result was a fixture mismatch, not a product regression. The corrected full run left `DATABASE_URL` and disposable-DSN variables unset, used the isolated local PostgreSQL service expected by the existing Studio tests, and selected the worker venv for Studio's PyMuPDF fixture:

```bash
env -u DATABASE_URL -u GIM6_TEST_DATABASE_URL -u BACKEND_DURABILITY_TEST_DSN \
  PATH=".venv/bin:$PATH" \
  STUDIO_TEST_PYTHON=.venv/bin/python \
  go test -p 1 -count=1 ./...
```

**Result: exit 0.** This includes `internal/edit`, Studio and Studio models. Tests explicitly gated on a private `BACKEND_DURABILITY_TEST_DSN`, `GIM6_TEST_DATABASE_URL`, or `ADMIN001_TEST_DATABASE_URL` were not supplied those separate test fixtures and are not claimed as executed database integration coverage.

### Worker regression failures and baseline comparison

The previous Phase 3 run recorded 16 renderer failures and 23 Markdown-admission setup errors. On the resumed run, tests used a unique `PDFNEST_RENDER_SESSION_DIR` so the test manager did not contend with the live worker's protected render-session root. Redis-admission tests used a temporary `/tmp` `redis-server` shim that starts the already installed `redis:7-alpine` image with resource limits and a loopback-only published port; no host Redis package or user Redis service was installed, stopped, or flushed. `REDIS_URL` for worker tests was directed to the managed local Redis DB 15, separate from the app's DB 0. The required `F11_INSTALLED_ENV_ROOT` marker was set.

Current full worker command:

```bash
renderer_test_root="$(mktemp -d /tmp/worker-render-root.XXXXXX)"
PATH="/tmp/private-test-bin:$PATH" \
REDIS_URL=redis://127.0.0.1:6381/15 \
F11_INSTALLED_ENV_ROOT=.venv \
PDFNEST_RENDER_SESSION_DIR="$renderer_test_root" PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 \
.venv/bin/pytest -q -p no:cacheprovider --tb=short \
  --junitxml=/tmp/worker-full-results.xml
```

**Result: 1,532 passed, 1 failed, 10 skipped, 0 errors (1,543 total).** The 23 `tests/test_markdown_admission.py` cases passed. The 11 scanned-word compiler cases and 21 word-edit protocol cases passed. The 10 Studio real-page forensics skips remain fixture-limited because the decrypted base PDF is not present.

The only failure is `tests/test_render_session_storage_budget.py::test_production_requires_explicit_single_replica_declaration`, which rejects the configured persistent render pool because its required disposable-child resource limits are not present. It is unrelated to the word-edit files. A focused run of the same five renderer files on the current tree produced **121 passed, 1 failed**. A non-Git archive of the published Phase 2 commit `a3952f0e1e1bff8aae17a05c8f1172b039399d23`, with the same ignored worker `.env` linked by path, the same venv, marker and isolated render root, produced the identical **121 passed, 1 failed** and the same failure. Without the ignored `.env`, the Phase 2 archive passed all 122 focused tests; `app/core/config.py` loads `.env`, and the failing test's second validation intentionally rejects the managed persistent-pool setting. This is a baseline configuration failure, not a Phase 3 regression.

The previous 15 failures did not reproduce in the full controlled run. Earlier raw per-test failure output was not retained, so the exact identities of those 15 historical failures cannot be reconstructed from that run; the prior report grouped them across the same five renderer files. In the resumed run, all other cases in those files passed when the test render-session root was separated from the live worker. The 23 Redis errors were corrected by providing the fixture executable through the temporary Docker-backed shim; those tests ran and passed rather than being skipped.

### Phase 2 worker-guard preservation check — 2026-11-12

While comparing the Phase 3 worker test snapshot against its published Phase 2 parent, two Phase 2 safeguards were found missing from the local replacement test file. They are retained in the Phase 3 tree: failed compile jobs cannot stream a downloadable artifact, and Studio extraction does not receive the General Editor word-edit baseline. The focused compiler/protocol run after restoring these checks was:

```bash
F11_INSTALLED_ENV_ROOT=.venv PYTHONPATH=. PYTHONDONTWRITEBYTECODE=1 \
  .venv/bin/pytest -q -p no:cacheprovider \
  tests/test_word_edits_protocol.py tests/test_scanned_word_compiler.py
```

**Result: 34 passed in 18.16s.** The full worker suite was not rerun after restoring these two tests; its 1,532/1/10 result above is the recorded 2026-11-10 full run, and its single failure remains baseline-equivalent as established by the Phase 2 archive comparison.

### Browser → frontend → Go API → worker → storage → preview → download

The approved 13-page PDF was uploaded through the local `/edit-pdf` browser workflow. The extraction job was `[private extraction job ID]`. The page displayed the OCR word buttons; selecting `Edit word Ministry` selected the exact inline word field, and entering `hello` displayed `Word: Ministry → hello` while leaving `Edit entire line` separate.

The first browser Prepare export request failed closed. The worker returned HTTP 422 because Go included the extra `source_name` field in a strict `platen_word_edits.v1` request (`extra_forbidden`, `body.source_name`). The frontend showed `WORD_EDIT_WORKER_SUBMISSION_FAILED`; no artifact or download was produced. The narrow Go transport correction removed `source_name` from the worker DTO and its service signature. The worker continues deriving the display filename from the trusted extraction record. Backend files changed in this continuation: `internal/edit/controller.go`, `internal/edit/python.go`, `internal/edit/service.go`, `internal/edit/word_edits_test.go`, and `internal/edit/word_edits_worker_transport_test.go`.

After that correction, the same word operation completed as worker job `[private successful compile job ID]`. The browser-authenticated job status returned HTTP 200 and `succeeded`; the worker result reported one validated operation, `platen_word_edits.v1`, 13 pages, replacement searchable, zero old-target hits, and zero worker-reported changed pixels outside the target at 72/144/288 DPI. The exact operation accepted by the worker was:

```text
page_num=1
element_id=p1-ocr-v2-line-1
word_id=page-0-token-0
expected_original_text=Ministry
replacement_text=hello
```

The worker receipt bound that operation to extraction job `[private extraction job ID]`, baseline digest `sha256:[redacted private baseline fingerprint]`, and source SHA-256 `[redacted private source fingerprint]`. The artifact SHA-256 was `[redacted private candidate fingerprint]` (4,428,059 bytes). The worker object was written under `[private local object key omitted]` in the runner's Git-ignored local object store.

The browser displayed **Verified export preview**, `Page 1 of 13`, and the statement that download uses the same verified bytes. The preview component renders `preparedCandidate.file`; the download action publishes `preparedCandidate.blob`. The downloaded PDF SHA matched the worker artifact SHA. Downloading the same prepared candidate a second time produced the same SHA; the browser performance log still showed exactly one `/api/edit/compile` request before and after the repeat download. The frontend parity test additionally verifies the preview File and download Blob contain the same bytes and that an unchanged snapshot reuses the verified candidate without another download or charge. A second Prepare click was not issued after leaving the editor preview.

One live fail-closed check used the same extraction baseline and word identity with a 256-character replacement. The browser-session request was accepted for asynchronous validation, then worker job `[private refused compile job ID]` finished `failed` with `REPLACEMENT_DOES_NOT_FIT`, message “The selected-word edit could not be applied safely to this PDF. No downloadable PDF was produced.” The result had no artifact key. Wrong/duplicate/ambiguous identity and other unsupported background/geometry cases remain covered by the worker protocol/compiler suites; they were not each submitted through the browser UI.

### Downloaded PDF checks

- `qpdf --check` accepted both the original source and downloaded candidate. `pdfinfo` reported 13 pages at `595 x 842 pts (A4)`. MuPDF found no media box, crop box, rotation or page rectangle differences on any page.
- `pdftotext -layout` found one `hello` and zero `Ministry` occurrences in the candidate. The original scan has no searchable text for the neighboring header words; those neighbors are preserved visually in the page image.
- Poppler and MuPDF renders were compared at all three DPI values. Each of pages 2–13 had zero changed pixels. On page 1 all changed pixels were contained within the frozen OCR word box plus a physical 1-point antialias band, rounded to 1, 2 and 4 pixels at 72, 144 and 288 DPI; no changed pixels remained outside that region.

Commands used for the downloaded candidate:

```bash
qpdf --check '/private/test-artifacts/downloaded-candidate.pdf'
pdfinfo '/private/test-artifacts/downloaded-candidate.pdf' | rg '^(Pages|Page size):'
pdftotext -layout '/private/test-artifacts/downloaded-candidate.pdf' - | python3 -c 'import sys; t=sys.stdin.read(); print("hello_count",t.lower().count("hello")); print("ministry_count",t.lower().count("ministry"))'
pdftoppm -f 1 -l 13 -r 72 -png '/private/test-artifacts/source-or-candidate.pdf' '/private/test-artifacts/poppler/72/source-or-candidate/page'
pdftoppm -f 1 -l 13 -r 144 -png '/private/test-artifacts/source-or-candidate.pdf' '/private/test-artifacts/poppler/144/source-or-candidate/page'
pdftoppm -f 1 -l 13 -r 288 -png '/private/test-artifacts/source-or-candidate.pdf' '/private/test-artifacts/poppler/288/source-or-candidate/page'
```

The Poppler commands were run once using source and once using candidate as the final output-directory component at each DPI. The pixel comparison used Pillow against those PNGs and the worker venv's PyMuPDF renderer with NumPy pixel arrays. Both iterated all 13 page pairs at each DPI using the selected word box `(135.701754, 45.357845, 52.552934, 12.599401)` points and a 1-point band (1/2/4 pixels at 72/144/288 DPI).

| DPI | Poppler page 1 changed pixels | MuPDF page 1 changed pixels | Outside target + 1 pt band (both) | Pages 2–13 (both) |
|---:|---:|---:|---:|---|
| 72 | 662 | 675 | 0 | Pixel-identical |
| 144 | 2,166 | 2,339 | 0 | Pixel-identical |
| 288 | 6,537 | 6,504 | 0 | Pixel-identical |

The page 1 visual comparison shows `hello of Education, Higher` in the original header position. All other page content and table lines match. A browser screenshot of the header itself was not obtained: Browser Use's `scroll()` wheel input timed out twice with `Input.dispatchMouseEvent timed out after 5s waiting for the daemon`. Browser Use health checks and ordinary DOM inspection remained available; the downloaded PDF was independently rendered and visually reviewed with both engines.

**Phase 3 decision: PASS for the qualified local scanned-word workflow.** Selection, trusted baseline validation, exact worker identity, localized compile, actual candidate preview, repeat download and byte parity passed on the approved 13-page source. This does not qualify remote R2 storage, deployment, billing outside the local development topology, or editing outside the supported scope. The one worker full-suite failure remains baseline-equivalent; 10 Studio real-page tests remain skipped because their decrypted fixture is absent. No Phase 4, deployment or production release was started.

### Preservation update

During local qualification, no local branch or HEAD was changed, no local index entry was staged, and no private artifact was added to the Git index. Publication uses new remote-only feature branch commits based on the Phase 2 branch tips; it does not modify the checked-out branches or their indexes. The backend transport correction was limited to the existing standalone General Editor protocol and its tests; Studio and legacy compile paths were not changed. The frontend and worker Phase 2/3 edits remain intact. Test shims, baseline archives, downloads, renders, screenshots and logs/XML remain outside Git. No private PDF or source-derived render is included in the published trees.
