# GIM-32: Real production free-mode acceptance

The bundled public registry lists **44 unique tool URLs** (37 standard + 7 promoted OCR V2). This is not the final live CMS-merged denominator until reconciled. Every item starts `NOT_TESTED`.

## Safe execution
- Use only synthetic small files and the real website and backend; **no API/session/processing mocks**.
- Real production calls require explicit opt-in. One worker, zero retries, no load tests, no payments, no configuration changes, no service disruption.
- Run: `PLATEN_PRODUCTION_AUDIT=RUN_REAL_PRODUCTION_TESTS E2E_BASE_URL=https://platenpdf.com npx playwright test tests/e2e/production-free-mode-guest-pilot.spec.ts --project=chromium --workers=1 --retries=0`.
- Synthetic fixture generator: `npx tsx tests/production-free-audit/fixtures.ts` writes to gitignored `test-results/production-free-fixtures`. Do not commit fixtures produced for test runs or real account data.
- Report separately processing success, semantic output, UI billing policy, **backend billing-ledger evidence**, and identity access. A guest session has no exposed credit counters; do not infer zero backend charges from a guest response or successful output alone. Account counter comparisons require authorized disposable credentials not stored in the repository.
- PASS requires validated real output and billing evidence for each applicable tool/identity; otherwise FAIL, BLOCKED, NOT_TESTED, or NOT_APPLICABLE with reasons. Never count a mere HTTP 200, route visit, or mocked unit test as real acceptance.
- Do not close OCR finalization/cancellation gap without a completed, traceable async run.

## Coverage plan
1. Reconcile live CMS catalog and backend routes with this static manifest, including aliases and non-public pages.
2. Run guest DOCX→PDF cloud conversion and two-file PDF merge client pilot.
3. Implement scenario adapters for each remaining tool with output-semantic assertions; cover async, error, cancellation, duplicate safety caps.
4. Verify fresh free and existing subscriber accounts only when disposable credentials and authorized billing telemetry are available; capture before/after credit and quota state.
5. Record each result in a separate evidence ledger (SHA and sanitized paths, not credentials). Review fixes on PRs; no auto-merges.

Existing `tests/coverage-audit.ts` finds text matches in specs, which **does not prove real processing**. Prior GIM-10 Playwright tests mocked billing policy, so are not production acceptance evidence.
