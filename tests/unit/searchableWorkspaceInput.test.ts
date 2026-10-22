import assert from "node:assert/strict";
import fs from "node:fs";
import { getPdfInputPreparation, markPdfInputPreparation, requiresCloudProcessingAuthorization, authorizeCloudProcessing, isCloudProcessingAuthorized } from "@/lib/security/pdfInputPreparation";
import { getProtectedPdfRoutePolicy } from "@/lib/security/protectedPdfRoutePolicy";

// The workspace must use the same inspected acceptance boundary as the landing
// uploader. File.type/extension alone must never mint preparation evidence.
const source = fs.readFileSync("components/tools/SearchablePdfV2Workspace.tsx", "utf8");
assert.ok(/<PdfUploader\b/.test(source), "direct selection must pass through PdfUploader inspection");
assert.doesNotMatch(source, /<input[^>]*type="file"/, "no uninspected alternate file picker");
assert.match(source, /protectedFileHandling="fail-closed"/);
assert.doesNotMatch(source, /bypassEncryptionCheck/);

const image = new File(["image fixture"], "same.png", { type: "image/png", lastModified: 1 });
assert.equal(requiresCloudProcessingAuthorization(image), true, "raw selections remain unverified");
markPdfInputPreparation(image, { sourceProtected: false, bytesState: "plain", preparedOn: "none", processingMode: "auto", cloudSubmissionInitiated: false });
assert.equal(requiresCloudProcessingAuthorization(image), false, "inspected accepted input can enter workspace");
authorizeCloudProcessing(image, "searchable-pdf-v2");
const replacement = new File(["other fixture"], "same.png", { type: "image/png", lastModified: 1 });
assert.equal(getPdfInputPreparation(replacement), undefined, "new File must not inherit preparation by filename");
assert.equal(isCloudProcessingAuthorized(replacement, "searchable-pdf-v2"), false);
assert.equal(requiresCloudProcessingAuthorization(replacement), true);
const protectedInput = new File(["%PDF-synthetic"], "protected.pdf", { type: "application/pdf" });
markPdfInputPreparation(protectedInput, { sourceProtected: true, bytesState: "encrypted", preparedOn: "none", processingMode: "auto", cloudSubmissionInitiated: false });
assert.equal(getProtectedPdfRoutePolicy("searchable-pdf-v2"), "unqualified");
assert.equal(requiresCloudProcessingAuthorization(protectedInput), true, "protected source still blocked");
console.log("PASS: Searchable workspace inspection, exact identity, replacement and protected input contracts");
