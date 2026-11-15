# Phase 5L candidate-selection prototype test results

Verdict: **PROTOTYPE ONLY; overall Phase 5 PARTIAL.** This is a read-only candidate-derived whole-word selection implementation, not an integrated production viewer. `EditPdfWorkspace.tsx` is unchanged and does not import it. No compiler, word-edit protocol, authentication, billing, storage, download or SDK change was made.

- `npm run test:unit`: 147/147 files passed; integrated API-origin preflight 9/9.
- `npx tsc --noEmit --pretty false`: exit 0.
- `node --test scripts/preflight-local-api-origin.test.mjs`: 9/9 passed.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 node scripts/preflight-local-api-origin.mjs --dev`: passed.
- Mounted `candidateWordSelection.test.mts`: exact candidate Unicode including U+200D, keyboard whole-word selection, partial-selection suppression, no duplicate text, digest/malformed/overlapping metadata rejection, candidate replacement and stale-response fencing passed.
- Local probe bundle built successfully with the real component and candidate-derived semantics. It includes an empty field for genuine copy/paste readback and does not synthesize clipboard content.

Personal Chrome was absent. The approved launcher reported zero default Chrome processes; a manual startup/approval request received no response during execution. Actual browser pointer selection, clipboard API readback, real copy/paste, assistive-technology behavior and Platen UI download for this new viewer were NOT RUN. No new live refusal scenarios were run. Existing lifecycle/error-message tests passed but do not replace live browser evidence.

The worker candidate inspector passed 25 focused tests. Twelve newly compiled synthetic candidates passed qpdf, exact MuPDF/Poppler text/search and 144 render comparisons: two renderers × three DPIs × two pages × twelve candidates, zero unauthorized off-mask changes, pixel-identical control pages. The matching inspector derives script words from candidate PDF traces and proves byte-exact correspondence to a unique shaped image patch; arbitrary hidden OCR is never exposed.

Full worker regression: 1,611 passed, 10 skipped, 2 warnings with persistent render pool explicitly disabled in the isolated test environment. Full serial Go suite: all 45 test-bearing packages passed. An earlier Go run hit SESSION_METADATA_BUSY while a concurrent full worker suite consumed native capacity; the unchanged Go source passed when run without that competing suite.

Human Sinhala and Tamil visual approval remains pending. See the remote Phase 5L closure documentation for full gates, measured hashes and preservation evidence.
