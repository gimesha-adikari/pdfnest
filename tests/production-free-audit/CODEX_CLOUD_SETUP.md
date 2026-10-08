# Codex Cloud setup — Platen GIM-32

## Scope and state

- Task tracker: [GIM-32](https://linear.app/gimesha/issue/GIM-32/build-exhaustive-production-tool-acceptance-inventory-and-safe-real)
- Frontend repository: `gimesha-adikari/pdfnest`
- Checkout this branch: `test/gim-32-production-free-mode-audit`
- Backend reference: `gimesha-adikari/pdfnest-backend` at `296838852195f96ca5590b3466a33ec5ae3e39d9`
- Frontend production reference: `0f4323f5bd95263b6cb8fcd97e017e75e10c3b4b`
- The repository branch is prepared; a Codex Cloud **published environment is not created by this commit**.
- This is setup/review preparation **only**. No live processing, real user test, payment test, or production mutation is authorized.

## Create the Cloud environment in Codex

1. Create a private Codex Cloud environment with GitHub access to `gimesha-adikari/pdfnest`. If supported, also attach the backend for code reading only.
2. Select the **audit branch**, not `main`, when starting the task. Confirm HEAD matches the branch shown on GitHub.
3. Use Node.js **22** (same major version as frontend GitHub CI). Use the install command below in the Cloud install/setup phase, and do not let setup execute Playwright suites or make requests to production:
   ```bash
   npm install --no-save --package-lock=false --no-audit --no-fund
   npx playwright install chrome
   ```
   `npm ci` is **not** presently reliable in a clean Node/npm environment because the existing lockfile was observed missing entries for `@emnapi/core` and `@emnapi/runtime`. Do not silently rewrite or commit the lockfile; treat dependency reproducibility as a separate finding.
4. Existing `playwright.config.ts` selects the `chrome` channel (not the Playwright `chromium` channel); the Google Chrome browser must be installed or the config must be deliberately adjusted in a separate reviewed change.
5. For this preparation task keep agent outbound internet **off** except necessary dependency installation permitted during setup. Do **not** configure `PLATEN_PRODUCTION_AUDIT` or `E2E_BASE_URL`. Do not add production account credentials.
6. For an eventual separate, explicitly approved production run, grant only required destinations using Codex Cloud's restricted networking: `platenpdf.com` and `api.platenpdf.com`, plus any proven essential first-party download/storage redirect hosts. Validate that browser CORS/cookies and access policies permit the runner. Do not open unrestricted egress by default.
7. Test credentials, if ever needed, must be **dedicated, disposable, and explicitly authorized**, supplied through scoped secret facilities rather than committed files, prompts, environment setup logs, or screenshots. Verify the selected secret approach works in the *agent* phase, not just installation.
8. Cloud task output must be a source/coverage report and proposed PR only; **no auto-merge, deployment, Railway variable changes, purchase attempts, or cleanup of production data**.

## Review blockers before real tests

- Manifest has **44 bundled public fallback routes**, not the reconciled live CMS/public directory; this is a provisional denominator.
- Only **two guest pilot workflows** are currently scaffolded (Word→PDF and Merge PDF), and neither has been accepted as production passing evidence.
- Inputs are incomplete for full coverage: real scanned/OCR, XLSX/PPTX, encrypted PDF, large/multi-page variants, structured-document and repository analysis fixtures need separate safe generation and expected-output assertions.
- Existing paid and new free account tests are blocked until authorized disposable identities and a trustworthy before/after billing-ledger method exist.
- `PDF Studio` is a composite UI: each supported action and execution path needs scenario-level coverage, not one checkbox for the landing route.
- Cloud-only/async/OCR needs completed job and output validation, cancellation, ownership and reservation/finalization evidence. Historical OCR finalization gap remains open.
- The guest merge pilot uses automatic execution selection. It **does not prove** client execution or justify `NOT_APPLICABLE` billing without a recorded execution venue. Resolve this before counting any PASS.
- Production session policy is currently expected to be `mode=free`; the pilot must fail safely if it observes any other policy.
- The repo has a normal GitHub CI pipeline for `main` and PRs; merely creating the audit branch does not run those checks.
- A normal Playwright test invocation is intentionally not enough to touch production: the pilot requires *both* exact `E2E_BASE_URL=https://platenpdf.com` and exact `PLATEN_PRODUCTION_AUDIT=RUN_REAL_PRODUCTION_TESTS`. **Do not set them in Cloud setup**.

## Preparation-task acceptance

At the end of the preparation-only Codex Cloud task, report:
- GitHub repository and branch HEAD, Cloud runtime and browser/dependency setup;
- catalog discrepancy list, identified real routes and proposed per-tool test adapters;
- fixtures still missing and which cases require authenticated access;
- any static code issues or safe patches as a draft PR;
- no real production processing initiated, no payment request, and no environment/deployment mutation.

Stop and ask for a separate explicit approval before enabling real-production execution.
