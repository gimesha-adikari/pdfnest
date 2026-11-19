"use client";

import { abortableDelay } from "@/lib/abortableDelay";
import { EditorRequestError, getEditorExtractionReceipt, type EditorJobSubmission } from "@/lib/editorJobs";

export interface ExtractionAttempt {
    id: string;
    phase: "uploading" | "submitting";
    submission?: Promise<EditorJobSubmission>;
    receipt?: EditorJobSubmission;
    listeners: Set<(phase: ExtractionAttempt["phase"]) => void>;
}

const attemptsByFile = new WeakMap<File, Map<string, ExtractionAttempt>>();

export function extractionAttempt(file: File, scope: string): ExtractionAttempt {
    let attempts = attemptsByFile.get(file);
    if (!attempts) {
        attempts = new Map();
        attemptsByFile.set(file, attempts);
    }
    let attempt = attempts.get(scope);
    if (!attempt) {
        attempt = { id: crypto.randomUUID(), phase: "uploading", listeners: new Set() };
        attempts.set(scope, attempt);
    }
    return attempt;
}

export function discardExtractionAttempt(file: File, scope: string, attempt: ExtractionAttempt) {
    const attempts = attemptsByFile.get(file);
    if (attempts?.get(scope) === attempt) attempts.delete(scope);
}

export function isConfirmedExtractionRejection(error: unknown): error is EditorRequestError {
    return error instanceof EditorRequestError && error.status >= 400 && error.status < 500 &&
        ![408, 409].includes(error.status);
}

export async function recoverEditorExtraction(id: string, signal: AbortSignal) {
    // Only GETs are automatic. A retry of a missing upload requires a manual
    // action and the same key, and is allowed only when this API confirms it.
    for (let read = 0; read < 3; read++) {
        if (read > 0) await abortableDelay(1500 * read, signal);
        try {
            const receipt = await getEditorExtractionReceipt(id, signal);
            if (receipt.state === "accepted" || receipt.state === "expired" || read === 2) return receipt;
        } catch (error) {
            signal.throwIfAborted();
            if (isConfirmedExtractionRejection(error) || read === 2) throw error;
        }
    }
    throw new Error("The extraction was not acknowledged.");
}
