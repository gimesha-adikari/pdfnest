# Milestone 1 Stage 0: regression-test plan

**Task:** M1-S0-01
**Scope:** isolated characterization scaffolding and a specified test plan; no production fix
**Contract/source report:** [stage-0-contract-and-source-trace.md](stage-0-contract-and-source-trace.md)

## Test execution boundaries

The two scripts under `tests/security/milestone-1/` are opt-in and outside the default test discovery paths. They assert the desired security invariants; against the current `main` baseline they intentionally exit nonzero for the known vulnerable cases. Do not convert the observed behavior into expected-success assertions, and do not add these scripts to required CI until the corresponding remediation and independent output checks are accepted.

Commands:

```sh
npx tsx tests/security/milestone-1/generate-fixtures.ts
npx tsx tests/security/milestone-1/f01-execution.regression.ts
npx tsx tests/security/milestone-1/f02-relock-failure.regression.ts
```

Fixtures default to `/tmp/platen-m1-security-fixtures`; use `--out-dir PATH` to select another local directory. These commands do not contact production services. F-01 stubs both executors; F-02 stubs `axios.post` and uses a `.invalid` base URL. Baseline failures are demonstration evidence, not a remediation pass.

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

Core source boundary: [ExecutionManager routing](../../../lib/execution/ExecutionManager.ts#L62-L95) and [password-related Device handling](../../../lib/execution/ExecutionManager.ts#L180-L210). Pre-workspace input boundary: [PdfUploader unlock handler](../../../components/pdf/PdfUploader.tsx#L122-L157) before [tool workspace navigation](../../../app/%28site%29/%5BtoolId%5D/page.tsx#L92-L109).

| Case | Layer / stimulus | Invariant to assert | Stage 0 scaffold and current baseline |
|---|---|---|---|
| Unsupported operation in explicit Device | Executor-spy unit; `word_to_pdf` | Reject locally; zero Cloud calls | In `f01-execution.regression.ts`; fails on baseline because manager routes Cloud |
| Client feature disabled in explicit Device | Executor-spy unit; supported `rotate`, flag false | Reject locally; zero Cloud calls | Included; fails on baseline because flag gate precedes Device branch |
| Password-related client limitation in explicit Device | Executor-spy unit; `UNSUPPORTED_CLIENT_OP` with `originalPassword` | Surface local error; zero Cloud calls | Included; fails on baseline because manager attempts Cloud relock |
| Other local engine failure in explicit Device | Executor-spy unit; injected `CLIENT_FAILURE`; `allowFallback: true` | Error remains local; zero Cloud calls | Included; passes on baseline |
| Safety rejection | Executor-spy unit; synthetic file over safety limit | Return safety rejection; zero Cloud calls | Included; passes on baseline |
| Auto fallback | Executor-spy unit; injected local failure | Permitted fallback occurs once when enabled | Included; passes on baseline |
| Explicit Cloud | Executor-spy unit | Cloud executes once | Included; passes on baseline |
| Protected bytes before venue selection | Browser/network test with synthetic protected file and request interception | Device selection/consent precedes any upload; record whether source bytes or password reach `/api/security/unlock` or processing endpoints | Planned only; not covered by the executor harness. Current `PdfUploader` posts to unlock before workspace navigation |
| Wrong password | Browser/API contract test with `protected-alpha.pdf` and wrong synthetic password | No processing continuation, no false success, and no unintended alternate venue | Planned only; uploader maps failures to its incorrect-password message |
| Password-dialog cancellation | Browser test; cancel while protected input is queued | No unlock or processing request after cancel | Planned only; current handler clears queue/password |
| File replacement / stale async response | Browser/component race test; replace or cancel while unlock/processing is pending | No stale source/password submitted or stale result published | Planned only; no current Stage 0 browser harness |
| Multiple protected PDFs with distinct passwords | Browser/API integration test using alpha and beta | Each selected password is associated with its source; venue policy is explicit; no first-password assumption | Fixture pair exists; merge policy and test remain open pending product decision |
| Direct Studio and Studio V2 bypasses | Route-level browser/API coverage per API owner | Assert each path's venue choice, request payload, and result publication | Planned only; legacy direct API and Studio V2 session/job paths are separate |

The executor harness uses fake in-memory PDF bytes and mocks both executors; it does not send any request. Browser-network proof remains necessary because a Device label in the UI cannot prove that uploader preparation stayed local.

## F-02 protected-result matrix

Core source boundary: [`uploadAndDownloadFile`](../../../lib/api.ts#L323-L365), followed by each workspace's result/download state. In a re-lock failure, the current helper emits 100% progress first, catches the lock error, and resolves with the processing response Blob.

| Case | Layer / stimulus | Invariant to assert | Stage 0 status |
|---|---|---|---|
| Successful protected PDF processing | API integration using an alpha fixture | Re-lock completes; response is a valid two-page PDF; correct password opens it; no/incorrect password is rejected | Planned for Stage 1; validate with independent qpdf/pdfinfo/pdftotext, not HTTP success alone |
| Injected `/api/security/lock` failure | API helper unit; successful synthetic processing response then 503 at lock | Reject; no result Blob; no download-state publication; no 100% completion before protection | Included in `f02-relock-failure.regression.ts`; expected to fail current baseline on resolve/no-Blob and progress invariants |
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
| Focused unit/characterization | F-01 executor routing, F-02 helper failure ordering | Current opt-in `.regression.ts` scripts via `npx tsx` |
| Browser/network | Pre-workspace uploader requests, mode consent, cancellation, replacement races, direct Studio routes | Playwright once a test API/mock route is specified; not added to mandatory tests in Stage 0 |
| Backend/API integration | Unlock/lock response errors, malformed/unprotected output, merge behavior, temporary-file lifecycle | Synthetic local integration environment only; no production endpoint or production file |
| Independent artifact validation | Encryption, password correctness, page count, marker content | qpdf, pdfinfo, pdftotext against generated fixtures/results |
| Existing frontend checks | Unit and hybrid execution coverage | `npm run test:unit` scans `tests/unit/*.test.ts`/`.mts`; [`tests/runUnitTests.ts`](../../../tests/runUnitTests.ts#L1-L50) excludes seven execution suites. [`tests/runHybridTests.ts`](../../../tests/runHybridTests.ts) separately drives hybrid suites. Neither runner discovers this `tests/security/.../*.regression.ts` scaffold. |

The default Playwright command is `npm test`; the new filenames do not match normal spec/test discovery. No testing framework or npm dependency was added. Stage 1 should convert each invariant to mandatory CI only after the corresponding implementation exists and the test has independent artifact/browser evidence. Keep still-unresolved product rules as approval-gated tests rather than choosing an implicit policy.

## Existing evidence and limits

- The prior findings repository reports 100 frontend unit-test files passed in its earlier baseline validation, while stating that the complete application suite/build was not run during that audit. This is historical audit evidence, not a command run for this Stage 0 commit.
- The findings' production tests cover selected synthetic, unencrypted Merge submissions and other workflows; they do not prove encrypted input privacy or protected output restoration.
- Stage 0 ran the three new scripts and syntax/lint/type/document checks listed in the final report. The F-01 and F-02 scripts demonstrate current vulnerabilities; they do not demonstrate fixes.
- Browser-level network capture, successful end-to-end re-encryption, malformed/unprotected response validation, cancellation during restoration, Studio V2 result validation, and mixed-password merge are not covered by the current scaffolding.

## Activation sequence

1. Approve the product decisions in the contract report, especially protected-input venue choice, ordinary PDF output policy, merge behavior, and encryption equivalence.
2. Implement F-01 in its authorized Stage 1 task; update executor-spy assertions and add browser evidence for `/api/security/unlock` before venue choice. Once green on the fixed branch, add the now-passing F-01 assertions to mandatory CI.
3. Implement F-02 under its authorized task; add malformed/unprotected output validation and independent qpdf checks, then make successful restoration and failure/no-publication assertions mandatory.
4. Add direct Studio and queued Studio V2 checks only with their route owners and test environments identified.
5. Preserve explicit exceptions for Unlock and non-PDF outputs in tests after product approval.

No Stage 1 implementation, production endpoint, deployment, or merge is authorized by this Stage 0 plan.
