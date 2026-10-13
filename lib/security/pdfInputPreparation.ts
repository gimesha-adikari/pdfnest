import type { ProcessingMode } from "@/lib/execution/types";

export type PdfInputPreparation = {
    sourceProtected: boolean | "unchecked";
    bytesState: "plain" | "encrypted" | "decrypted" | "unchecked";
    preparedOn: "none" | "device" | "cloud";
    processingMode: ProcessingMode;
    cloudTransmissionOccurred: boolean;
};

const preparationByFile = new WeakMap<File, PdfInputPreparation>();

export function markPdfInputPreparation(
    file: File,
    preparation: PdfInputPreparation
): File {
    preparationByFile.set(file, { ...preparation });
    return file;
}

export function getPdfInputPreparation(
    file: File | null | undefined
): PdfInputPreparation | undefined {
    return file ? preparationByFile.get(file) : undefined;
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

export function hasCloudPreparedInput(files: File | File[] | null | undefined): boolean {
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
