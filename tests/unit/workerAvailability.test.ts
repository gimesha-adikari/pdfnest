import assert from "node:assert/strict";

import { isToolExecutable, requiredWorkerCapability } from "@/lib/health/workerAvailability";

const noCapabilities = null;

assert.equal(requiredWorkerCapability("merge-pdf"), null, "Device-capable tools do not require Worker readiness");
assert.equal(requiredWorkerCapability("grayscale"), null, "Backend-only tools with no Worker dependency remain independent");
assert.equal(requiredWorkerCapability("pdf-to-word"), "pdf_to_office");
assert.equal(requiredWorkerCapability("ocr-extract"), "ocr");
assert.equal(requiredWorkerCapability("image-to-searchable-pdf"), "ocr");
assert.equal(requiredWorkerCapability("pdf-to-markdown-v2"), "ocr");
assert.equal(requiredWorkerCapability("highlight-pdf-v2"), "ocr");
assert.equal(requiredWorkerCapability("edit-pdf"), "document_processing");
assert.equal(requiredWorkerCapability("redact-pdf"), "document_processing");

assert.equal(isToolExecutable({ toolId: "merge-pdf", toolPolicy: "CLIENT_PREFERRED", backendAvailable: false, workerCapabilities: noCapabilities }), true);
assert.equal(isToolExecutable({ toolId: "grayscale", toolPolicy: "BACKEND_ONLY", backendAvailable: true, workerCapabilities: noCapabilities }), true);
assert.equal(isToolExecutable({ toolId: "pdf-to-word", toolPolicy: "BACKEND_ONLY", backendAvailable: true, workerCapabilities: noCapabilities }), false);
assert.equal(isToolExecutable({ toolId: "pdf-to-word", toolPolicy: "BACKEND_ONLY", backendAvailable: true, workerCapabilities: { document_processing: true, ocr: false, office_to_pdf: true, pdf_to_office: true } }), true);
assert.equal(isToolExecutable({ toolId: "ocr-extract", toolPolicy: "BACKEND_ONLY", backendAvailable: true, workerCapabilities: { document_processing: true, ocr: false, office_to_pdf: true, pdf_to_office: true } }), false);
assert.equal(isToolExecutable({ toolId: "ocr-extract", toolPolicy: "BACKEND_ONLY", backendAvailable: true, workerCapabilities: { document_processing: true, ocr: true, office_to_pdf: false, pdf_to_office: false } }), true);

console.log("Device, Backend-only, Worker-dependent, offline, and recovered capability gates passed. ✓");
