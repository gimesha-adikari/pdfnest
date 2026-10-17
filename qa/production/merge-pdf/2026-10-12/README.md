# Platen PDF — Merge PDF production QA (initial review gate)

**Date:** 2026-10-12 UTC. **Site:** https://platenpdf.com/merge-pdf. **Scope:** Merge PDF only.

This is an **initial read-only investigation and Browser Use preflight**. **No new merge submissions, downloads, fixes or configuration changes** were made. Stop after this draft PR for independent review.

## Summary

- Browser Use, Vercel, Railway and GitHub integrations were all accessible.
- The new Browser Use cloud browser opened production Merge PDF (HTTP 200), inspected the file input, page requests and screenshot interface. Upload and downloaded-byte capabilities were **exposed but not exercised**; full E2E is not yet proven in this browser.
- In a separate earlier Browser Use run on October 12, the owner reports a two-PDF Cloud Merge submission at ~05:31:13 UTC, error **“PDFNest processing service is currently unavailable.”** at ~05:31:46, and no PDF download.
- The backend HTTP logs contained **OPTIONS /api/structure/merge 204 at 05:31:14.560617266 UTC**, without a matching POST in the inspected 05:26–05:43 UTC rows. This **does not prove** the POST never occurred.
- All five Railway production services were online; Vercel's active production deployment was READY. See ENVIRONMENT.md.
- The production frontend source emits this error text for an Axios error without an HTTP response. Exact cause remains **inconclusive**, not a confirmed backend defect.
- Prior Codex **M-01 and M-02 PASS** outcomes are kept as **historical owner-reported results**, separate from the Browser Use failure. Original case PDF outputs/screenshots/log correlation were not accessible for an independent audit.
- M-03–M-19 were not attempted. **M-20 DEFERRED**.

## Repository and evidence conventions

Inspected root, .github and tests/. There was **no pre-existing qa/ directory** on the default branch. This documentation lives under qa/production/merge-pdf/2026-10-12/ and leaves existing tests/source untouched.

The **exact original M-01–M-20 test-definition document was not found** in the connected project file search or repo, although conversation context gave some case summaries. Missing case definitions have **not** been invented.

No screenshots, HAR, downloaded PDFs or original Codex artifacts were committed: binary evidence from the prior tests was not accessible via the GitHub UTF-8 text-file integration. Browser Use's fresh screenshot was available only in its live preview. Nothing unverified is described as uploaded.

## Review order

1. [FINDINGS.md](FINDINGS.md) and [BUGS.md](BUGS.md) — observation versus hypothesis.
2. [ENVIRONMENT.md](ENVIRONMENT.md) — deployments, health, timestamped logs and metrics.
3. [PREFLIGHT.md](PREFLIGHT.md) — new Browser Use capability evidence.
4. [TEST_MATRIX.md](TEST_MATRIX.md) and [CASES/BU-HIST-01.md](CASES/BU-HIST-01.md) — status and historical failure.
5. [CASES/M-01.md](CASES/M-01.md) and [CASES/M-02.md](CASES/M-02.md) — inherited Codex outcomes.

**Review gate:** no new production functional testing or merge submissions until the initial draft PR has been independently reviewed. Do not merge without authorization.

---
## Update addressing independent review #5487101320 (2026-10-12)

The corrected ledger is [TEST_MATRIX.md](TEST_MATRIX.md): M-03–M-19 are **NOT EXECUTED**, not technically blocked; M-20 remains **DEFERRED**. M-03 is **Authenticated Cloud Merge**. Historical Codex M-01/M-02 remain owner-confirmed PASS from independently validated downloads in that prior environment, but **their underlying artifacts have not been audited in this GitHub PR**.

The historical separate Browser Use Cloud Merge had a **reported FAIL outcome (error/no output)**, while the **root cause remains INCONCLUSIVE**. The failing original Browser Use run ID, HAR and screenshots were not accessible. The later read-only preflight run ID must not be substituted.

See [REVIEW_RESPONSE.md](REVIEW_RESPONSE.md) for all five reviewer findings and unresolved evidence gaps. **The full authoritative M-01–M-20 plan is still missing and must be attached by the owner before exact per-case definitions can be restored.** This PR is still draft. No additional processing requests are authorized.
