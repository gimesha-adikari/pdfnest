# Merge PDF QA test matrix — initial snapshot

The full original M-01–M-20 plan remains **unavailable** in the connected project/Library search and repository. Do not invent its exact case definitions. Known owner-confirmed titles: M-01 Guest Auto Merge, M-02 Guest Cloud Merge, **M-03 Authenticated Cloud Merge**. M-04–M-19 exact ID-to-scenario titles/assertions require the original plan. M-20 remains deferred. **NOT EXECUTED** means no test started or authorization/review pending; do not use technical BLOCKED for this reason.

| Case | Recovered title | Outcome | Qualification |
|---|---|---|---|
| M-01 | Guest Auto Merge | **PASS (historical Codex)** | Owner reports evidence-supported PASS; supporting bytes/logs not reviewed here |
| M-02 | Guest Cloud Merge | **PASS (historical Codex)** | Owner reports evidence-supported PASS; separate from new Browser Use error |
| M-03 | Authenticated Cloud Merge (detailed original assertions unavailable) | **NOT EXECUTED** | Await original plan, approved test account and review authorization |
| M-04 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-05 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-06 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-07 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-08 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-09 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-10 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-11 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-12 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-13 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-14 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-15 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-16 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-17 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-18 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-19 | Original case text not accessible | **NOT EXECUTED** | Await original case definition and independent PR review |
| M-20 | Deferred (details not retrieved) | **DEFERRED** | Explicitly not authorized |

## Classification legend and shared verification contract

- **PASS:** completed mandatory assertions with evidence; historical Codex M-01/M-02 PASS is owner-confirmed, but original artifacts are not independently audited in PR #23.
- **FAIL:** supported incorrect functional outcome; document provenance and separately evaluate cause.
- **BLOCKED:** actual technical or environment prerequisite prevents execution.
- **INCONCLUSIVE:** attempted execution but evidence insufficient to establish success/failure or cause.
- **NOT EXECUTED:** no attempted test or awaiting authorization; not a technical failure.
- **DEFERRED:** explicitly excluded from authorized scope.

Future tests (after approval) must record controlled input PDF page manifests, browser UI actions/mode, UTC timestamps, frontend and backend production deployments and request/log/metric/health checks before/during/after, and actual downloaded PDF parseability, page counts/order/content/orientations, SHA-256 and size. These are **global requirements from owner instructions**, not reconstructed original per-case assertions.

**Open reviewer requirement:** ask owner to attach the full original M-01–M-20 plan before claiming case definitions restored. Shared topics are known (ordering, Device, Auto fallback, encrypted and invalid inputs, sessions, billing), but exact M-04–M-19 mapping is unknown.

## Additional Browser Use events (do not overwrite Codex PASS)

| ID | Classification | Notes |
|---|---|---|
| BU-HIST-01 | **FAIL (historical user workflow); INCONCLUSIVE (root cause)** | User-reported unsuccessful Cloud Merge ~05:31 UTC; OPTIONS 204 confirmed; no matching POST in inspected Railway rows; no output or original browser trace available |
| BU-PREFLIGHT-01 | **PASS (navigation/inspection); NOT EXECUTED (upload/download bytes)** | New read-only Browser Use visit; interfaces exposed but not exercised |

Historical PASS entries are retained by provenance and **not claimed as independently revalidated**. Preserve this distinction during future review.
