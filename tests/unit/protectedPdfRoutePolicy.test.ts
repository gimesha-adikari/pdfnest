import assert from "node:assert/strict";
import { getProtectedPdfRoutePolicy } from "@/lib/security/protectedPdfRoutePolicy";

assert.equal(getProtectedPdfRoutePolicy("rotate-pdf"), "execution-manager");
assert.equal(getProtectedPdfRoutePolicy("merge-pdf"), "execution-manager");
assert.equal(getProtectedPdfRoutePolicy("pdf-to-word"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("pdf-to-excel"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("pdf-to-powerpoint"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("grayscale-pdf"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("pdf-to-markdown"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("edit-pdf"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("redact-pdf"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("ocr-text-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("document-extraction-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("pdf-to-markdown-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("highlight-pdf-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("underline-pdf-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("strikeout-pdf-v2"), "cloud-only");
assert.equal(getProtectedPdfRoutePolicy("highlight-pdf"), "cloud-consent");
assert.equal(getProtectedPdfRoutePolicy("underline-pdf"), "cloud-consent");
assert.equal(getProtectedPdfRoutePolicy("strikeout-pdf"), "cloud-consent");
assert.equal(getProtectedPdfRoutePolicy("unlock-pdf"), "explicit-unlock");
assert.equal(getProtectedPdfRoutePolicy("studio-v2"), "studio-session-consent");
assert.equal(getProtectedPdfRoutePolicy("searchable-pdf-v2"), "unqualified");
assert.equal(getProtectedPdfRoutePolicy("image-to-searchable-pdf"), "unqualified");
assert.equal(getProtectedPdfRoutePolicy("studio"), "unqualified");
assert.equal(getProtectedPdfRoutePolicy("future-unregistered-route"), "unqualified");

console.log("PASS: protected PDF route capability is derived from qualified route metadata");
