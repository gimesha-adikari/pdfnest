# BU-HIST-01 — separate earlier Browser Use Cloud Merge failure

**Date:** 2026-10-12 UTC. **Tool:** Merge PDF only. **Environment:** Browser Use cloud browser, production.

## Owner-reported sequence

1. Uploaded two synthetic PDFs.
2. Selected Cloud processing.
3. Submitted Merge at approximately **05:31:13 UTC**.
4. At approximately **05:31:46 UTC** UI displayed **“PDFNest processing service is currently unavailable.”**
5. No output/download and therefore no PDF byte/hash/page/content verification.

## Independent retrospective observations

- Railway backend HTTP logs, bounded **05:26–05:43 UTC**, showed **OPTIONS /api/structure/merge → 204** on `api.platenpdf.com` at **05:31:14.560617266Z**.
- No matching POST in returned backend HTTP records. **This does not establish no POST occurred** or that CORS succeeds.
- Earlier session and health GETs HTTP 200; Railway's five services online with no recent failed deployments; Vercel frontend active production deployment READY.
- No matching Vercel function error returned; Vercel function logs are not client-to-API network traces.
- Production frontend source converts Axios errors with no HTTP response into the displayed short service-unavailable text. Root cause remains unverified.

## Classification

**INCONCLUSIVE for cause and confirmed defect attribution**, despite an owner-reported failed user workflow. The historical separate Codex M-02 PASS is preserved.

## Missing evidence

Original browser request/response/HAR/console trace, effective API origin, POST creation/cancellation/block reason, CORS headers, screenshot binary, request ID and fixture hashes.

**No further test submission occurred in this initial QA session.**

---
## Review correction — functional result versus diagnosis

**Observed functional outcome: FAIL (owner-reported historical Browser Use workflow).** Both synthetic PDFs were uploaded, Cloud selected, one Merge submitted at approximately **2026-10-12 05:31:13 UTC**; error shown approximately **05:31:46 UTC**, and **no downloadable PDF**. This is a real reported unsuccessful user journey, independent of whether its underlying problem was in the browser or production network.

**Causal diagnosis: INCONCLUSIVE.** A Railway **OPTIONS /api/structure/merge 204** at **05:31:14.560617266 UTC** was independently corroborated; a corresponding POST was *not present in the returned 05:26–05:43 UTC HTTP rows*. **This does not establish that a POST was not created, sent, or stopped upstream of the observed logging point. Nor does HTTP 204 alone establish successful CORS preflight.**

**Original failing Browser Use run/session ID: unavailable.** **Original failing run HAR/network trace, console screenshot and screenshot bytes: unavailable.** The subsequent *read-only* Browser Use preflight run ID **2a7a6056-1ced-4b5b-a567-d552733204ef** (observed 05:54:44 UTC) is **not** the failed Merge run and must not be attributed to it.

**Remaining evidence:** the actual browser API URL and Origin; POST initiation / cancellation / blocking and error details; OPTIONS request Origin, Access-Control-Request-Method and Access-Control-Request-Headers; OPTIONS response Access-Control-Allow-Origin, Access-Control-Allow-Credentials, Access-Control-Allow-Methods and Allow-Headers; Axios original network exception; API proxy/edge request IDs or logs and UTC correlations. See FINDINGS.md. No new Merge was submitted during this PR correction.
