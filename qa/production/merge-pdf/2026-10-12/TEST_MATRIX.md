# Merge PDF QA test matrix — initial snapshot

The exact original M-01–M-20 definitions are not accessible in this conversation/repository. Only confirmed names are included. **BLOCKED** for M-03–M-19 means not executed because this task explicitly stops at the initial PR review gate and exact case definitions are missing, **not** an application failure.

| Case | Recovered title | Outcome | Qualification |
|---|---|---|---|
| M-01 | Guest Auto Merge | **PASS (historical Codex)** | Owner reports evidence-supported PASS; supporting bytes/logs not reviewed here |
| M-02 | Guest Cloud Merge | **PASS (historical Codex)** | Owner reports evidence-supported PASS; separate from new Browser Use error |
| M-03 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-04 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-05 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-06 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-07 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-08 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-09 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-10 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-11 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-12 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-13 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-14 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-15 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-16 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-17 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-18 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-19 | Original case text not accessible | **BLOCKED (not started)** | Await original plan and independent PR review |
| M-20 | Deferred (details not retrieved) | **DEFERRED** | Explicitly not authorized |

## Additional Browser Use events (do not overwrite Codex PASS)

| ID | Classification | Notes |
|---|---|---|
| BU-HIST-01 | **INCONCLUSIVE (root cause)** | User-reported unsuccessful Cloud Merge ~05:31 UTC; OPTIONS 204 confirmed; no matching POST in inspected Railway rows; no output or original browser trace available |
| BU-PREFLIGHT-01 | **PASS (navigation/inspection); INCONCLUSIVE (upload/download bytes)** | New read-only Browser Use visit; interfaces exposed but not exercised |

Historical PASS entries are retained by provenance and **not claimed as independently revalidated**. Preserve this distinction during future review.
