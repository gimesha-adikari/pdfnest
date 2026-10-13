import assert from "node:assert/strict";
import {
    assertCloudProcessingAuthorized,
    authorizeCloudProcessing,
    getInitialProcessingMode,
    getPdfInputPreparation,
    hasCloudTransmissionOccurred,
    markCloudTransmissionOccurred,
    markPdfInputPreparation,
    orderPreparedPdfInputs,
    requiresCloudProcessingAuthorization,
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
assert.equal(hasCloudTransmissionOccurred(plain), false);

const cloudProcessedProtectedSource = createFile("cloud-processed-protected-source.pdf");
markPdfInputPreparation(cloudProcessedProtectedSource, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "device",
    cloudTransmissionOccurred: false,
    derivedFromProtectedInput: true,
});
markCloudTransmissionOccurred([cloudProcessedProtectedSource]);
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.processingMode, "cloud");
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.cloudTransmissionOccurred, true);
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.sourceProtected, true);
assert.equal(hasCloudTransmissionOccurred(cloudProcessedProtectedSource), true);

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
assert.equal(hasCloudTransmissionOccurred(devicePrepared), false);
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
assert.equal(hasCloudTransmissionOccurred(cloudPrepared), true);

const passwordOnly = createFile("password-property-is-not-provenance.pdf") as File & {
    originalPassword?: string;
};
passwordOnly.originalPassword = "synthetic-only-password-property";
assert.equal(
    hasCloudTransmissionOccurred(passwordOnly),
    false,
    "originalPassword alone must not be treated as evidence that bytes were uploaded"
);

const batch = createFile("batch-base.pdf") as File & { initialBatch?: File[] };
batch.initialBatch = [plain, cloudPrepared];
assert.equal(hasCloudTransmissionOccurred(batch), true, "batch provenance must inspect every input");

const plainA = createFile("plain-a.pdf");
const protectedB = createFile("protected-b.pdf");
const plainC = createFile("plain-c.pdf");
const unlockedB = createFile("protected-b-unlocked.pdf");
setTransientOriginalPassword(unlockedB, "synthetic-password-b");
const preparedInSelectionOrder = orderPreparedPdfInputs(
    [plainA, protectedB, plainC],
    new Map([[protectedB, unlockedB]])
);
assert.deepEqual(
    preparedInSelectionOrder.map((file) => file.name),
    ["plain-a.pdf", "protected-b-unlocked.pdf", "plain-c.pdf"],
    "prepared replacements must retain the user's original selection order"
);
assert.equal((preparedInSelectionOrder[1] as File & { originalPassword?: string }).originalPassword, "synthetic-password-b");

const cloudOnlyInput = createFile("protected-cloud-only.pdf");
markPdfInputPreparation(cloudOnlyInput, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "cloud",
    cloudTransmissionOccurred: false,
});
assert.equal(requiresCloudProcessingAuthorization(cloudOnlyInput), true);
assert.throws(
    () => assertCloudProcessingAuthorized(cloudOnlyInput, "pdf-to-word"),
    /explicit Cloud processing authorization/i
);
authorizeCloudProcessing(cloudOnlyInput, "pdf-to-word");
assert.doesNotThrow(() => assertCloudProcessingAuthorized(cloudOnlyInput, "pdf-to-word"));
assert.throws(
    () => assertCloudProcessingAuthorized(cloudOnlyInput, "redact-pdf"),
    /explicit Cloud processing authorization/i,
    "Cloud authorization must be scoped to the selected tool"
);

const plainCloudOnlyInput = createFile("plain-cloud-only.pdf");
markPdfInputPreparation(plainCloudOnlyInput, {
    sourceProtected: false,
    bytesState: "plain",
    preparedOn: "none",
    processingMode: "cloud",
    cloudTransmissionOccurred: false,
});
assert.equal(requiresCloudProcessingAuthorization(plainCloudOnlyInput), false);
assert.doesNotThrow(() => assertCloudProcessingAuthorized(plainCloudOnlyInput, "pdf-to-word"));

console.log("PASS: transient PDF preparation mode, protection state, password scoping, and Cloud provenance");
