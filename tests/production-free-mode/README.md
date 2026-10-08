# GIM-33 — production free-mode acceptance audit

**Scope:** every actively published supported Platen tool, not merely every test file containing a tool slug.

**Frozen baselines:** frontend \`main\` \`0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b\`, backend \`master\` \`296838852195f96ca5590b3466a33ec5ae3e39d9\`. The frontend catalog can also contain active CMS tools; the inventory command queries production CMS and records whether that query succeeded.

## Safety and evidence

- Work against \`https://platenpdf.com\` only; new private browser context per scenario. **No mocked API responses, fake job statuses, or bypassed billing policies.**
- No persistent test accounts, payment transactions, or real user documents. Synthetic, tiny PDF fixtures are created at runtime.
- One Playwright worker, **no retries**, no load test, no unsafe high-volume processing. The pilot deliberately runs only two tools; it does **not** establish 46-tool coverage.
- A live-production run requires explicit environment opt-in and checks that the real \`/api/auth/session\` response reports \`guest\`, \`mode: free\`, \`processing_unit_limits_enforced: false\`, \`purchases_enabled: false\`.
- Capture browser download bytes, output structure, known marker text, observed API status, output hash and request paths. No cookies, tokens, emails or request bodies in evidence.
- Block checkout creation as a **safety tripwire**: a checkout attempt fails acceptance immediately; this does not mock any processing API.
- Guest responses do not expose a purchased-credit ledger; for guests credit deductions are **not directly observable**. Do not claim account credit invariants passed without before/after account balance and transaction checks.
- Production observations can still be impacted by rate limits, downtime, geographic routing and third-party cookies. Preserve failure evidence and distinguish tool defects from infrastructure/environment failures.
- Never merge the harness into \`main\` or change production configuration without separate release authorization.

## Audit inventory

\`npx tsx tests/production-free-mode/inventory.ts\` writes a reproducible, machine-readable JSON snapshot in \`artifacts/gim33/\` and prints coverage/counts. It merges active CMS entries with the frontend fallback catalog. If CMS fails or is inaccessible, the inventory is **provisional**, never complete.

Each tool row has a route, category, policy, accepted type, default input recipe, \`guest\`, \`freeAccount\`, \`existingPaidAccount\` statuses and output acceptance state. Status vocabulary: \`PASS\`, \`FAIL\`, \`BLOCKED\`, \`NOT_TESTED\`, \`NOT_APPLICABLE\`. A discovered listing is **NOT_TESTED**, never PASS. Authenticated scenarios remain **BLOCKED** until disposable, authorized accounts are available.

### Safe guest production pilot

\`\`\`bash
PLATEN_LIVE_FREE_AUDIT=I_ACKNOWLEDGE_PRODUCTION \
E2E_BASE_URL=https://platenpdf.com \
npx playwright test tests/production-free-mode/guest-pilot.spec.ts \
  --project=chromium --workers=1 --retries=0
\`\`\`

The pilot covers:
1. \`/merge-pdf\` with two synthetic one-page PDFs → real download; valid PDF containing exactly two pages.
2. \`/pdf-to-word\` with a synthetic one-page PDF → real \`POST /api/conversion/pdf-to-word\`; valid DOCX with \`word/document.xml\` and a known audit text marker.

**This is a pilot only.** No result is automatically recorded as full compliance for every tool. More recipes must be written and run for all tool routes, including async and OCR finalization, before certification.

### Expansion requirements

For each of the remaining tool IDs, implement a distinct safe input and output validator: expected PDF page count/rotation/watermark/security, image file structure, office zip/XML, OCR known text, async terminal output and cleanup. Test every applicable guest/free-account/existing-paid-account flow separately. Record any inability to run as BLOCKED or NOT_TESTED; don't widen the blanket generic button click into false assurance.

Full signoff requires **all 46 catalog tool rows and any additional CMS tools** individually verified. A successful request or downloadable file without validated semantics is not a PASS.

Initial guest pilot evidence is recorded in \`pilot-evidence-2026-10-08.json\`; rerun the committed browser suite to reproduce it.
