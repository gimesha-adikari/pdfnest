import type { ProcessingMode } from "@/lib/execution/types";

export type PdfInputPreparation = {
    sourceProtected: boolean | "unchecked";
    bytesState: "plain" | "encrypted" | "decrypted" | "unchecked";
    preparedOn: "none" | "device" | "cloud";
    processingMode: ProcessingMode;
    cloudTransmissionOccurred: boolean;
    /** The current file was produced from a protected source; it is not itself proof of encryption. */
    derivedFromProtectedInput?: boolean;
    /** A cross-tool transfer that has not yet been inspected by the destination uploader. */
    transferredFromTool?: boolean;
    /** Tool-scoped consent for a later protected-input Cloud submission. */
    cloudProcessingAuthorizedForTool?: string;
};

const preparationByFile = new WeakMap<File, PdfInputPreparation>();

export function markPdfInputPreparation(
    file: File,
    preparation: PdfInputPreparation
): File {
    preparationByFile.set(file, { ...preparation });
    return file;
}

/** Record that a Cloud processing request is about to receive these inputs. */
export function markCloudTransmissionOccurred(files: readonly File[]): void {
    const inputs = new Set<File>();
    for (const file of files) {
        const batch = (file as File & { initialBatch?: File[] }).initialBatch;
        for (const input of batch ?? [file]) inputs.add(input);
    }

    for (const input of inputs) {
        const existing = getPdfInputPreparation(input);
        markPdfInputPreparation(input, {
            sourceProtected: existing?.sourceProtected ?? "unchecked",
            bytesState: existing?.bytesState ?? "unchecked",
            preparedOn: existing?.preparedOn ?? "none",
            processingMode: "cloud",
            cloudTransmissionOccurred: true,
            derivedFromProtectedInput: existing?.derivedFromProtectedInput,
            transferredFromTool: existing?.transferredFromTool,
            cloudProcessingAuthorizedForTool: existing?.cloudProcessingAuthorizedForTool,
        });
    }
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
            preparation.cloudTransmissionOccurred ||
            preparation.derivedFromProtectedInput === true ||
            preparation.transferredFromTool === true;
    });
}

export function hasProtectedInputLineage(file: File | null | undefined): boolean {
    if (!file) return false;
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    return inputs.some((input) => {
        const preparation = getPdfInputPreparation(input);
        return preparation?.sourceProtected === true || preparation?.derivedFromProtectedInput === true;
    });
}

export function authorizeCloudProcessing(file: File, toolId: string): void {
    const inputs = (file as File & { initialBatch?: File[] }).initialBatch ?? [file];
    for (const input of inputs) {
        const existing = getPdfInputPreparation(input);
        markPdfInputPreparation(input, {
            sourceProtected: existing?.sourceProtected ?? "unchecked",
            bytesState: existing?.bytesState ?? "unchecked",
            preparedOn: existing?.preparedOn ?? "none",
            processingMode: "cloud",
            cloudTransmissionOccurred: existing?.cloudTransmissionOccurred ?? false,
            derivedFromProtectedInput: existing?.derivedFromProtectedInput,
            transferredFromTool: existing?.transferredFromTool,
            cloudProcessingAuthorizedForTool: toolId,
        });
    }
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
    markCloudTransmissionOccurred([file]);
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

export function hasCloudTransmissionOccurred(files: File | File[] | null | undefined): boolean {
    if (!files) return false;
    const list = Array.isArray(files) ? files : [files];
    return list.some((file) => {
        if (getPdfInputPreparation(file)?.cloudTransmissionOccurred) return true;
        const initialBatch = (file as File & { initialBatch?: File[] }).initialBatch;
        return Boolean(
            initialBatch?.some(
                (item) => getPdfInputPreparation(item)?.cloudTransmissionOccurred
            )
        );
    });
}
