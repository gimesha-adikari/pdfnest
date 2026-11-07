# Production environment and retrospective observability — 2026-10-12

Read-only Vercel/Railway integration queries. No application or deployment mutations.

## Vercel production frontend

- Project: `pdfnest`, ID `prj_BTmyqDGmCyVWUuQNdnLZpIVO3a7N`; team `team_bexkK6dVL1MuHusCLsTaPfz3`.
- Active **production alias**: `platenpdf.com`.
- Active production deployment: **`dpl_E2G8wZGBiR3ewK3YEWpcKNA84f9A`**, READY, target `production`; SHA **`0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b`** (main).
- Creation Unix milliseconds: `1791430164729`; ready milliseconds: `1791430210823`.
- A newer generic latestDeployment had target `null`, so it was **not** mistaken for production.
- Historical production runtime logs queried **2026-10-12 05:26–05:37 UTC**: GET /merge-pdf render records at 05:27:47 and 05:29:52; no related frontend function exception in returned logs. A 24-hour runtime-error-cluster query returned no errors. **Vercel server logs do not automatically record client-to-API Cloud uploads.**

## Railway production

- Project `platen-production`: `7fc0cdb0-8a16-475a-93a5-b45a10b77b43`; environment `production`: `9188e8b5-42ff-49de-9ceb-e3955b9b2618`.
- Backend `pdfnest-backend`: deployment **`e14a6e93-cd26-4643-bb13-99dc55919723`** SUCCESS; commit **`296838852195f96ca5590b3466a33ec5ae3e39d9`** (master), deployed 2026-10-07 20:52:07Z.
- Worker `pdfnest-worker`: **`3589e87e-a110-4ab0-921f-e541cd6facd4`**, SUCCESS, SHA `9d38852e7ca1e7b657f7f644823d400553886ff0`.
- Worker `alert-benevolence`: **`078fa716-2075-4bf8-a069-24336a815872`**, SUCCESS, same worker SHA.
- Postgres `a2f3574c-ed7e-463e-8f89-a62dfd33c261` SUCCESS; Redis `f5b8ed9a-44a8-49bc-b57b-2894e9f4ed54` SUCCESS.
- **Five services online, each 1/1 running, zero crashed, zero warning/critical notifications, zero failed/crashed deployments during the status query's past 24 hours.**
- Backend 24-hour CPU: current ~0.00174, avg ~0.00207, max ~0.00387; memory: current ~0.04794 GB, avg ~0.05502 GB, max ~0.05658 GB. Aggregates cannot localize the Merge request.
- Monitoring discrepancy: `describe_environment` returned `staged:null` while `environment_status` showed old pendingWork from 2026-09-19 with no changes listed. No claim about active impact.

## Historical backend HTTP timeline (UTC)

Railway backend `get_logs` types HTTP/deploy, **2026-10-12 05:26:00–05:43:00Z**, up to 250 entries/stream.

| Time | Method and API path | Status |
|---|---|---|
| 05:27:48 | OPTIONS /api/auth/session | 204 |
| 05:27:48 | GET /api/health | 200 |
| 05:27:48 | GET /api/auth/session | 200 |
| 05:29:53 | OPTIONS /api/auth/session | 204 |
| 05:29:54 | GET /api/health | 200 |
| 05:29:54 | GET /api/auth/session | 200 |
| **05:31:14.560617266** | **OPTIONS /api/structure/merge** | **204** |

All these API request records had host `api.platenpdf.com`. **No POST /api/structure/merge row was returned in this inspected time range**. This cannot establish the POST was never attempted, that CORS succeeded, or which network/proxy layer failed.

Runtime stream also showed recurring 330–435ms slow SQL **studio/analyzer polling** around 05:38–05:39; no demonstrated link to Merge.

## Evidence gaps

Historical Browser Use HAR, full console trace, actual Cloud POST request status/blocked reason, CORS response headers, effective runtime API origin, and stable correlation/request ID were not available. This baseline is **retrospective**, not a before/during/after capture for the prior run. No historical PDF output existed for that unsuccessful attempt.
