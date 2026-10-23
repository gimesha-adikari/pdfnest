# M1-S2-25R-P12 — Universal Markdown Image-Resource Policy Qualification

## Outcome and acceptance boundary

COMPLETE for local implementation and qualification. Publication and production qualification remain prohibited. This report is implementation evidence, not independent source acceptance. The P12 branch has no matching Vercel deployment exclusion and must remain unpublished.

## Verified starting identity and preservation

- Frontend main and implementation parent: `29dbf5d3d2ec218581429ddf8e50bcc82cc76e00`.
- Frontend baseline tree: `2e2bd376accc9c8128943756759a7f20b90de396`.
- Backend remote master: `eb90ab778b06c0bdcfe9ca0d506402f8c0e18742`; no backend changes or tests were made under P12.
- Dedicated worktree: `/home/gimesha/My_Projects/platen-worktrees/m1-s2-25r-p12-universal-markdown-policy`.
- Local branch: `codex/m1-s2-25r-p12-universal-markdown-policy`.
- This worktree began clean. The production commit was fetched by read-only HTTPS and used as the worktree base. No primary checkout was switched, reset, rebased or cleaned.
- Primary frontend remains at `0f6fa13361778917afbeeef19e977f7bd8002944`, branch `milestone-1/privacy-protected-artifacts`, with its preexisting `AGENTS.md` modification. Primary backend HEAD/branch/status also match the recorded preflight. The original AGENTS file was never written by this task; its initial byte hash was not recorded, so preservation is supported by the no-write operation history and unchanged status, not a claimed pre/post byte-hash comparison.
- Exact final commit, parent, tree and committed file/blob identities are recorded in the external evidence package, avoiding a self-referential commit ID in this committed report.

The P11 investigation and independent acceptance at docs commit `b748ed4d7a64fff38fa4b7850822584122c6f1d3` were read before editing. Applicable AGENTS instructions were read. Graph-tool discovery exposed no callable graph project/search/index/coverage tools, so bounded direct reads and immutable Git objects were used; no graph completeness claim is made.

## Root cause and architecture

Before P12, the client renderer intentionally substituted `[Image: ...]` for nonembedded resources. Ordinary Markdown image tokens, including permitted embedded images, often entered that same inline placeholder path. Auto could therefore produce a current local PDF where Cloud rejected the document. P5 correctly displayed persistent failures when an error actually occurred; local placeholder success did not raise one.

The new `lib/execution/document/markdownPolicy.ts` prepares a Marked token tree and recursively visits actual parsed image and HTML nodes. It does not scan raw source for URL-like strings. Resource admission runs in `ExecutionManager.run` before feature flags, venue selection, safety gates or fallback, and again at the direct Markdown client entry. Successful preparation is cached by immutable File identity, so ordinary Manager-to-Client execution does not repeat source reads or image validation. Failed and in-flight preparation is not cached. New conversion generations still enforce their own AbortSignal and P5 result identity.

Only exact canonical base64 PNG/JPEG destinations are admitted. Raw HTML is rejected except complete comments, matching the backend's unsupported-HTML rendering contract. No DOM, browser resource element, external fetch or referenced-file read is used for images. Permitted bytes are embedded through pdf-lib.

The typed `ExecutionError` code `MARKDOWN_RESOURCE_FORBIDDEN` is terminal in Auto and Device. It is also thrown before an explicit Cloud request can upload a forbidden document. The defensive Auto fallback exclusion handles a policy error raised later by ClientExecutor. Genuine non-policy Unicode/font fallback, safety routing, cancellation and existing flag behavior remain. The workspace adds only trusted `instanceof ExecutionError` recognition to the P5 failure normalizer; it does not trust arbitrary top-level error-code objects. Existing wrapped backend HTTP400 policy handling remains independently tested.

## Resource-policy matrix

| Input form | Auto / Device / Cloud admission | Direct client |
|---|---|---|
| Relative, parent-relative, absolute filesystem, file URL | Terminal policy rejection before routing | Terminal policy rejection |
| HTTP, HTTPS, protocol-relative, FTP/other scheme | Terminal policy rejection before routing | Terminal policy rejection |
| Exact valid base64 PNG/JPEG | Admit; existing venue routing applies | Embed actual image |
| SVG, GIF, JPG MIME alias, mismatched format, invalid base64/bytes | Terminal policy rejection | Terminal policy rejection |
| Full/collapsed/shortcut reference images and nested images | Validate resolved parsed image destination | Same validator |
| Raw HTML image or other active HTML | Reject; no HTML rendering feature | Reject |
| Complete HTML comments | Inert/omitted | Inert/omitted |
| Ordinary links, escaped image text, inline/fenced code | Preserve as non-resource content | Preserve as non-resource content |
| Unresolved references / malformed syntax parsed as text | Remain inert text | Remain inert text |
| Resource/count/pixel/source cap exceeded | Terminal policy rejection | Terminal policy rejection |

All aliases already dispatched to the Markdown client receive direct entry validation. No image placeholder success remains.

## Execution matrix and deliberate nonchanges

| Route | Valid admitted input | Forbidden input |
|---|---|---|
| Auto eligible | Client | Reject before routing |
| Auto flag disabled / client unavailable / safety ineligible | Existing Cloud route | Reject before Cloud |
| Auto client unsupported font/operation | Existing single Cloud fallback | Policy evaluated first; no reversal |
| Device eligible | Client | Reject before routing |
| Device flag disabled | Existing conditional Cloud route, unchanged | Reject before Cloud |
| Device safety ineligible | Existing SAFETY_REJECTION | Reject resource policy first |
| Explicit Cloud | Existing Cloud request after local admission | Reject before HTTP |
| Canceled / obsolete generation | No eligible publication | No eligible publication |
| Backend HTTP400 policy response | Existing wrapped Cloud failure / safe persistent policy copy | No success result |

Cross-upload mode persistence and the shared Device-to-Cloud feature-flag behavior were not changed. Remove/reupload can remount a workspace and return mode to Auto. These remain separate product/privacy decisions. P12 is venue-independent and does not depend on changing them.

## Validation, limits and codec choices

Limits match the backend's admitted input budgets: 2 MiB source before File.text, 32 image occurrences, 1 MiB base64 per image, 768 KiB decoded bytes, 4096 per axis, 4 million pixels per image and 16 million aggregate pixels. Base64 padding/alphabet/roundtrip, actual format and dimensions are checked before expensive decoding. The decoded cap is also implied by the encoded cap at the 3:4 ratio; both are explicit. Repeated references count against occurrence and aggregate pixel budgets even when their validated byte buffer is reused.

PNG checks cover signature, chunk boundaries/order/CRC, critical chunk fields, palettes/transparency, expected scanline byte counts, filters and indexed palette references including Adam7. Ancillary metadata/animation chunks are discarded and only the static default image is embedded. Native `DecompressionStream("deflate")` is fed in 256-byte chunks and output is bounded before copying. Its documented contract rejects incomplete streams, bad checksums and trailing input; the local runtime counterexample test proves trailing-junk rejection. See the [Compression Standard](https://compression.spec.whatwg.org/#supported-formats). pdf-lib then performs full raster decoding of the filtered static PNG.

JPEG envelope checks bound dimensions before allocation and check marker lengths, frames/components, quantization/Huffman identifiers and tables, scan parameters/restarts and exact EOI. A full raster decode uses new pinned `jpeg-js@0.4.4` with `tolerantDecoding:false`, `maxResolutionInMP:4`, `maxMemoryUsageInMB:64`. This narrow dependency is a disclosed implementation addition requiring independent review. PDF.js was evaluated first but repaired early EOI into a full-sized raster, violating the intended rejection contract. The package has no runtime dependency or install script. Lockfile integrity is pinned; BSD and decoder Apache-2.0 notices are included in `licenses/jpeg-js-LICENSE`. No dependency/system installation or configuration in the primary checkout was changed. Public package bytes were downloaded into a task-owned external runtime directory, verified against package integrity, and exposed only to the isolated worktree.

No codec is claimed formally verified. Native decompression and synchronous JPEG/pdf-lib parsing can allocate internal buffers and cannot be forcibly interrupted mid-call. Boundary checks and finite input/pixel budgets constrain the work; cancellation is checked before/after awaits and between stages. The whole application heap is not capped at the decoder's 64 MiB setting. Frontend PDF generation does not add a new 32 MiB output cap; that backend contract remains unchanged.

PNG validation requires the standard DecompressionStream API. If unavailable, conversion fails closed with UNSUPPORTED_CLIENT_OP before routing, including Cloud preflight; it does not silently relax validation. Target browser execution remains a separately authorized qualification step.

## Rendering and compatibility

Ordinary Markdown PNG/JPEG image syntax now reaches actual PDF image embedding. Text runs are flushed in source order around centered image blocks; images are not laid out on the text baseline. Scale is bounded by available content width/page height, with a 280-point normal-image height maximum and an 80-point table-image maximum. Lists/quotes pass their narrower content widths. Image tables size rows before drawing and reject impossible widths or rows rather than emitting negative dimensions or overflowing a page. Ordinary text-only table rendering is retained.

Tests assert PDF image XObjects and PDF.js-rendered red/blue pixels, text/image geometric ordering, Letter dimensions, margins, multi-page nested images and preserved final text. Progressive JPEG and interlaced PNG fixtures are admitted. The external evidence includes a synthetic one-page PDF, extracted text, Poppler metadata and a rendered PNG inspected visually: real red/blue rectangles, ordered surrounding text and table content are visible. Existing list-marker vertical offset and quote-bar pagination behavior are inherited renderer details; no unrelated typography rewrite was performed.

Compatibility intentionally changes: forbidden image placeholders become terminal errors in every mode; raw HTML and the old JPG alias are rejected; oversized documents previously eligible for local rendering can now fail earlier. Marked GFM tables/tasks/strikethrough and Goldmark defaults are not identical parsers. Marked entity/escape normalization can differ; encoded variants of an otherwise permitted data prefix are conservatively rejected, while the backend can normalize some of them. Inert comments/malformed syntax can also be tokenized differently. This is a conservative common resource contract, not a claim of byte-for-byte parser/rendering equivalence. No broad HTML parser or backend change was introduced.

## P5 ownership and feedback preservation

Only the trusted local-error recognition branch changes in the workspace. Attempt keys, generation counters, AbortController cleanup, blob/filename identity, preview ownership, shared-download invalidation and delayed-authentication revalidation remain unchanged. Current policy rejection clears output and disables Save; late or canceled work cannot restore it. New file/options/mode invalidate old attempts. Current valid replacement clears persistent failure. Missing notification handlers and toast expiration do not remove the inline explanation. Policy feedback uses static copy and adds no billing guidance.

## Qualification actually executed

All execution HTTP boundaries were mocked, with loopback-only dummy application/API URLs for command runs. No production conversions or browser tests were run.

| Command/check | Actual outcome |
|---|---|
| Baseline `npm run test:unit` | Exit 0; 103/103 files |
| New contract before implementation | Exit 1; 7 passed / 43 failed / 0 skipped; expected placeholder/policy and missing-raster failures |
| `npx tsx tests/unit/markdownUniversalPolicy.test.ts` final | Exit 0; 60 passed / 0 failed / 0 skipped |
| `npx tsx tests/unit/markdownExecution.test.ts` | Exit 0; 12/12 |
| Mounted persistent-feedback suite | 37/37, 0 skipped; included in final full unit run |
| Original result-ownership suite | 26/26; all original assertions retained |
| API error-classification suite | 18/18; all HTTP mocked |
| Final `npm run test:unit` | Exit 0; 104/104 test files; case counts are reported per suite, not invented as one aggregate |
| `npx tsx tests/runHybridTests.ts` | Exit 0; 13 suites, 201 reported PASS markers; no reported failed cases |
| Final sequential `npx tsc --noEmit --incremental false` | Exit 0 |
| New helper/test `npx eslint ...` | Exit 0; 0 diagnostics |
| All touched TS/TSX/MTS scoped ESLint | Exit 1; inherited 36 errors + 2 warnings |
| Baseline-vs-final ESLint comparison | Exit 0; 38 baseline / 38 final / 0 added diagnostics, matched by rule/message/source line |
| `npm run build -- --webpack` final | Exit 0; optimized build, TypeScript and static generation completed |
| `git diff --check` | Exit 0 |

The supported production build ran locally with an intentionally unusable loopback API URL; catalog fetch warnings fell back to bundled static catalog. It did not validate backend availability or managed production environment values.

Failures retained honestly: early test-harness setup needed a .ts runner rather than the .mts ESM fixture; meaningful red output is separately logged. An initial regex `s` test flag failed ES2017 TypeScript and was replaced. One intermediate PDF.js cleanup assertion used an unavailable method and was corrected to loading-task destroy. Independent malformed-image counterexamples first failed (early JPEG entropy/tRNS; JPEG lengths/palette; PNG trailing junk/negative table width), then passed after correction. One final typecheck was accidentally concurrent with Next build deleting generated type files and exited 2; the sequential after-build rerun exited 0. An initial staged whitespace check also caught whitespace copied from the upstream license; only trailing whitespace was removed, and the final staged check passed. None of these failed attempts is represented as a passing run.

Broad Playwright/browser suites, production UI, real Cloud conversions and backend Go suites were not run under this frontend-only task. No packet-level egress or OS-isolation claim is made. Existing unit security/error/billing/WASM suites are included in the 104-file run.

## Exact changed files

1. `components/tools/MarkdownToPdfWorkspace.tsx` — recognize trusted local policy errors.
2. `lib/execution/ClientExecutor.ts` — pass cancellation into Markdown renderer.
3. `lib/execution/ExecutionManager.ts` — venue-independent admission and terminal fallback exclusion.
4. `lib/execution/document/markdownClient.ts` — ordered actual image flow and bounded image table layout.
5. `lib/execution/document/markdownPolicy.ts` — parsed admission and bounded actual image validation.
6. `lib/execution/types.ts` — typed policy error code.
7. `package.json` — pin strict JPEG decoder.
8. `package-lock.json` — exact package integrity.
9. `licenses/jpeg-js-LICENSE` — license notices.
10. `tests/unit/markdownUniversalPolicy.test.ts` — real executor/codec/PDF/raster regression coverage.
11. `tests/unit/markdownExecution.test.ts` — explicitly replace old remote-placeholder expectation; assert actual raster.
12. `tests/unit/markdownPersistentFeedback.test.mts` — preserve 24 P5 Cloud cases and add 13 actual-local-policy cases.
13. `tests/unit/markdownResultOwnership.test.mts` — runtime trusted-error import in existing harness, no assertion deletion.
14. `tests/unit/apiErrorClassification.test.ts` — admitted-source fixture isolates unchanged backend HTTP contract.
15. `tests/security/milestone-1/M1-S2-25R-P12-qualification.md` — this report.

No root Vercel configuration, backend, authentication, billing, global notifications, shared download architecture, flags, safety gate, OCR or infrastructure file is changed. No prior test is deleted. Existing expectations are explicitly updated for the approved Option A contract.

## Independent review and remaining release requirements

Review the actual helper/renderer, strict codec dependency and licenses, complete patch and Git blob identities. Local evidence does not authorize publication or prove production behavior. Browser compatibility, Web API behavior, large-image responsiveness, JPEG color/orientation differences between pdf-lib and Chromium, font limitations and inherited typography remain bounded qualification concerns. A separate branch-publication safeguard and owner authorization are required before any push. No source acceptance, merge, deployment or full F-04 security qualification is declared.
