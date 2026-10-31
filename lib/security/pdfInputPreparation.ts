import type { ProcessingMode } from "@/lib/execution/types";

export type PdfInputPreparation = {
    sourceProtected: boolean | "unchecked";
    bytesState: "plain" | "encrypted" | "decrypted" | "unchecked";
    preparedOn: "none" | "device" | "cloud";
    processingMode: ProcessingMode;
    /** A Cloud submission was initiated; this does not prove delivery or completion. */
    cloudSubmissionInitiated: boolean;
    /** The current file was produced from a protected source; it is not itself proof of encryption. */
    derivedFromProtectedInput?: boolean;
    /** A cross-tool transfer that has not yet been inspected by the destination uploader. */
    transferredFromTool?: boolean;
    /** Tool-scoped consent for a later protected-input Cloud submission. */
    cloudProcessingAuthorizedForTool?: string;
};

export type PdfInputResultProvenance = Readonly<{
    sourceProtected: boolean | "unchecked";
    bytesState: PdfInputPreparation["bytesState"];
    preparedOn: PdfInputPreparation["preparedOn"];
    selectedMode: ProcessingMode;
    derivedFromProtectedInput: boolean;
    cloudSubmissionInitiated: boolean;
    cloudProcessingAuthorizedForTool?: string;
}>;

/** Immutable, transient record of the exact inputs accepted for one result. */
export type PdfResultProvenance = Readonly<{
    sourceToolId: string;
    submittedInputs: readonly PdfInputResultProvenance[];
    derivedFromProtectedInput: boolean;
    cloudSubmissionInitiated: boolean;
}>;

const preparationByFile = new WeakMap<File, PdfInputPreparation>();

export function markPdfInputPreparation(
    file: File,
    preparation: PdfInputPreparation
): File {
    preparationByFile.set(file, { ...preparation });
    return file;
}

export function setPdfInputProcessingMode(
    files: readonly File[],
    processingMode: ProcessingMode
): void {
    for (const file of new Set(files)) {
        const existing = getPdfInputPreparation(file);
        markPdfInputPreparation(file, {
            sourceProtected: existing?.sourceProtected ?? "unchecked",
            bytesState: existing?.bytesState ?? "unchecked",
            preparedOn: existing?.preparedOn ?? "none",
            processingMode,
            cloudSubmissionInitiated: existing?.cloudSubmissionInitiated ?? false,
            derivedFromProtectedInput: existing?.derivedFromProtectedInput,
            transferredFromTool: existing?.transferredFromTool,
            cloudProcessingAuthorizedForTool: existing?.cloudProcessingAuthorizedForTool,
        });
    }
}

/** Record a Cloud request at the point it is initiated, after local validation. */
export function markCloudSubmissionInitiated(files: readonly File[]): void {
    for (const input of new Set(files)) {
        const existing = getPdfInputPreparation(input);
        const isKnownPdf = Boolean(existing) ||
            input.type.toLowerCase() === "application/pdf" ||
            /\.pdf$/i.test(input.name);
        if (!isKnownPdf) continue;

        markPdfInputPreparation(input, {
            sourceProtected: existing?.sourceProtected ?? "unchecked",
            bytesState: existing?.bytesState ?? "unchecked",
            preparedOn: existing?.preparedOn ?? "none",
            processingMode: existing?.processingMode ?? "auto",
            cloudSubmissionInitiated: true,
            derivedFromProtectedInput: existing?.derivedFromProtectedInput,
            transferredFromTool: existing?.transferredFromTool,
            cloudProcessingAuthorizedForTool: existing?.cloudProcessingAuthorizedForTool,
        });
    }
}

/** Capture the exact submitted input list; this deliberately does not expand UI batches. */
export function capturePdfResultProvenance(
    submittedFiles: readonly File[],
    sourceToolId: string
): PdfResultProvenance {
    const submittedInputs = submittedFiles.map((file) => {
        const preparation = getPdfInputPreparation(file);
        return Object.freeze({
            sourceProtected: preparation?.sourceProtected ?? "unchecked",
            bytesState: preparation?.bytesState ?? "unchecked",
            preparedOn: preparation?.preparedOn ?? "none",
            selectedMode: preparation?.processingMode ?? "auto",
            derivedFromProtectedInput: preparation?.derivedFromProtectedInput === true,
            cloudSubmissionInitiated: preparation?.cloudSubmissionInitiated === true,
            cloudProcessingAuthorizedForTool: preparation?.cloudProcessingAuthorizedForTool,
        });
    });

    return Object.freeze({
        sourceToolId,
        submittedInputs: Object.freeze(submittedInputs),
        derivedFromProtectedInput: submittedInputs.some(
            (input) => input.sourceProtected === true || input.derivedFromProtectedInput
        ),
        cloudSubmissionInitiated: submittedInputs.some((input) => input.cloudSubmissionInitiated),
    });
}

export function createTransferredPdfPreparation(
    provenance: PdfResultProvenance
): PdfInputPreparation {
    return {
        sourceProtected: "unchecked",
        bytesState: "unchecked",
        preparedOn: "none",
        processingMode: "auto",
        cloudSubmissionInitiated: provenance.cloudSubmissionInitiated,
        derivedFromProtectedInput: provenance.derivedFromProtectedInput,
        transferredFromTool: true,
    };
}

export function getPdfInputPreparation(
    file: File | null | undefined
): PdfInputPreparation | undefined {
    return file ? preparationByFile.get(file) : undefined;
}

export function orderPreparedPdfInputs(
    originalFiles: File[],
    preparedByOriginal: ReadonlyMap<File, File>
): File[] {
    return originalFiles.map((file) => preparedByOriginal.get(file) ?? file);
}

export function requiresCloudProcessingAuthorization(file: File | null | undefined): boolean {
    if (!file) return false;
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    return inputs.some((input) => {
        const preparation = getPdfInputPreparation(input);
        return !preparation ||
            preparation.sourceProtected !== false ||
            preparation.bytesState === "unchecked" ||
            preparation.derivedFromProtectedInput === true ||
            preparation.transferredFromTool === true;
    });
}

/** Check one exact input File without expanding any route-level initialBatch wrapper. */
export function requiresCloudProcessingAuthorizationForInput(file: File | null | undefined): boolean {
    if (!file) return false;
    const preparation = getPdfInputPreparation(file);
    return !preparation ||
        preparation.sourceProtected !== false ||
        preparation.bytesState === "unchecked" ||
        preparation.derivedFromProtectedInput === true ||
        preparation.transferredFromTool === true;
}

export function hasProtectedInputLineage(file: File | null | undefined): boolean {
    if (!file) return false;
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    return inputs.some((input) => {
        const preparation = getPdfInputPreparation(input);
        return preparation?.sourceProtected === true || preparation?.derivedFromProtectedInput === true;
    });
}

/** Check one exact File's source lineage without expanding an initial upload batch. */
export function hasProtectedPdfInputLineage(file: File | null | undefined): boolean {
    if (!file) return false;
    const preparation = getPdfInputPreparation(file);
    return preparation?.sourceProtected === true || preparation?.derivedFromProtectedInput === true;
}

function authorizeExactFileForCloudProcessing(file: File, toolId: string): void {
    const existing = getPdfInputPreparation(file);
    markPdfInputPreparation(file, {
        sourceProtected: existing?.sourceProtected ?? "unchecked",
        bytesState: existing?.bytesState ?? "unchecked",
        preparedOn: existing?.preparedOn ?? "none",
        processingMode: existing?.processingMode ?? "auto",
        cloudSubmissionInitiated: existing?.cloudSubmissionInitiated ?? false,
        derivedFromProtectedInput: existing?.derivedFromProtectedInput,
        transferredFromTool: existing?.transferredFromTool,
        cloudProcessingAuthorizedForTool: toolId,
    });
}

/** Authorize only the exact input snapshot shown to the user for a workflow. */
export function authorizeCloudProcessingInputs(files: readonly File[], toolId: string): void {
    for (const file of new Set(files)) authorizeExactFileForCloudProcessing(file, toolId);
}

export function authorizeCloudProcessing(file: File, toolId: string): void {
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    authorizeCloudProcessingInputs(inputs, toolId);
}

/** Revoke only the exact file's matching route authorization; preserve transmission history. */
export function revokeCloudProcessingAuthorization(file: File, toolId: string): void {
    const existing = getPdfInputPreparation(file);
    if (!existing || existing.cloudProcessingAuthorizedForTool !== toolId) return;
    markPdfInputPreparation(file, {
        ...existing,
        cloudProcessingAuthorizedForTool: undefined,
    });
}

export function isCloudProcessingAuthorized(file: File | null | undefined, toolId: string): boolean {
    if (!file) return false;
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    return inputs.every((input) => {
        const preparation = getPdfInputPreparation(input);
        return preparation?.cloudProcessingAuthorizedForTool === toolId;
    });
}

export function assertCloudProcessingAuthorized(file: File, toolId: string): void {
    if (requiresCloudProcessingAuthorization(file) && !isCloudProcessingAuthorized(file, toolId)) {
        throw new Error("This protected or unverified input requires explicit Cloud processing authorization for this tool.");
    }
}

/** Guard a submitted operation's exact File set without inheriting batch metadata. */
export function assertCloudProcessingAuthorizedInputs(files: readonly File[], toolId: string): void {
    for (const file of new Set(files)) {
        if (
            requiresCloudProcessingAuthorizationForInput(file) &&
            getPdfInputPreparation(file)?.cloudProcessingAuthorizedForTool !== toolId
        ) {
            throw new Error("This protected or unverified input requires explicit Cloud processing authorization for this tool.");
        }
    }
}

/** A decrypted source with known original protection cannot silently lose its restoration contract. */
export function getPdfOutputRestorationPassword(file: File): string | undefined {
    const password = (file as File & { originalPassword?: string }).originalPassword;
    const preparation = getPdfInputPreparation(file);
    if (!password && preparation?.sourceProtected === true && preparation.bytesState === "decrypted") {
        throw new Error("The source password is no longer available. Reopen the original PDF before processing.");
    }
    return password;
}

export function setTransientOriginalPassword(file: File, password: string): void {
    Object.defineProperty(file, "originalPassword", {
        value: password,
        configurable: true,
        writable: true,
        enumerable: false,
    });
}

export function getInitialProcessingMode(
    file: File | null | undefined
): ProcessingMode {
    return getPdfInputPreparation(file)?.processingMode ?? "auto";
}

export function hasCloudSubmissionInitiated(files: File | File[] | null | undefined): boolean {
    if (!files) return false;
    const list = Array.isArray(files) ? files : [files];
    return list.some((file) => {
        if (getPdfInputPreparation(file)?.cloudSubmissionInitiated) return true;
        const initialBatch = (file as File & { initialBatch?: File[] }).initialBatch;
        return Boolean(
            initialBatch?.some(
                (item) => getPdfInputPreparation(item)?.cloudSubmissionInitiated
            )
        );
    });
}

/**
 * Confirms whether a file is an authorized synthetic placeholder for URL capture,
 * verifying zero byte content, no protected lineage, no cross-tool transfer, and
 * valid URL placeholder identifiers. Real PDFs and derived/transferred files return false.
 */
export function isSyntheticUrlPlaceholder(file: File | null | undefined): boolean {
    if (!file) return false;
    if (file.size !== 0) return false;
    const prep = getPdfInputPreparation(file);
    if (prep?.derivedFromProtectedInput === true) return false;
    if (prep?.sourceProtected === true) return false;
    if (prep?.transferredFromTool === true) return false;

    const targetUrl = (file as { targetUrl?: unknown }).targetUrl;
    const hasTargetUrl = typeof targetUrl === "string" && targetUrl.trim().length > 0;
    const isNamedPlaceholder = file.name === "placeholder.pdf" || file.name === "url-capture.pdf";

    return hasTargetUrl || isNamedPlaceholder;
}

/**
 * Confirms whether a file is an authorized synthetic placeholder for repository analysis,
 * verifying zero byte content, repository mime type, and no protected or transferred lineage.
 */
export function isSyntheticRepositoryPlaceholder(file: File | null | undefined): boolean {
    if (!file) return false;
    if (file.size !== 0) return false;
    const prep = getPdfInputPreparation(file);
    if (prep?.derivedFromProtectedInput === true) return false;
    if (prep?.sourceProtected === true) return false;
    if (prep?.transferredFromTool === true) return false;

    return file.type === "application/x-repository";
}
