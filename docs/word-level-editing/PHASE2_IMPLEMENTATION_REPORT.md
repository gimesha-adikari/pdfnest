# Platen word-level editing — Phase 2 report

**Date:** 2026-11-09
**Scope:** General Editor word-edit transport, baseline validation, and fail-closed compilation boundary.
**Outcome:** **PASS for the Phase 2 transport acceptance condition.** Precise PDF compilation remains intentionally unsupported.

## Result

A selected word edit is serialized from the existing editor reducer, checked against the completed General Editor OCR V2 extraction in the Go backend, revalidated by the Python worker against its server-held extraction result and source document, and passed through the existing isolated worker boundary with its original operation identity and replacement intact. The worker then returns an explicit `WORD_EDIT_COMPILATION_NOT_IMPLEMENTED` failure. It does not publish an unchanged or modified PDF artifact.

This is a transport and validation result. It does not claim that a word was changed in a PDF or that Phase 3 has begun.

## Protocol contract

The request protocol is `platen_word_edits.v1`. It is separate from the extraction layout schema, which remains `ocr_v2_editor_layout.v1`.

```json
{
  "edit_protocol": "platen_word_edits.v1",
  "source_tracker": "<existing immutable source key>",
  "extraction_job_id": "<completed General Editor OCR V2 job id>",
  "baseline_digest": "sha256:<64 lowercase hex characters>",
  "edits": [
    {
      "page_num": 1,
      "element_id": "<baseline element id>",
      "word_id": "<baseline word id>",
      "expected_original_text": "Ministry",
      "replacement_text": "hello",
      "style_override": null,
      "fit_policy": "preserve_neighbors"
    }
  ]
}
```

The client submits a final snapshot of changed words. It does not send client-authored page geometry or modified whole-line text as an authoritative word operation. Repeated words remain distinguishable by their baseline word IDs. Empty `replacement_text` means deletion. Reverting a word to its original text removes that word from the serialized snapshot. Undo and redo serialize the current reducer state, including edits made before blur. Word mode rejects mixed whole-line/style edits; line mode continues through the existing layout callback.

Protocol v1 accepts 1–1000 operations. Each replacement is limited to 4096 Unicode scalar values. Operation targets must be unique; `style_override` must be `null`; `fit_policy` must be `preserve_neighbors`. Unknown versions, unknown fields, malformed Unicode/JSON, stale identity, duplicate or ambiguous targets, and invalid baseline data fail closed. The worker also checks the encoded request against the existing 16 MiB native isolation frame limit with reserved overhead.

## Trusted baseline and source binding

The worker freezes the General Editor OCR V2 result in the successful extraction job's existing result record. It adds the advertised protocol and a baseline identity containing the extraction job ID, the source SHA-256, an engine fingerprint, the baseline algorithm version, and the baseline digest. This uses the existing worker job store and its configured retention; it adds no service or database. An expired or missing extraction job cannot validate a later edit request.

The baseline digest is SHA-256 over canonical UTF-8 JSON containing the extraction job ID, source digest, engine fingerprint, algorithm version, layout schema version, language mode, languages, and extracted pages. The source digest is captured around extraction, and the worker checks the source again before processing the word-edit job. The backend binds the request to the owned source key and exact completed `editor_extract` job, and checks the General Editor/OCR V2 identity, baseline digest, schema, page, element, word ID, and expected original text. The worker repeats those checks against its own stored job record, recomputes the digest, checks target uniqueness and geometry/word-ID consistency, and confirms the source identity before isolation.

## Transport path

1. The frontend's existing reducer remains the source of word replacements and undo/redo state. The new serializer emits only changed baseline word operations when word mode is enabled and the extraction advertises v1 support.
2. The standalone General Editor compile request enters the existing Go endpoint. Requests carrying word protocol fields use strict v1 validation and the exact extraction job; requests without those fields continue through the legacy layout path. The backend forwards accepted operation data through its worker client to the dedicated worker word-edit endpoint.
3. The worker validates the request when it is received, stores it in the existing queued editor job, and validates the baseline, operations, and source again when the job runs.
4. The worker passes the original source and validated request through the existing isolated native operation `validate_word_edit_transport`. The boundary returns a receipt for the exact envelope and input source. The parent verifies the receipt, then marks the job failed with `WORD_EDIT_COMPILATION_NOT_IMPLEMENTED`; no output is uploaded or exposed as a successful download.

## Changed files

### `pdfnest` (frontend)

- `components/editor-v2/model.ts` — extraction protocol and baseline metadata types.
- `components/editor-v2/wordEdits.ts` — final snapshot serializer, validation, and line/word intent separation.
- `components/editor-v2/SharedEditor.tsx` — optional General Editor word-edit mode and callback while preserving existing callbacks.
- `components/tools/EditPdfWorkspace.tsx` — submits word intent and handles the explicit unsupported compile result without offering a download.
- `tests/unit/editorWordEditsProtocol.test.ts` — serialization, reducer round-trip, repeated/multiple words, deletion, undo/redo/revert, Unicode, draft-before-blur, line-mode, and invalid mixed intent cases.
- `docs/word-level-editing/PHASE2_IMPLEMENTATION_REPORT.md` — this report.

### `pdfnest-backend` (Go)

- `internal/edit/controller.go` — standalone General Editor protocol dispatch, source ownership and completed extraction binding.
- `internal/edit/service.go` — optional word-edit service interface, preserving existing service interface users.
- `internal/edit/python.go` — dedicated worker endpoint request forwarding.
- `internal/edit/word_edits.go` — strict v1 decode and baseline/target validation.
- `internal/edit/word_edits_test.go` — protocol, identity, duplicate, stale, foreign, malformed, and unsupported target cases.
- `internal/edit/word_edits_worker_transport_test.go` — HTTP transport shape and payload preservation to a worker test endpoint.

### `pdfnest-worker` (Python)

- `app/core/word_edits.py` — baseline digest, strict v1 validation, target ambiguity checks, frame-size validation, and exact isolation receipt.
- `app/jobs/actors.py` — extraction baseline capture/source identity and fail-closed word-edit job lifecycle.
- `app/api/tools/editor/router.py` — dedicated word-edit endpoint and legacy route guard.
- `app/core/native_operations.py` — isolated transport-validation operation.
- `app/controller/profiles.py` — explicit isolation profile for the operation.
- `gateway_protocol/routes.py` — route policy allowlist for the dedicated endpoint.
- `tests/test_word_edits_protocol.py` — baseline, request, target, source, actor, failure, and download behavior tests.
- `tests/controller/test_operation_profiles.py` and `tests/test_gateway_protocol.py` — isolation and route policy regression coverage.

The `platen-document` SDK was not changed.

## Tests and actual results

### Frontend

- `node --import tsx tests/unit/editorWordEditsProtocol.test.ts` — **PASS**.
- `npx tsc --noEmit --pretty false` — **PASS**.
- Targeted ESLint on changed frontend files — **PASS**, zero errors and one existing `<img>` warning in `EditPdfWorkspace.tsx`.
- `npx tsx tests/runUnitTests.ts` — **PASS**, 140/140 files.
- `npm run test:unit` — **FAIL in the wrapper preflight**, before the main runner: 8/9 environment-preflight cases passed; the “development preflight rejects a missing API origin” case sees the repository `.env` loaded by Next's environment loader. The main 140-file runner was run separately and passed. No environment file was changed.

### Go backend

- `go test ./internal/edit` — **PASS**.
- `go test ./...` — **FAIL due to unavailable local PostgreSQL** (`127.0.0.1:5432` refused) in `internal/studio` and `internal/studio/models`; the word-edit package tests pass.

### Python worker

- `PYTHONPATH=. .venv/bin/pytest -q tests/test_word_edits_protocol.py tests/test_gateway_protocol.py tests/controller/test_operation_profiles.py` — **PASS**, 186 passed.
- `PYTHONPATH=. .venv/bin/pytest -q tests/test_word_edits_protocol.py tests/test_editor_ocr_engine_boundary.py tests/test_studio_editor_extraction_engine.py tests/test_phase8_editor_ocr_v2.py tests/test_native_isolation.py` — **PASS**, 78 passed.
- `PYTHONPATH=. .venv/bin/pytest -q` — **NOT GREEN**: 1317 passed, 133 failed, 10 skipped, and 70 errors. The 23 `tests/test_markdown_admission.py` errors require a `redis-server` executable that is absent. The remaining failures/errors are concentrated in 179 `tests/test_raster_sdk_boundary.py` cases and one `tests/test_render_session_storage_budget.py` case that requires the production replica declaration. The raster/SDK failures remain unresolved and are not claimed as environment-only; the SDK was intentionally not changed. The Phase 2 targeted worker tests listed above pass.
- `ruff check ...` could not run because `ruff` is not installed in this environment.

### End-to-end boundary coverage and limits

The frontend serializer tests, Go backend-to-worker HTTP test, Python endpoint/job tests, and actual isolated-operation tests verify the contract at each boundary. A live frontend → backend → Redis queue → deployed worker round trip was not run because this environment did not provide the Redis service and worker storage/runtime topology needed for that deployment-level path. No PDF compilation was attempted; the required fail-closed unsupported result was tested instead.

## Compatibility evidence

- General Editor word operations use the separate v1 request path. Requests without a word protocol continue through the existing legacy layout compile path; word fields with an unknown or malformed version are rejected rather than decoded as layout changes.
- Studio keeps the existing typed layout contract and independent `ocr_v2_editor_layout.v1` schema. Studio extraction regression tests passed in the focused worker run; no Studio schema or compile behavior was changed.
- Existing frontend compile callbacks remain optional and compatible; word mode is explicitly selected for the standalone General Editor. The targeted frontend line-mode test confirms whole-line intent remains on the layout path.
- The SDK remains unchanged.

## Limitations and unresolved issues

- Precise PDF word replacement is not implemented. Every accepted request ends in an explicit unsupported failure, and cannot yield a successful downloadable artifact.
- Baseline availability follows the existing extraction job retention. An expired/missing job requires a fresh extraction.
- Full live multi-process Redis/object-storage integration was not available in this environment.
- The full Python suite and `go test ./...` remain red for the reported repository/environment issues; the complete regression suites must be rerun in an environment with their required dependencies before release qualification.
- No Phase 3 or Phase 4 work was started.

## Publication

The three repositories are published independently on the remote feature branch `codex/word-level-editing-phase2-20261109`. Exact commit IDs and verified branch links are included in the completion message that accompanies this report.
