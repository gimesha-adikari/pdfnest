# Milestone 1 Stage 0: regression-test plan

**Task:** M1-S0-01
**Scope:** isolated characterization scaffolding and a specified test plan; no production fix
**Contract/source report:** [stage-0-contract-and-source-trace.md](stage-0-contract-and-source-trace.md)

## Test execution boundaries

The Stage 0 F-01 execution script remains a separate M1-S1-01 task-verification command; all seven manager assertions pass on the integrated milestone branch, while the original `main` baseline failed three. The F-02 script remains opt-in and is expected to fail its two re-lock assertions. Ordinary unit discovery includes the Device safety and feature-flag tests plus the M1-S1-02 transient-provenance and worker-cancellation tests. The new Playwright privacy suite is a separate task-verification command and is not added to required CI. Do not enable the F-02 script in required CI.

Commands:

```sh
npx tsx tests/security/milestone-1/generate-fixtures.ts
npx tsx tests/security/milestone-1/f01-execution.regression.ts
npx tsx tests/security/milestone-1/f02-relock-failure.regression.ts
```

The browser suite uses only synthetic fixtures, a local Next.js app, a local API mock, and Playwright request interception. Start the mock and app in separate terminals, after generating fixtures:

```sh
node tests/security/milestone-1/local-api-mock.mjs
NEXT_PUBLIC_API_URL=http://127.0.0.1:3999 NEXT_PUBLIC_HYBRID_ENABLE_ALL=true NEXT_PUBLIC_HYBRID_ENABLE_UNLOCK=true NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3001
PLATEN_M1_PRIVACY_E2E=1 E2E_BASE_URL=http://localhost:3001 NEXT_PUBLIC_API_URL=http://127.0.0.1:3999 NEXT_PUBLIC_HYBRID_ENABLE_ALL=true NEXT_PUBLIC_HYBRID_ENABLE_UNLOCK=true npx playwright test tests/security/milestone-1/protected-input-privacy.spec.ts --project=chromium --workers=1
```

The Playwright context blocks external requests, records local API request order and multipart bodies, and fulfills processing routes through local synthetic mocks. No production API is contacted.

Fixtures default to `/tmp/platen-m1-security-fixtures`; use `--out-dir PATH` to select another local directory. These commands do not contact production services. F-01 stubs both executors; F-02 stubs `axios.post` and uses a `.invalid` base URL. F-01 now passes only for the manager-level assertions; this does not establish full document-path privacy.

## Synthetic fixture set

`tests/security/milestone-1/generate-fixtures.ts` creates four small files from a deterministic, fixed-metadata two-page `pdf-lib` source, then uses installed `qpdf` to produce independent encrypted variants. Encryption uses randomized ciphertext, so byte hashes can differ between runs; the script prints SHA-256 per generated artifact for each run rather than asserting a fixed encrypted-file digest. No binary PDF is committed.

| Fixture | Format/pages | Marker | Protection and test password | Independent verification |
|---|---|---|---|---|
| `plain-two-pages.pdf` | Valid PDF, 2 pages | `PLATEN_M1_SYNTHETIC_ALPHA`, `PLATEN_M1_SYNTHETIC_BETA` | None | `qpdf --check`; `pdfinfo` page count; `pdftotext` marker extraction |
| `protected-alpha.pdf` | Valid PDF, 2 pages | Same two markers | AES-256; user `platen-m1-user-alpha`, owner `platen-m1-owner-alpha` | Correct password accepted by qpdf/pdfinfo/pdftotext; `pdfinfo` reports `Encrypted: yes`; wrong password rejected by qpdf |
| `protected-beta.pdf` | Valid PDF, 2 pages | Same two markers | AES-256; user `platen-m1-user-beta`, owner `platen-m1-owner-beta` | Correct password accepted by qpdf/pdfinfo/pdftotext; `pdfinfo` reports `Encrypted: yes` |
| `malformed.pdf` | Deliberately invalid PDF-like bytes | `PLATEN_M1_MALFORMED_SYNTHETIC_INPUT` | None | `qpdf --check` fails as expected |

The user passwords are synthetic test data, not credentials. Fixture creation requires existing `pdf-lib`, `qpdf`, `pdfinfo`, and `pdftotext`; no PDF package was installed. qpdf 12.3.2 is available in the inspected environment. qpdf does not allow `--deterministic-id` with encrypted output; the generator therefore fixes source metadata and content but lets qpdf generate encryption randomness. The per-run hashes preserve evidence of the exact artifacts used.

## F-01 privacy regression matrix

Core source boundary: [ExecutionManager Device routing](../../../lib/execution/ExecutionManager.ts#L62-L230) and [Auto routing](../../../lib/execution/ExecutionManager.ts#L233-L361). Pre-workspace input boundary: [PdfUploader unlock handler](../../../components/pdf/PdfUploader.tsx#L122-L157) before [tool workspace navigation](../../../app/%28site%29/%5BtoolId%5D/page.tsx#L92-L109).

| Case | Layer / stimulus | Invariant to assert | M1-S1-01 milestone-branch status |
|---|---|---|---|
| Unsupported operation in explicit Device | Executor-spy unit; `word_to_pdf` | Reject locally; zero Cloud calls | Passes in the seven-assertion F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Client feature disabled in explicit Device | Executor-spy unit; supported `rotate`, flag false | Reject locally; zero Cloud calls | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Password-related client limitation in explicit Device | Executor-spy unit; `UNSUPPORTED_CLIENT_OP` with `originalPassword` | Surface local error; zero Cloud calls | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Other local engine failure in explicit Device | Executor-spy unit; injected `CLIENT_FAILURE`; `allowFallback: true` | Error remains local; zero Cloud calls | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Safety rejection | Executor-spy unit; synthetic file over safety limit | Return safety rejection; zero Cloud calls | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Successful Device execution and reporting | Executor spy; supported `rotate` | Report client execution; no fallback or Cloud call | Covered by mandatory `deviceModeSafety.test.ts` |
| Device cancellation and telemetry | Executor spy; cancellation error | Preserve cancellation; no Cloud call or false cloud-success event | Covered by mandatory `deviceModeSafety.test.ts` |
| Auto fallback | Executor-spy unit; injected local failure | Permitted fallback occurs once when enabled | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Auto exclusions and fallback controls | Executor spy; invalid input, wrong password, cancellation, `allowFallback: false` | No discretionary Cloud fallback for excluded errors or when disabled | Covered by mandatory `deviceModeSafety.test.ts` |
| Auto unsupported/disabled local operation | Executor spy; unsupported tool or per-tool flag false | Preserve existing Cloud routing | Covered by mandatory `deviceModeSafety.test.ts` |
| Explicit Cloud | Executor-spy unit, including disabled client flag | Cloud executes once without ClientExecutor | Passes in the F-01 script and mandatory `deviceModeSafety.test.ts` suite |
| Protected bytes before venue selection | Browser/network test with synthetic protected file and request interception | Device-capable input prep stays local; Cloud preparation and Cloud-only processing require separate affirmative authorization | M1-S1-02R suite verifies local Device/Auto prep, explicit `/api/security/unlock` authorization, and route-scoped consent before direct/queued processing submissions |
| Wrong password | Browser test with `protected-alpha.pdf` and a wrong synthetic password | No processing continuation, false success, or unintended alternate venue | M1-S1-02 browser test verifies local failure and zero Cloud requests |
| Password-dialog cancellation | Browser test; cancel while protected input is queued or Cloud request is pending | No new request after cancel; an already-started authorized Cloud request is not described as recalled | M1-S1-02 browser tests verify no request on pre-submit cancel and no stale navigation after Cloud cancellation |
| File replacement / stale async response | Browser/component race test; replace or cancel while inspection/unlock is pending | No stale source/password submitted or stale result published | M1-S1-02 browser tests cover replacement during inspection, cancellation during Cloud request, and component unmount |
| Multiple protected PDFs with distinct passwords | Browser test using alpha and beta | Each selected password is associated with its source and queue order | M1-S1-02 Merge browser case verifies each multipart payload and the additional-file path; mixed-password output policy remains unresolved and out of scope |
| Direct Studio and workspace PDF pickers | Route-level browser coverage per API owner | Assert each path's venue choice and request payload | M1-S1-02R covers PDF-to-Word, structured queued processing, legacy Studio shared upload guards, and Studio V2 session consent; other legacy Studio direct endpoints remain a separate audit boundary |

The executor harness uses fake in-memory PDF bytes and mocks both executors; it does not send any request. **Passing `ExecutionManager` tests does not prove that explicit Device processing keeps the entire document preparation path local.** M1-S1-02 adds a separate shared-uploader boundary and local browser/network evidence; it does not establish production-backend behavior, cover every direct legacy Studio endpoint, or complete the full F-01 acceptance contract.

## M1-S1-02 input-preparation contract and M1-S1-02R correction

M1-S1-02 added local inspection, local Device/Auto unlock, explicit Cloud unlock consent, transient file provenance, cancellation, and shared-uploader fail-closed defaults. Independent review then found that route workspaces could ignore a Device selection and submit directly to Cloud APIs. The route-level and submission-boundary correction is documented below; the Stage 0 source trace remains a historical baseline and is not rewritten.

## M1-S1-02R route-level venue policy

`getProtectedPdfRoutePolicy` derives each landing-page policy from the actual tool registry's PDF accept metadata, execution policy, client capability, and offline-workspace capability. Explicit registry overrides identify Unlock and Studio V2. The resulting classes are:

| Route class | Protected-input behavior | Examples |
|---|---|---|
| Device/Auto/Cloud through `ExecutionManager` | Protected input may be prepared locally; selected mode is carried into its workspace. | Merge, Rotate, and other registered client-capable offline workspaces |
| Cloud-only direct/API/queued | No Device choice is shown. Protected input can be locally unlocked, then the user must authorize this specific tool's Cloud submission. The submit handler rechecks authorization immediately before sending. | PDF-to-Word, Grayscale, PDF-to-Markdown, PDF Editor, Redact, OCR Text V2, OCR-aware Markup V2, Structured Document V2 |
| Cloud-capable direct branches | Protected input has no Device choice because these workspaces do not carry the selected venue into every direct submission branch. The route requires scoped Cloud authorization before the workspace opens, and direct worker helpers recheck it. | Legacy Highlight, Underline, and Strikeout OCR/worker branches |
| Explicit Unlock | The intentional unlock operation accepts the source without the ordinary preparation prompt. | Unlock PDF |
| Studio V2 session consent | Its existing inspection bypass is retained; session upload waits for affirmative Cloud-upload consent. | PDF Studio V2 |
| Unqualified or non-PDF route | Protected, derived, or unverified inputs fail closed before the workspace can submit. Image-only searchable-PDF routes are not classified as protected-PDF processors. | Unregistered legacy `/studio`, `/searchable-pdf-v2`, `/image-to-searchable-pdf`, and future unqualified routes |

Direct Cloud workspaces enforce a route-scoped authorization both at the shared workspace gate and immediately before their processing endpoint. Plain PDFs inspected as unprotected retain their existing Cloud workflow without the additional protected-input consent. Cloud-unlock consent does not authorize a later Cloud-processing request. PDF-to-Text's explicit Cloud OCR submission has a separate confirmation for protected or unverified sources; Auto fallback remains governed by the existing Auto contract. Structured Document V2 may load service capabilities before consent, but the protected document is not included until its user-triggered job submission passes the guard.

The Processing Mode selector uses one eligibility function for its Device button and Cloud-offline alternate. If the current file or any file in its batch was already sent to Cloud, Device is unavailable and the transmission warning remains visible. `ExecutionManager` also rejects a stale explicit Device request for a Cloud-transmitted input locally, before invoking either executor. Auto and Cloud behavior are unchanged. A protected file transferred with Cloud-transmission provenance opens in Cloud mode; the uploader preserves that marker through reinspection, preparation, and explicit Unlock input. Device is not reoffered for that source.

Mixed input preparation keeps the original selection list and replaces each protected source at its original index after preparation. Password entry remains scoped to the first protected source in queue order. Tests cover Plain A + Protected B + Plain C and Protected A + Plain B + Protected C, including distinct alpha/beta passwords and cancellation.

Cross-tool transfer carries only transient protection-lineage and Cloud-transmission booleans with the in-memory Blob. The destination creates a new File and re-inspects its bytes; source protection is not inferred as output encryption. Derived or previously Cloud-transmitted inputs require target-route Cloud authorization when sent to a direct Cloud route. This does not define output encryption or resolve F-02.

The 26-case Playwright suite in `tests/security/milestone-1/protected-input-privacy.spec.ts` passed against a local Next.js app, synthetic fixtures, request interception, and local API mocks. It includes PDF-to-Word and queued Structured Document submission ordering/payload checks, separate Cloud OCR authorization after Cloud unlock, protected-input annotation route consent, offline-selector lockout, normal Device/Auto/Cloud selection for plain PDFs, mixed Merge order/passwords, cancellation/stale-response cases, Cloud-prepared cross-tool transfer to PDF Editor, plain PDF behavior, Unlock, legacy Studio fail-closed input, and Studio V2 upload consent. It proves the tested browser-to-mock request boundary only. It does not establish real-backend behavior, production browser behavior, every direct legacy Studio endpoint, or protected output publication. F-01 remains open and F-02 remains unresolved.

## F-02 protected-result matrix

Core source boundary: [`uploadAndDownloadFile`](../../../lib/api.ts#L323-L365), followed by each workspace's result/download state. In a re-lock failure, the current helper emits 100% progress first, catches the lock error, and resolves with the processing response Blob.

| Case | Layer / stimulus | Invariant to assert | Stage 0 status |
|---|---|---|---|
| Successful protected PDF processing | API integration using an alpha fixture | Re-lock completes; response is a valid two-page PDF; correct password opens it; no/incorrect password is rejected | Planned for Stage 1; validate with independent qpdf/pdfinfo/pdftotext, not HTTP success alone |
| Injected `/api/security/lock` failure | API helper unit; successful synthetic processing response then 503 at lock | Reject; no result Blob; no download-state publication; no 100% completion before protection | Included in `f02-relock-failure.regression.ts`; still fails on the milestone branch for resolve/no-Blob and progress invariants; not part of M1-S1-01 |
| Malformed lock response | API/browser integration; 200 response containing malformed bytes or non-PDF content | Treat as failure; no result publication | Planned; current helper trusts response data/type |
| Unexpected unprotected response | API integration; lock endpoint returns a valid but unencrypted PDF | Reject/withhold result under an approved preservation contract | Planned; validate encryption independently with qpdf |
| Cancellation during required restoration | API/browser integration; abort after processing but before/during lock | No success state or download; abort semantics are explicit; no unprotected fallback | Planned; current helper uses the signal for initial request but does not pass it to its lock request |
| Wrong input password | Integration with wrong password | Reject processing; no output Blob or download | Planned; independent backend behavior must be exercised with synthetic fixture |
| Multiple protected inputs | Merge integration with alpha and beta | Follow an explicitly approved mixed-password/output policy; validate every output independently | Fixture pair exists; policy and test are blocked on product decision |
| Temporary result publication/cleanup failure | Backend/API integration with injected file/send/cleanup faults | No artifact is reported complete before validated protected bytes exist; temporary files are handled under an explicit lifecycle rule | Planned; backend cleanup paths are not changed in Stage 0 |
| Progress/completion order | API helper test with progress spy | 100% and success state follow completed protection and validation | Included for lock failure; currently fails because 100 is emitted before the lock request |
| Non-PDF and explicit Unlock | Contract regression for TXT/images/Word and Unlock | Do not apply PDF re-lock to outputs where protection is not applicable or intentionally removed | Plan only; product exceptions should be codified before global helper changes |

The current F-02 harness injects the lock failure in-process and never contacts a backend. It checks one processing call, one lock call, absence of a resolved Blob, and absence of 100% progress. It does not yet validate a successful encrypted artifact or a workspace's `setDownloadData`/download side effect.

## Test layers, discovery, and CI activation

| Layer | Responsibility | Current or planned runner |
|---|---|---|
| Required unit suite | F-01 manager routing, Device/Auto/Cloud compatibility, feature flags, PDF preparation provenance, and route policy | `npm run test:unit` discovers the manager, flag, preparation, cancellation, and route-policy suites |
| Task-specific characterization | Seven F-01 execution-manager assertions; F-02 helper failure ordering | Run `npx tsx tests/security/milestone-1/f01-execution.regression.ts` for M1-S1-01; keep `f02-relock-failure.regression.ts` opt-in and unresolved |
| Browser/network | Pre-workspace uploader requests, mode consent, cancellation, replacement races, selected Studio paths | `tests/security/milestone-1/protected-input-privacy.spec.ts`; opt-in task verification against a local app/API mock, not in required CI |
| Backend/API integration | Unlock/lock response errors, malformed/unprotected output, merge behavior, temporary-file lifecycle | Synthetic local integration environment only; no production endpoint or production file |
| Independent artifact validation | Encryption, password correctness, page count, marker content | qpdf, pdfinfo, pdftotext against generated fixtures/results |
| Existing frontend checks | Unit and hybrid execution coverage | `npm run test:unit` scans `tests/unit/*.test.ts`/`.mts`; [`tests/runUnitTests.ts`](../../../tests/runUnitTests.ts#L1-L50) excludes seven execution suites. [`tests/runHybridTests.ts`](../../../tests/runHybridTests.ts) separately drives hybrid suites. Neither runner discovers this `tests/security/.../*.regression.ts` scaffold. |

The security Playwright spec is excluded from the default `npm test` run unless `PLATEN_M1_PRIVACY_E2E=1` is explicitly set, because it requires the local app and mock API. No testing framework or npm dependency was added. Manager assertions remain mandatory through the existing unit suite; the F-01 execution script stays a separate task-verification command. Browser/network acceptance, independent output-artifact validation, and unresolved product rules remain separate gates.

## Existing evidence and limits

- The prior findings repository reports 100 frontend unit-test files passed in its earlier baseline validation, while stating that the complete application suite/build was not run during that audit. This is historical audit evidence, not a command run for this Stage 0 commit.
- The findings' production tests cover selected synthetic, unencrypted Merge submissions and other workflows; they do not prove encrypted input privacy or protected output restoration.
- Stage 0's baseline run showed three F-01 manager failures and two F-02 failures. M1-S1-01's focused run now passes all seven F-01 manager assertions; the separate F-02 script still fails two assertions as expected.
- Feature-flag unit tests run under Node and verify precedence, normalization, and malformed-value handling. They do not prove that a Next.js production build inlines the public environment values; M1-S1-01 did not run a build-artifact check.
- Browser-level request interception verifies the selected route and uploader boundaries listed above, but real backend behavior, successful end-to-end re-encryption, malformed/unprotected output validation, cancellation during output restoration, Studio V2 result validation, and mixed-password Merge output policy remain unverified.

## Remaining boundaries

1. M1-S1-02R closes the reviewed uploader-to-workspace venue inconsistency for the tested and qualified routes. Remaining F-01 work should audit unqualified and uncovered legacy/direct Cloud paths and qualify real supported browser/API combinations before claiming complete application-wide Device privacy.
2. F-02 re-lock failure propagation and protected-artifact validation remain a separate unresolved task. Its current regression script is expected to fail and is not enabled in required CI.
3. Browser/network acceptance, successful encrypted-output validation, malformed/unprotected response validation, Studio V2 result validation, and mixed-password merge behavior have not been established here.
4. Continue remaining work on unreleased development branches. Consider production merges only after milestone qualification and explicit user approval; this plan does not authorize production deployment or a default-branch merge.
