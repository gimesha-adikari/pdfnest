# Isolated Phase 5 browser acceptance

These tests use the actual local Platen frontend, Go API, Python worker, queue,
storage, verified preview and both UI download controls. They do not attach to
Personal Chrome or use browser storage state from another session. They are
explicitly opt-in and must never target production.

Use the existing application services at `http://localhost:3000` and API at
`http://localhost:8080`, with **test-local only** flags:

- Frontend process: `NEXT_PUBLIC_VERIFIED_WORD_SELECTION=true`
- Worker process: `ENABLE_CANDIDATE_WORD_SELECTION=true`
- Qualified worker render environment: `ENABLE_PERSISTENT_RENDER_POOL=false`

Ordinary production defaults remain off. Keep dedicated local test credentials
in the existing git-ignored `.env.test.local` (`E2E_TEST_EMAIL`,
`E2E_TEST_PASSWORD`) or environment. No personal account/profile fallback exists.
Only those two credential variables are loaded from that file. No credentials,
session state, PDFs, screenshots or generated evidence belong in Git.

## Run

From the frontend checkout, using the existing worker virtual environment:

```sh
# Choose an absolute private directory outside every Git checkout.
export PLATEN_PHASE5_EVIDENCE_DIR=/tmp/platen-phase5-browser-acceptance
mkdir -p "$PLATEN_PHASE5_EVIDENCE_DIR/tooling"
npm install --prefix "$PLATEN_PHASE5_EVIDENCE_DIR/tooling" \
  --no-save --package-lock=false axe-core@4.11.0
export PLATEN_PHASE5_AXE_PATH="$PLATEN_PHASE5_EVIDENCE_DIR/tooling/node_modules/axe-core/axe.min.js"
export PLATEN_PHASE5_BROWSER_ACCEPTANCE=1
export STUDIO_TEST_PYTHON="$PWD/../pdfnest-worker/.venv/bin/python"
"$STUDIO_TEST_PYTHON" tests/qualification/phase5_pdf_browser_tools.py \
  fixtures "$PLATEN_PHASE5_EVIDENCE_DIR/fixtures"
npx playwright test --config tests/qualification/phase5.playwright.config.ts
```

The project already provides Playwright. If its independent Chromium is absent,
use the project's supported `npx playwright install chromium`; do not select a
personal/system Chrome channel. The dedicated config launches full bundled
Chromium headless with `chromiumSandbox: true`, ephemeral profiles, one worker,
no retries, and no automatic video/trace. It does not add web-security disabling
flags. External page requests are blocked in the test context. Clipboard
read/write permissions are scoped to that isolated context.

The default development job Redis is `redis://127.0.0.1:6381/0`; override
`PLATEN_PHASE5_JOB_REDIS_URL` if the local stack uses another endpoint. The mask
helper reads exactly the completed extraction job whose ID and owned source
were already captured by the authenticated browser. It never enumerates,
rewrites or fabricates baselines. This preserves Python numeric serialization
when validating the opaque baseline digest; Go/JS transport may serialize
`1.0` as `1`. Numerical layout and source/baseline identity must still match.

## Evidence and limits

Each positive case freezes a source-derived mask before Prepare, checks the
actual UI compile operation against that declaration, selects a candidate-derived
whole-word region, uses genuine Ctrl+C and Ctrl+V into a newly created **empty**
task field, and independently reads the browser clipboard. The field is never
programmatically populated. Pointer and keyboard copies must equal exact Unicode.
No clipboard write or synthetic copy/paste event is used.

A read-only fetch audit hashes the actual File passed by the app to its preview
session upload; it does not replace fetch/body or modify the PDF. The existing
owned download endpoint supplies the plaintext worker artifact (local storage
is encrypted at rest). Both actual UI download controls and repeated Download
File are then exercised. All hashes must agree.

qpdf/Poppler checks use byte-identical private temporary copies because the host
may forbid those binaries from opening hidden cache paths. No confinement policy
is changed. MuPDF/Poppler comparisons use the predeclared mask, channel threshold
>2 and the established one-raster-cell band at 72/144/288 DPI. Control pages,
neighbor records, page geometry, annotations and original image streams are
checked. Generated files remain private.

Unsupported control-page font regions must remain image-only. Scoped axe and
Chromium accessibility-tree checks cover the implemented word controls; they do
not certify full PDF accessibility or replace manual assistive-technology review.
Partial-word and phrase selection remain unsupported.

Negative tests use actual extracted word IDs. If OCR cannot expose the exact
intended target, the case is explicitly skipped as an extraction limitation;
that is not a submitted browser compiler refusal or a pass. The stale-baseline
control forwards a genuine earlier extraction digest while preserving the real
current word ID/text and all server-held baselines. The delayed-response control
holds the actual successful HTTP response without fabricating its payload.

Human Sinhala/Tamil linguistic review is separate and is never supplied by these
tests. A green browser suite does not establish language-wide or overall Phase 5
acceptance while those approvals remain pending.
