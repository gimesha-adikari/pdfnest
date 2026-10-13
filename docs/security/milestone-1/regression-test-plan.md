# Milestone 1 Stage 0: regression-test plan

**Task:** M1-S0-01
**Scope:** isolated characterization scaffolding and a specified test plan; no production fix
**Contract/source report:** [stage-0-contract-and-source-trace.md](stage-0-contract-and-source-trace.md)

## Test execution boundaries

The two scripts under `tests/security/milestone-1/` remain opt-in and outside default test discovery. The Stage 0 F-01 script is now a separate required M1-S1-01 verification command and all seven manager assertions pass on the integrated milestone branch; the original `main` baseline failed three of them. F-02 remains unresolved and its script is expected to fail its two re-lock assertions. The ordinary unit suite discovers `tests/unit/deviceModeSafety.test.ts`, which carries manager-level Device checks in CI without adding the F-01 script itself to the unit runner. Do not enable the F-02 script in required CI during this task.

Commands:

```sh
npx tsx tests/security/milestone-1/generate-fixtures.ts
npx tsx tests/security/milestone-1/f01-execution.regression.ts
npx tsx tests/security/milestone-1/f02-relock-failure.regression.ts
```

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
| Protected bytes before venue selection | Browser/network test with synthetic protected file and request interception | Device selection/consent precedes any upload; record whether source bytes or password reach `/api/security/unlock` or processing endpoints | Planned only; not covered by the executor harness. Current `PdfUploader` posts to unlock before workspace navigation |
| Wrong password | Browser/API contract test with `protected-alpha.pdf` and wrong synthetic password | No processing continuation, no false success, and no unintended alternate venue | Planned only; uploader maps failures to its incorrect-password message |
| Password-dialog cancellation | Browser test; cancel while protected input is queued | No unlock or processing request after cancel | Planned only; current handler clears queue/password |
| File replacement / stale async response | Browser/component race test; replace or cancel while unlock/processing is pending | No stale source/password submitted or stale result published | Planned only; no current Stage 0 browser harness |
| Multiple protected PDFs with distinct passwords | Browser/API integration test using alpha and beta | Each selected password is associated with its source; venue policy is explicit; no first-password assumption | Fixture pair exists; merge policy and test remain open pending product decision |
| Direct Studio and Studio V2 bypasses | Route-level browser/API coverage per API owner | Assert each path's venue choice, request payload, and result publication | Planned only; legacy direct API and Studio V2 session/job paths are separate |

The executor harness uses fake in-memory PDF bytes and mocks both executors; it does not send any request. **Passing `ExecutionManager` tests does not prove that explicit Device processing keeps the entire document preparation path local.** The shared uploader still submits encrypted bytes and the entered password to `/api/security/unlock` before workspace navigation, while the venue selector is presented in the workspace. Browser/network proof and a separate pre-workspace privacy fix remain necessary.

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
| Required unit suite | F-01 manager routing, Device/Auto/Cloud compatibility, feature flags | `npm run test:unit` discovers `tests/unit/deviceModeSafety.test.ts` and `tests/unit/flags.test.ts` |
| Task-specific characterization | Seven F-01 execution-manager assertions; F-02 helper failure ordering | Run `npx tsx tests/security/milestone-1/f01-execution.regression.ts` for M1-S1-01; keep `f02-relock-failure.regression.ts` opt-in and unresolved |
| Browser/network | Pre-workspace uploader requests, mode consent, cancellation, replacement races, direct Studio routes | Playwright once a test API/mock route is specified; not added to mandatory tests in Stage 0 |
| Backend/API integration | Unlock/lock response errors, malformed/unprotected output, merge behavior, temporary-file lifecycle | Synthetic local integration environment only; no production endpoint or production file |
| Independent artifact validation | Encryption, password correctness, page count, marker content | qpdf, pdfinfo, pdftotext against generated fixtures/results |
| Existing frontend checks | Unit and hybrid execution coverage | `npm run test:unit` scans `tests/unit/*.test.ts`/`.mts`; [`tests/runUnitTests.ts`](../../../tests/runUnitTests.ts#L1-L50) excludes seven execution suites. [`tests/runHybridTests.ts`](../../../tests/runHybridTests.ts) separately drives hybrid suites. Neither runner discovers this `tests/security/.../*.regression.ts` scaffold. |

The default Playwright command is `npm test`; the security scripts do not match normal Playwright or unit-test discovery. No testing framework or npm dependency was added. Manager assertions are mandatory through the existing unit suite; the F-01 script remains a separate required task-verification command to avoid duplicating the full characterization script in CI. Browser/network tests, independent artifact validation, and unresolved product rules remain separate acceptance gates.

## Existing evidence and limits

- The prior findings repository reports 100 frontend unit-test files passed in its earlier baseline validation, while stating that the complete application suite/build was not run during that audit. This is historical audit evidence, not a command run for this Stage 0 commit.
- The findings' production tests cover selected synthetic, unencrypted Merge submissions and other workflows; they do not prove encrypted input privacy or protected output restoration.
- Stage 0's baseline run showed three F-01 manager failures and two F-02 failures. M1-S1-01's focused run now passes all seven F-01 manager assertions; the separate F-02 script still fails two assertions as expected.
- Feature-flag unit tests run under Node and verify precedence, normalization, and malformed-value handling. They do not prove that a Next.js production build inlines the public environment values; M1-S1-01 did not run a build-artifact check.
- Browser-level network capture, successful end-to-end re-encryption, malformed/unprotected response validation, cancellation during restoration, Studio V2 result validation, and mixed-password merge are not covered by the current scaffolding.

## Remaining boundaries

1. The M1-S1-01 integration covers only `ExecutionManager`. The next F-01 implementation task should prevent the shared uploader from sending protected source bytes/password to `/api/security/unlock` before the user selects an execution venue, then add synthetic browser/network assertions for that ordering.
2. F-02 re-lock failure propagation and protected-artifact validation remain a separate unresolved task. Its current regression script is expected to fail and is not enabled in required CI.
3. Browser/network acceptance, successful encrypted-output validation, malformed/unprotected response validation, Studio V2 result validation, and mixed-password merge behavior have not been established here.
4. Continue remaining work on unreleased development branches. Consider production merges only after milestone qualification and explicit user approval; this plan does not authorize production deployment or a default-branch merge.
