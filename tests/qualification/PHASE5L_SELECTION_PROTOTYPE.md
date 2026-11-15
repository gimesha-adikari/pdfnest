# Candidate-derived whole-word selection prototype

This code is an isolated, unintegrated prototype. `CandidateWordSelection` is not imported by `EditPdfWorkspace`, and no application route serves the prototype. It must not be advertised as a production viewer.

The worker `inspect_candidate_selection` operation reads the candidate PDF and binds its result to SHA-256. For raster script words, it requires an exact embedded Noto font identity, derives the Unicode from the PDF's text trace, independently shapes that Unicode, and requires byte-for-byte image equivalence with a unique visible image occurrence. Clean opaque scan patches must equal the complete independently shaped word on white, byte for byte; actual ink location defines the word rectangle. It never uses an editing operation or draft string. Native support is limited to visible, unoccluded Base14/WinAnsi ASCII words with matching glyph IDs. Rotation/crop, arbitrary OCR, complex fonts and character-level selection are unsupported.

The frontend validates artifact identity, word geometry, overlap and the optional semantics version. Selection is an explicit whole-word region. It does not stretch a word string to imitate character positions. A genuine browser click or keyboard Enter creates a browser selection range, and Ctrl+C may use the normal system clipboard. No copy event is synthesized. The handoff page contains an initially empty textarea for a genuine Ctrl+C / Ctrl+V readback; it never pre-fills that field.

## Reproduce independent PDF tests

From the worker checkout, with the qualified environment:

```sh
PYTHONPATH=. .venv/bin/python tests/qualification/phase5l_candidate_verification.py --output /tmp/platen-phase5l-verification
```

The command generates private synthetic PDFs, fixed pre-compilation masks, candidate-derived semantics, page images and a result JSON outside Git. Keep all generated files private.

## Build local browser handoff

From the frontend checkout:

```sh
npx tsx tests/qualification/buildCandidateSelectionProbe.mts \
  /tmp/platen-phase5l-verification/sinhala-joiner/candidate.pdf \
  /tmp/platen-phase5l-verification/sinhala-joiner/selection.json \
  /tmp/platen-phase5l-verification/sinhala-joiner/page.png \
  /tmp/platen-phase5l-browser-probe
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/platen-phase5l-browser-probe
```

Open the loopback URL in the already authorized Personal Chrome session. Enable whole-word selection, click the actual mapped word, press Ctrl+C, focus the empty paste textarea, press Ctrl+V and inspect the exact code points. Repeat for Tamil and searchable scans. Browser permissions must be granted manually. Do not treat DOM `getSelection()` or mounted tests as clipboard proof.

## Integration gate

No production integration was made because actual browser selection/copy, full application lifecycle and accessibility tests could not run while Personal Chrome was absent. The existing verified image preview remains the application behavior. Human Sinhala and Tamil review is also pending. See the Phase 5L closure documentation for the exact support matrix and required signoffs.
