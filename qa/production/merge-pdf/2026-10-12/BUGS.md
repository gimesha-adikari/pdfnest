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
