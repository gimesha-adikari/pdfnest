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
