import assert from "node:assert/strict";
import {
    getInitialProcessingMode,
    getPdfInputPreparation,
    hasCloudPreparedInput,
    markPdfInputPreparation,
    setTransientOriginalPassword,
} from "@/lib/security/pdfInputPreparation";

function createFile(name: string): File {
    return new File([`%PDF-1.7\n${name}`], name, { type: "application/pdf" });
}

const plain = createFile("plain.pdf");
markPdfInputPreparation(plain, {
    sourceProtected: false,
    bytesState: "plain",
    preparedOn: "none",
    processingMode: "auto",
    cloudTransmissionOccurred: false,
});
assert.equal(getInitialProcessingMode(plain), "auto");
assert.equal(hasCloudPreparedInput(plain), false);

const devicePrepared = createFile("device-prepared.pdf");
setTransientOriginalPassword(devicePrepared, "synthetic-device-password");
markPdfInputPreparation(devicePrepared, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "device",
    cloudTransmissionOccurred: false,
});
assert.equal(getInitialProcessingMode(devicePrepared), "device");
assert.equal(getPdfInputPreparation(devicePrepared)?.bytesState, "decrypted");
assert.equal(hasCloudPreparedInput(devicePrepared), false);
assert.equal(
    Object.prototype.propertyIsEnumerable.call(devicePrepared, "originalPassword"),
    false,
    "password metadata must not be enumerable for accidental object logging"
);

const cloudPrepared = createFile("cloud-prepared.pdf");
setTransientOriginalPassword(cloudPrepared, "synthetic-cloud-password");
markPdfInputPreparation(cloudPrepared, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "cloud",
    processingMode: "cloud",
    cloudTransmissionOccurred: true,
});
assert.equal(getInitialProcessingMode(cloudPrepared), "cloud");
assert.equal(hasCloudPreparedInput(cloudPrepared), true);

const passwordOnly = createFile("password-property-is-not-provenance.pdf") as File & {
    originalPassword?: string;
};
passwordOnly.originalPassword = "synthetic-only-password-property";
assert.equal(
    hasCloudPreparedInput(passwordOnly),
    false,
    "originalPassword alone must not be treated as evidence that bytes were uploaded"
);

const batch = createFile("batch-base.pdf") as File & { initialBatch?: File[] };
batch.initialBatch = [plain, cloudPrepared];
assert.equal(hasCloudPreparedInput(batch), true, "batch provenance must inspect every input");

console.log("PASS: transient PDF preparation mode, protection state, password scoping, and Cloud provenance");
