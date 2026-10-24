# Bug triage

**Confirmed product defects with proven root cause: none.**

## Candidate QA-OBS-01 — Cloud Merge no output in historical Browser Use run

- **Classification:** **INCONCLUSIVE** for product-defect attribution. Reported functional result was unsuccessful.
- **Severity:** **Undetermined**, pending reproducibility and impact. Not automatically production-critical.
- **Environment:** production Merge PDF in separate Browser Use cloud-browser run on 2026-10-12.
- **Reproduction reported:** Upload two small synthetic PDFs → select Cloud → click Merge ~05:31:13Z.
- **Expected:** completed server merge and downloadable valid combined PDF, ordered as inputs.
- **Observed (owner report):** error **“PDFNest processing service is currently unavailable.”** ~05:31:46Z, no PDF.
- **Monitoring independently recovered:** OPTIONS `/api/structure/merge` 204 at 05:31:14.560617266Z, no POST in returned 05:26–05:43Z Railway HTTP records. Railway all services online; Vercel production READY; no matched error.
- **Source support:** in production `lib/api.ts` the short error text is constructed for an Axios failure **without a response**, which does not prove the processing service was offline.
- **Missing evidence:** original browser trace/HAR, console stack, effective API URL, POST initiating/failing network event, CORS response headers, edge proxy correlation and screenshot bytes.
- **Verdict:** Do **not** label as a confirmed backend defect or assert no POST was sent.
- **Safety:** No repeat submissions performed. Further reproduction only after independent initial PR review.

---
## Review correction — separate functional failure from root-cause diagnosis

The October 12 third-party Browser Use **user workflow reportedly FAILED**: two files uploaded, Cloud selected, one Merge clicked, unavailable message shown, no PDF downloaded. This is **not** proof of a backend Merge implementation defect. **Root cause: INCONCLUSIVE; severity undetermined.**

The Railway 05:31:14.560617266 UTC OPTIONS 204 row and missing POST *in sampled returned HTTP records* do not show whether browser dispatched, canceled or blocked the POST, whether the proxy received it before recording, or whether the browser accepted credentialed CORS headers.

Original failing Browser Use run ID, HAR and screenshot **not recovered**; the later preflight run ID (2a7a6056-1ced-4b5b-a567-d552733204ef) is unrelated. Do not overwrite historical Codex M-02 PASS. Prioritize the read-only checklist in FINDINGS.md before confirming any product defect.
