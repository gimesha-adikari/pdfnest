import assert from "node:assert/strict";
import {
    assertCloudProcessingAuthorized,
    authorizeCloudProcessing,
    capturePdfResultProvenance,
    createTransferredPdfPreparation,
    getInitialProcessingMode,
    getPdfInputPreparation,
    hasCloudSubmissionInitiated,
    isCloudProcessingAuthorized,
    markCloudSubmissionInitiated,
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
    cloudSubmissionInitiated: false,
});
assert.equal(getInitialProcessingMode(plain), "auto");
assert.equal(hasCloudSubmissionInitiated(plain), false);

const imageInput = new File(["synthetic image"], "synthetic.png", { type: "image/png" });
markCloudSubmissionInitiated([imageInput]);
assert.equal(
    hasCloudSubmissionInitiated(imageInput),
    false,
    "PDF transmission provenance must not change non-PDF input behavior"
);

const cloudProcessedProtectedSource = createFile("cloud-processed-protected-source.pdf");
markPdfInputPreparation(cloudProcessedProtectedSource, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "device",
    cloudSubmissionInitiated: false,
    derivedFromProtectedInput: true,
});
markCloudSubmissionInitiated([cloudProcessedProtectedSource]);
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.processingMode, "device");
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.cloudSubmissionInitiated, true);
assert.equal(getPdfInputPreparation(cloudProcessedProtectedSource)?.sourceProtected, true);
assert.equal(hasCloudSubmissionInitiated(cloudProcessedProtectedSource), true);

const devicePrepared = createFile("device-prepared.pdf");
setTransientOriginalPassword(devicePrepared, "synthetic-device-password");
markPdfInputPreparation(devicePrepared, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "device",
    cloudSubmissionInitiated: false,
});
assert.equal(getInitialProcessingMode(devicePrepared), "device");
assert.equal(getPdfInputPreparation(devicePrepared)?.bytesState, "decrypted");
assert.equal(hasCloudSubmissionInitiated(devicePrepared), false);
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
    cloudSubmissionInitiated: true,
});
assert.equal(getInitialProcessingMode(cloudPrepared), "cloud");
assert.equal(hasCloudSubmissionInitiated(cloudPrepared), true);

const passwordOnly = createFile("password-property-is-not-provenance.pdf") as File & {
    originalPassword?: string;
};
passwordOnly.originalPassword = "synthetic-only-password-property";
assert.equal(
    hasCloudSubmissionInitiated(passwordOnly),
    false,
    "originalPassword alone must not be treated as evidence that bytes were uploaded"
);

const batch = createFile("batch-base.pdf") as File & { initialBatch?: File[] };
batch.initialBatch = [plain, cloudPrepared];
assert.equal(hasCloudSubmissionInitiated(batch), true, "batch provenance must inspect every input");

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
    cloudSubmissionInitiated: false,
});
assert.equal(requiresCloudProcessingAuthorization(cloudOnlyInput), true);
assert.throws(
    () => assertCloudProcessingAuthorized(cloudOnlyInput, "pdf-to-word"),
    /explicit Cloud processing authorization/i
);
authorizeCloudProcessing(cloudOnlyInput, "pdf-to-word");
assert.equal(hasCloudSubmissionInitiated(cloudOnlyInput), false, "consent alone does not record submission");
assert.doesNotThrow(() => assertCloudProcessingAuthorized(cloudOnlyInput, "pdf-to-word"));
markCloudSubmissionInitiated([cloudOnlyInput]);
assert.equal(hasCloudSubmissionInitiated(cloudOnlyInput), true, "starting a request records conservative transmission risk");
assert.doesNotThrow(
    () => assertCloudProcessingAuthorized(cloudOnlyInput, "pdf-to-word"),
    "same-tool retry retains the input's route-scoped authorization"
);
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
    cloudSubmissionInitiated: false,
});
assert.equal(requiresCloudProcessingAuthorization(plainCloudOnlyInput), false);
assert.doesNotThrow(() => assertCloudProcessingAuthorized(plainCloudOnlyInput, "pdf-to-word"));
assert.equal(hasCloudSubmissionInitiated(plainCloudOnlyInput), false, "authorization checks alone do not record a request");
markCloudSubmissionInitiated([plainCloudOnlyInput]);
assert.equal(hasCloudSubmissionInitiated(plainCloudOnlyInput), true);
assert.equal(
    requiresCloudProcessingAuthorization(plainCloudOnlyInput),
    false,
    "an inspected plain input remains eligible for the same tool after a Cloud submission starts"
);
assert.doesNotThrow(
    () => assertCloudProcessingAuthorized(plainCloudOnlyInput, "pdf-to-word"),
    "a plain-input retry on the same route must not acquire a new protected-input gate"
);
const transferredPlain = createFile("transferred-plain.pdf");
markPdfInputPreparation(transferredPlain, {
    sourceProtected: false,
    bytesState: "plain",
    preparedOn: "none",
    processingMode: "auto",
    cloudSubmissionInitiated: true,
    transferredFromTool: true,
});
assert.throws(
    () => assertCloudProcessingAuthorized(transferredPlain, "redact-pdf"),
    /explicit Cloud processing authorization/i,
    "cross-tool transfer still requires fresh route-scoped authorization"
);

const mergeSubmittedInputs = [protectedB, plainC];
markPdfInputPreparation(protectedB, {
    sourceProtected: true,
    bytesState: "decrypted",
    preparedOn: "device",
    processingMode: "auto",
    cloudSubmissionInitiated: false,
    cloudProcessingAuthorizedForTool: "merge-pdf",
});
markPdfInputPreparation(plainC, {
    sourceProtected: false,
    bytesState: "plain",
    preparedOn: "none",
    processingMode: "cloud",
    cloudSubmissionInitiated: false,
});
markCloudSubmissionInitiated(mergeSubmittedInputs);
const resultProvenance = capturePdfResultProvenance(mergeSubmittedInputs, "merge-pdf");
markPdfInputPreparation(protectedB, {
    sourceProtected: false,
    bytesState: "plain",
    preparedOn: "none",
    processingMode: "auto",
    cloudSubmissionInitiated: false,
});
assert.equal(resultProvenance.submittedInputs.length, 2, "the snapshot records the actual accepted input list");
assert.equal(resultProvenance.submittedInputs[0].sourceProtected, true);
assert.equal(resultProvenance.submittedInputs[0].cloudSubmissionInitiated, true);
assert.equal(resultProvenance.submittedInputs[1].sourceProtected, false);
assert.equal(resultProvenance.derivedFromProtectedInput, true);
assert.equal(resultProvenance.cloudSubmissionInitiated, true);
assert.equal(Object.isFrozen(resultProvenance), true);
assert.equal(Object.isFrozen(resultProvenance.submittedInputs), true);
assert.equal(Object.isFrozen(resultProvenance.submittedInputs[0]), true);
assert.equal(
    Object.prototype.hasOwnProperty.call(resultProvenance.submittedInputs[0], "originalPassword"),
    false,
    "result provenance never contains passwords"
);
const transferredPreparation = createTransferredPdfPreparation(resultProvenance);
assert.equal(transferredPreparation.sourceProtected, "unchecked", "output bytes are inspected independently of source lineage");
assert.equal(transferredPreparation.bytesState, "unchecked");
assert.equal(transferredPreparation.derivedFromProtectedInput, true);
assert.equal(transferredPreparation.cloudSubmissionInitiated, true);
assert.equal(transferredPreparation.transferredFromTool, true);
assert.equal(transferredPreparation.cloudProcessingAuthorizedForTool, undefined, "source-route consent is not transferred");
const transferredOutput = createFile("merge-output.pdf");
markPdfInputPreparation(transferredOutput, transferredPreparation);
markPdfInputPreparation(transferredOutput, {
    ...getPdfInputPreparation(transferredOutput)!,
    sourceProtected: false,
    bytesState: "plain",
});
assert.equal(getPdfInputPreparation(transferredOutput)?.sourceProtected, false, "destination inspection records output bytes independently");
assert.equal(getPdfInputPreparation(transferredOutput)?.derivedFromProtectedInput, true);
assert.equal(hasCloudSubmissionInitiated(transferredOutput), true);
assert.equal(isCloudProcessingAuthorized(transferredOutput, "pdf-to-word"), false);
assert.throws(
    () => assertCloudProcessingAuthorized(transferredOutput, "pdf-to-word"),
    /explicit Cloud processing authorization/i,
    "result provenance requires fresh consent for the destination route"
);

console.log("PASS: transient PDF preparation mode, protection state, password scoping, and Cloud provenance");
