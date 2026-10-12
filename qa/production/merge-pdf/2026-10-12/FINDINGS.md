# Production QA findings — source, observation, hypothesis

## F-01: Unsuccessful historical Cloud Merge; causal status INCONCLUSIVE

**Owner-reported observation:** separate Browser Use cloud-browser attempt on 2026-10-12 uploaded two small synthetic PDFs, selected Cloud, submitted ~05:31:13 UTC, displayed **“PDFNest processing service is currently unavailable.”** ~05:31:46, and produced **no download**.

**Independently rechecked:** Railway HTTP events show OPTIONS `api.platenpdf.com/api/structure/merge` **204** at 05:31:14.560617266 UTC but **no POST in returned 05:26–05:43 UTC records**. Earlier session/health GETs were HTTP 200. Active production Vercel and all five Railway services were healthy. No correlated Vercel function error found.

Neither a 204 preflight nor an absent Railway POST log proves the POST was (or was not) initiated by the browser. Do **not** classify this as a proven backend merge handler defect.

## F-02: Frontend source explains the exact error wording

Source files fetched **at the active Vercel production SHA `0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b`**, not merely at the latest preview/main:

- [lib/api.ts](https://github.com/gimesha-adikari/pdfnest/blob/0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b/lib/api.ts): on an Axios error **without `error.response`**, `handleAxiosError` marks backend health offline and throws `PDFNest processing service is currently unavailable.` with `status=0`. Uses Axios multipart POST with credentials. API origin is `NEXT_PUBLIC_API_URL` if configured, else `https://api.platenpdf.com`.
- [lib/execution/CloudExecutor.ts](https://github.com/gimesha-adikari/pdfnest/blob/0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b/lib/execution/CloudExecutor.ts): Merge is routed to `/api/structure/merge`.
- [lib/errorHandler.ts](https://github.com/gimesha-adikari/pdfnest/blob/0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b/lib/errorHandler.ts): network-like errors may be displayed as a friendlier service-unavailable message.

**Inference only:** transport/response-access interruption is plausible. Actual browser Axios stack/error code, CORS headers, request initiation, effective production API override, proxy path and request ID were **not observed**. Browser behavior, CORS, proxy rejection and upstream transport remain competing hypotheses.

## F-03: Healthy services do not prove request-specific correctness

READY Vercel, healthy Railway replicas, and `GET /api/health 200` establish broader environment availability, not Merge POST success. Vercel page-render functions are distinct from browser-direct API requests.

## F-04: Browser Use interfaces exposed but full E2E not retested

A new Browser Use run successfully navigated Merge PDF, inspected the multiple-file input and request events, and captured a screenshot. Upload/download methods were discoverable but **not exercised**. The empty-file initial screen did not display a mode selector; [MergePdfWorkspace.tsx](https://github.com/gimesha-adikari/pdfnest/blob/0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b/components/tools/MergePdfWorkspace.tsx) renders mode selection only with files. Do not infer the Cloud option is absent.

## F-05: Historical Codex PASS data and original full matrix not available

The owner reports Codex M-01/M-02 passed with PDF verification. Those outcomes are preserved and not overwritten; underlying artifacts cannot be independently reviewed from this session. The exact M-01–M-20 plan is not present in the retrieved project files or repository; inventing case definitions is prohibited.

## Next steps — only after review

1. Retrieve historical Browser Use console/network/HAR and sanitized CORS preflight headers; identify whether POST was created, blocked, canceled, or sent.
2. Confirm browser-resolved production API origin, routing and available proxy/edge record correlation.
3. Recover original test plan and M-01/M-02 downloaded PDFs, SHA-256, page manifests and log evidence.
4. With approval, perform **one** instrumented small synthetic Cloud Merge and independently inspect downloaded bytes, page count/order/content/orientations/hash, with complete per-case Vercel/Railway before/during/after checks.

No fix or production change is included.

---
## Review #5487101320 — prioritized read-only transport investigation

The objective is **evidence collection**, not an assumed implementation fix. Future work must be separately authorized and performed in **Codex integrated Computer Use**, not the third-party Browser Use plugin.

1. **Original trace identity:** recover the exact failed October 12 Browser Use run/session ID, network HAR, screenshots and console. The only recovered run ID is from the *later unrelated read-only preflight* (2a7a6056-1ced-4b5b-a567-d552733204ef); never relabel that as the failed run.
2. **Effective browser API origin:** observe the full actual Merge request URL, page Origin, scheme/hostname and the public API URL override if safely observable. The source-code fallback to api.platenpdf.com does not prove the browser used that origin.
3. **Browser POST behavior:** look for requestWillBeSent, loadingFailed, blockedReason, canceled flag, browser abort/timeout, HTTP response metadata or network status. Separate a browser-side never-dispatched request from proxy rejection and a request that reached a handler.
4. **Preflight and credentials:** review OPTIONS Origin and Access-Control-Request-Method/Headers; inspect Access-Control-Allow-Origin (specific allowed origin, not a wildcard for credentialed requests), Allow-Credentials, Allow-Methods, Allow-Headers and redirects. An OPTIONS 204 status is **not sufficient** to establish CORS success.
5. **Axios specifics:** inspect native error code, stack, whether error.response existed, and console/telemetry without saving credentials or personal data. The rendered unavailable message can be a transport fallback rather than a literal service outage.
6. **Edge/proxy correlation:** request/trace ID, timestamps, API host, Railway HTTP/network-flow records and available edge/CDN logs. State log visibility/retention limits; no direct API uploads.
7. **Outcome reporting:** historical Browser Use functional attempt **FAIL (owner-reported)**; causal attribution **INCONCLUSIVE**. Do not assign a code defect without matching evidence.

No new test submission is needed to perform this first retrieval pass. The original authoritative M-01–M-20 plan remains required for case-specific continuation.
