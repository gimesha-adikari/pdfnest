"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, Lock, Loader2, ShieldAlert } from "lucide-react";
import { uploadAndDownloadFile } from "@/lib/api";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ExecutionError, type ProcessingMode } from "@/lib/execution/types";
import { inspectPdf, isPdfCandidate, type PdfInputPolicy } from "@/lib/pdf/localPreparation";
import {
    hasCloudSubmissionInitiated,
    getPdfInputPreparation,
    markPdfInputPreparation,
    orderPreparedPdfInputs,
    setTransientOriginalPassword,
} from "@/lib/security/pdfInputPreparation";
import PasswordField from "@/components/ui/PasswordField";

type ProtectedFileHandling =
    | "fail-closed"
    | "choose-mode"
    | "current-mode"
    | "cloud-only"
    | "cloud-consent"
    | "explicit-unlock"
    | "cloud-session-consent";

type UploadAcceptance = {
    processingMode: ProcessingMode;
};

function errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object") return undefined;
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    if (record.originalError && typeof record.originalError === "object") {
        const original = record.originalError as Record<string, unknown>;
        if (typeof original.code === "string") return original.code;
    }
    return undefined;
}

function hasPdfHeader(blob: Blob): Promise<boolean> {
    return blob.slice(0, 5).text().then((header) => header === "%PDF-");
}

interface PdfUploaderProps {
    onFilesAccepted: (files: File[], acceptance?: UploadAcceptance) => void | Promise<void>;
    /** Fires synchronously when a new picker/drop operation begins. */
    onFilesSelected?: (files: File[]) => void;
    title?: string;
    description?: string;
    accept?: string;
    multiple?: boolean;
    bypassEncryptionCheck?: boolean;
    protectedFileHandling?: ProtectedFileHandling;
    processingMode?: ProcessingMode;
    inputRef?: React.Ref<HTMLInputElement>;
    showDropZone?: boolean;
    initialFiles?: File[];
    inputPolicy?: PdfInputPolicy;
}

interface UploadQueue {
    remaining: File[];
    originalFiles: File[];
    preparedByOriginal: Map<File, File>;
    processingMode: ProcessingMode;
    cloudSubmissionInitiated: boolean;
}

export default function PdfUploader({
    onFilesAccepted,
    onFilesSelected,
    title = "Select or Drop Files Here",
    description = "Supports standard documents configuration formats",
    accept = "*/*",
    multiple = false,
    bypassEncryptionCheck = false,
    protectedFileHandling = "fail-closed",
    processingMode = "auto",
    inputRef,
    showDropZone = true,
    initialFiles,
    inputPolicy = "strict",
}: PdfUploaderProps) {
    const [queue, setQueue] = useState<UploadQueue | null>(null);
    const [sessionConsentFiles, setSessionConsentFiles] = useState<File[] | null>(null);
    const [password, setPassword] = useState("");
    const [isInspecting, setIsInspecting] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [activePreparationMode, setActivePreparationMode] = useState<ProcessingMode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const operationIdRef = useRef(0);
    const preparingRef = useRef(false);
    const activeAbortRef = useRef<AbortController | null>(null);
    const handledInitialFilesRef = useRef<File[] | null>(null);

    useEffect(() => () => {
        operationIdRef.current += 1;
        activeAbortRef.current?.abort();
    }, []);

    const handleFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;

        const operationId = ++operationIdRef.current;
        activeAbortRef.current?.abort();
        const controller = new AbortController();
        activeAbortRef.current = controller;
        preparingRef.current = false;
        setQueue(null);
        setSessionConsentFiles(null);
        setPassword("");
        setError(null);
        onFilesSelected?.(files);

        const selectedMode = processingMode;

        if (bypassEncryptionCheck) {
            if (protectedFileHandling === "explicit-unlock") {
                const accepted = files.map((file) => {
                    const previous = getPdfInputPreparation(file);
                    return markPdfInputPreparation(file, {
                        sourceProtected: "unchecked",
                        bytesState: "unchecked",
                        preparedOn: "none",
                        processingMode: selectedMode,
                        cloudSubmissionInitiated: previous?.cloudSubmissionInitiated ?? false,
                        derivedFromProtectedInput: previous?.derivedFromProtectedInput,
                        transferredFromTool: previous?.transferredFromTool,
                    });
                });
                await onFilesAccepted(accepted, { processingMode: selectedMode });
                return;
            }

            if (protectedFileHandling === "cloud-session-consent") {
                setSessionConsentFiles(files);
                return;
            }

            setError("This upload path skips PDF protection inspection and has no approved preparation policy. No file was submitted.");
            return;
        }

        setIsInspecting(true);
        const plain: File[] = [];
        const protectedFiles: File[] = [];

        try {
            for (const file of files) {
                try {
                    if (operationId !== operationIdRef.current || controller.signal.aborted) return;
                    const candidate = inputPolicy === "repair" || await isPdfCandidate(file, controller.signal);
                    if (!candidate) {
                        plain.push(file);
                        continue;
                    }
                    const encrypted = await inspectPdf(file, controller.signal, inputPolicy);
                    if (operationId !== operationIdRef.current || controller.signal.aborted) return;
                    (encrypted ? protectedFiles : plain).push(file);
                } catch (cause: unknown) {
                    if (operationId === operationIdRef.current && !controller.signal.aborted) {
                        setError(cause instanceof ExecutionError
                            ? cause.message
                            : "Could not verify the selected document. No file was submitted. Select a valid file and try again.");
                    }
                    return;
                }
            }
        } finally {
            if (operationId === operationIdRef.current) setIsInspecting(false);
            if (activeAbortRef.current === controller) activeAbortRef.current = null;
        }

        if (operationId !== operationIdRef.current) return;

        if (protectedFiles.length > 0) {
            const cloudSubmissionInitiated = hasCloudSubmissionInitiated(files);
            if (protectedFileHandling !== "choose-mode" && protectedFileHandling !== "current-mode") {
                setQueue({
                    remaining: protectedFiles,
                    originalFiles: files,
                    preparedByOriginal: new Map(plain.map((file) => [file, file])),
                    processingMode: cloudSubmissionInitiated
                        ? "cloud"
                        : protectedFileHandling === "cloud-only" ? "device" : selectedMode,
                    cloudSubmissionInitiated,
                });
                return;
            }

            setQueue({
                remaining: protectedFiles,
                originalFiles: files,
                preparedByOriginal: new Map(plain.map((file) => [file, file])),
                processingMode: cloudSubmissionInitiated
                    ? "cloud"
                    : protectedFileHandling === "choose-mode" ? "auto" : selectedMode,
                cloudSubmissionInitiated,
            });
            return;
        }

        const accepted = plain.map((file) => {
            const previous = getPdfInputPreparation(file);
            return markPdfInputPreparation(file, {
                sourceProtected: false,
                bytesState: "plain",
                preparedOn: "none",
                processingMode: selectedMode,
                cloudSubmissionInitiated: previous?.cloudSubmissionInitiated ?? false,
                derivedFromProtectedInput: previous?.derivedFromProtectedInput,
                transferredFromTool: previous?.transferredFromTool,
            });
        });
        await onFilesAccepted(accepted, { processingMode: selectedMode });
    }, [bypassEncryptionCheck, inputPolicy, onFilesAccepted, onFilesSelected, processingMode, protectedFileHandling]);

    useEffect(() => {
        if (!initialFiles?.length || handledInitialFilesRef.current === initialFiles) return;
        let active = true;
        void Promise.resolve().then(() => {
            if (!active || handledInitialFilesRef.current === initialFiles) return;
            handledInitialFilesRef.current = initialFiles;
            void handleFiles(initialFiles);
        });
        return () => {
            active = false;
        };
    }, [handleFiles, initialFiles]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        void handleFiles(files);
        event.target.value = "";
    }, [handleFiles]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        void handleFiles(Array.from(event.dataTransfer.files || []));
    }, [handleFiles]);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const acceptCloudSessionUpload = useCallback(async () => {
        if (!sessionConsentFiles || preparingRef.current) return;
        const operationId = ++operationIdRef.current;
        preparingRef.current = true;
        setIsPreparing(true);
        const accepted = sessionConsentFiles.map((file) => {
            const previous = getPdfInputPreparation(file);
            return markPdfInputPreparation(file, {
                sourceProtected: previous?.sourceProtected ?? "unchecked",
                bytesState: previous?.bytesState ?? "unchecked",
                preparedOn: "none",
                processingMode: "cloud",
                cloudSubmissionInitiated: previous?.cloudSubmissionInitiated ?? false,
                derivedFromProtectedInput: previous?.derivedFromProtectedInput,
                transferredFromTool: previous?.transferredFromTool,
            });
        });
        setSessionConsentFiles(null);
        setError(null);
        try {
            await onFilesAccepted(accepted, { processingMode: "cloud" });
        } finally {
            if (operationId === operationIdRef.current) {
                preparingRef.current = false;
                setIsPreparing(false);
            }
        }
    }, [onFilesAccepted, sessionConsentFiles]);

    const cancelPreparation = useCallback((message?: string) => {
        operationIdRef.current += 1;
        activeAbortRef.current?.abort();
        activeAbortRef.current = null;
        preparingRef.current = false;
        setActivePreparationMode(null);
        setIsPreparing(false);
        setQueue(null);
        setSessionConsentFiles(null);
        setPassword("");
        setError(message || null);
    }, []);

    const handleProtectedFile = useCallback(async (preparationMode?: ProcessingMode) => {
        if (!queue || queue.remaining.length === 0 || !password || preparingRef.current) return;

        const operationId = operationIdRef.current;
        const currentLockedFile = queue.remaining[0];
        const mode = preparationMode ?? queue.processingMode;
        const controller = new AbortController();
        activeAbortRef.current = controller;
        preparingRef.current = true;
        setIsPreparing(true);
        setActivePreparationMode(mode);
        setError(null);

        try {
            let preparedBlob: Blob;
            let preparedOn: "device" | "cloud";
            let currentFileCloudSubmissionInitiated = Boolean(
                getPdfInputPreparation(currentLockedFile)?.cloudSubmissionInitiated
            );
            const queueCloudSubmissionInitiated = queue.cloudSubmissionInitiated;

            if (mode === "cloud") {
                const formData = new FormData();
                formData.append("file", currentLockedFile);
                formData.append("password", password);
                preparedBlob = await uploadAndDownloadFile(
                    "/api/security/unlock",
                    formData,
                    undefined,
                    controller.signal
                );
                currentFileCloudSubmissionInitiated = hasCloudSubmissionInitiated(currentLockedFile);
                preparedOn = "cloud";
            } else {
                const result = await ExecutionManager.run({
                    tool: "unlock",
                    files: [currentLockedFile],
                    mode: "device",
                    allowFallback: false,
                    password,
                    signal: controller.signal,
                });
                if (result.executionMode !== "client" || result.fallbackOccurred) {
                    throw new Error("Local unlock did not complete on this device.");
                }
                preparedBlob = result.blob;
                preparedOn = "device";
            }

            if (operationId !== operationIdRef.current || controller.signal.aborted) return;
            if (!(await hasPdfHeader(preparedBlob))) {
                throw new Error("PDF preparation did not return a valid PDF.");
            }

            const unlockedFile = new File([preparedBlob], currentLockedFile.name, {
                type: "application/pdf",
                lastModified: currentLockedFile.lastModified,
            });
            if (await inspectPdf(unlockedFile, controller.signal)) {
                throw new Error("PDF preparation returned an encrypted document.");
            }
            if (operationId !== operationIdRef.current || controller.signal.aborted) return;
            setTransientOriginalPassword(unlockedFile, password);
            const sourcePreparation = getPdfInputPreparation(currentLockedFile);
            markPdfInputPreparation(unlockedFile, {
                sourceProtected: true,
                bytesState: "decrypted",
                preparedOn,
                processingMode: mode,
                cloudSubmissionInitiated: currentFileCloudSubmissionInitiated,
                derivedFromProtectedInput: sourcePreparation?.derivedFromProtectedInput,
                transferredFromTool: sourcePreparation?.transferredFromTool,
            });

            const nextPreparedByOriginal = new Map(queue.preparedByOriginal);
            nextPreparedByOriginal.set(currentLockedFile, unlockedFile);
            const nextRemaining = queue.remaining.slice(1);
            setPassword("");

            if (nextRemaining.length === 0) {
                const acceptedMode = protectedFileHandling === "cloud-only" ? "cloud" : mode;
                const ordered = orderPreparedPdfInputs(queue.originalFiles, nextPreparedByOriginal);
                const accepted = ordered.map((file) => {
                    const existing = getPdfInputPreparation(file);
                    return markPdfInputPreparation(file, existing
                        ? { ...existing, processingMode: acceptedMode }
                        : {
                            sourceProtected: false,
                            bytesState: "plain",
                            preparedOn: "none",
                            processingMode: acceptedMode,
                            cloudSubmissionInitiated: false,
                        });
                });
                await onFilesAccepted(accepted, { processingMode: acceptedMode });
                if (operationId === operationIdRef.current && !controller.signal.aborted) {
                    setQueue(null);
                }
            } else {
                setQueue({
                    ...queue,
                    remaining: nextRemaining,
                    preparedByOriginal: nextPreparedByOriginal,
                    cloudSubmissionInitiated: queueCloudSubmissionInitiated || currentFileCloudSubmissionInitiated,
                });
            }
        } catch (cause: unknown) {
            if (operationId !== operationIdRef.current || controller.signal.aborted) return;
            const code = errorCode(cause);
            if (code === "USER_CANCELLATION" || (cause instanceof Error && cause.name === "AbortError")) {
                setError(hasCloudSubmissionInitiated(currentLockedFile)
                    ? "Preparation was cancelled after a Cloud request started. The request may have sent the file or password, and any transfer cannot be recalled."
                    : "Preparation was cancelled before a Cloud request started. No file or password was sent to Cloud.");
            } else if (mode === "cloud") {
                const cloudRequestStarted = hasCloudSubmissionInitiated(currentLockedFile);
                setError(cloudRequestStarted
                    ? "Cloud could not unlock this file. Check the password or cancel and select a fresh source for a local attempt. The request may already have sent the file and password."
                    : "Cloud could not start this unlock request because local validation failed. No file or password was sent. Check the file and try again.");
                if (cloudRequestStarted) {
                    setQueue((current) => current ? {
                        ...current,
                        processingMode: "cloud",
                        cloudSubmissionInitiated: true,
                    } : current);
                }
            } else if (code === "DECRYPTION_AUTH_FAILED" || (cause instanceof ExecutionError && cause.code === "DECRYPTION_AUTH_FAILED")) {
                setError("Incorrect password. The protected file and password were not sent to Cloud.");
            } else {
                setError(protectedFileHandling === "cloud-only"
                    ? "Local preparation failed and no Cloud fallback occurred. You can cancel or explicitly authorize Cloud unlock below."
                    : "This device could not unlock the file. No Cloud fallback occurred. You can choose Cloud and explicitly authorize a Cloud unlock, or cancel.");
            }
        } finally {
            if (operationId === operationIdRef.current) {
                preparingRef.current = false;
                activeAbortRef.current = null;
                setActivePreparationMode(null);
                setIsPreparing(false);
            }
        }
    }, [onFilesAccepted, password, protectedFileHandling, queue]);

    const activeLockedFile = queue?.remaining[0];
    const selectedMode = queue?.processingMode ?? "auto";
    const canChooseMode = protectedFileHandling === "choose-mode";
    const cloudOnly = protectedFileHandling === "cloud-only";
    const cloudConsent = protectedFileHandling === "cloud-consent";
    const deviceLockedOut = Boolean(queue?.cloudSubmissionInitiated);

    if (sessionConsentFiles) {
        return (
            <div role="dialog" aria-labelledby="cloud-upload-title" className="flex flex-col items-center justify-center p-8 sm:p-10 w-full border border-amber-500/40 bg-amber-500/5 rounded-xl">
                <div className="p-3.5 rounded-lg bg-amber-500/10 text-amber-600 mb-4"><Lock size={22} /></div>
                <h2 id="cloud-upload-title" className="text-sm font-semibold text-[var(--foreground)] text-center mb-2">Cloud upload authorization</h2>
                <p className="text-xs text-[var(--muted)] text-center mb-5 max-w-md">
                    This workflow sends the selected file to Platen Cloud to create or update an online Studio document. Protection inspection is intentionally skipped here, so this authorization applies to every selected file.
                </p>
                <div className="flex gap-3">
                    <button type="button" onClick={() => cancelPreparation()} className="px-3 py-2 text-xs text-[var(--muted)]">Cancel upload</button>
                    <button type="button" onClick={() => void acceptCloudSessionUpload()} className="px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] rounded-lg">Authorize Cloud upload</button>
                </div>
            </div>
        );
    }

    if (activeLockedFile) {
        const failClosed = protectedFileHandling === "fail-closed";
        const explicitUnlock = protectedFileHandling === "explicit-unlock";

        return (
            <div role="dialog" aria-labelledby="protected-document-title" className="flex flex-col items-center justify-center p-8 sm:p-10 w-full border border-rose-500/40 bg-rose-500/5 rounded-xl select-none">
                <div className="p-3.5 rounded-lg bg-rose-500/10 text-rose-500 mb-4"><Lock size={22} /></div>
                <h2 id="protected-document-title" className="text-sm font-semibold text-[var(--foreground)] text-center mb-1">
                    Protected document detected {queue.remaining.length > 1 && `(1 of ${queue.remaining.length})`}
                </h2>
                <p className="text-xs text-[var(--muted)] text-center mb-4 max-w-sm">
                    {cloudOnly
                        ? `“${activeLockedFile.name}” is encrypted. Cloud processing is required for this tool. Entering the password unlocks the PDF locally; the prepared file is sent only after you authorize this tool's Cloud processing on the next screen.`
                        : cloudConsent
                            ? `“${activeLockedFile.name}” is encrypted. Some annotation modes can send the prepared PDF to Platen Cloud. Password preparation stays local; the route will ask before Cloud processing.`
                        : deviceLockedOut
                            ? `“${activeLockedFile.name}” is encrypted and a Cloud request was already started for this source. File delivery may have occurred, and this preparation action cannot recall the request.`
                            : `“${activeLockedFile.name}” is encrypted. Preparation stays on this device unless you explicitly authorize Cloud unlock below.`}
                </p>

                {failClosed ? (
                    <div className="max-w-sm text-center text-xs text-[var(--muted)]">
                        This workflow does not have an approved protected-PDF preparation path. Choose an unlocked PDF or use a workflow with an explicit preparation choice. No file or password has been sent.
                    </div>
                ) : explicitUnlock ? (
                    <div className="max-w-sm text-center text-xs text-[var(--muted)]">
                        Unlock PDF accepts the protected source for its intentional unlock operation. No preparation request has been made yet.
                    </div>
                ) : (
                    <div className="w-full max-w-sm flex flex-col gap-3 pointer-events-auto">
                        {canChooseMode && (
                            <div role="group" aria-label="Processing mode for protected input" className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] p-1">
                                {(["device", "auto", "cloud"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        aria-pressed={selectedMode === mode}
                                        disabled={isPreparing || (mode === "device" && deviceLockedOut)}
                                        onClick={() => setQueue((current) => current ? { ...current, processingMode: mode } : current)}
                                        className={`rounded-md px-2 py-2 text-xs capitalize disabled:opacity-50 ${selectedMode === mode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
                                    >
                                        {mode === "device" ? "Device" : mode === "auto" ? "Auto" : "Cloud"}
                                    </button>
                                ))}
                            </div>
                        )}

                        {deviceLockedOut && (
                            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                                A Cloud request was already started for this source. File delivery may have occurred, so Device-only mode is unavailable.
                            </p>
                        )}

                        <PasswordField
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Enter PDF password"
                            autoComplete="off"
                            disabled={isPreparing}
                            aria-label="PDF password"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none text-center shadow-sm"
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && password && !isPreparing) void handleProtectedFile();
                            }}
                        />

                        {cloudOnly ? (
                            <p className="text-xs text-[var(--muted)]">
                                Local password preparation and Cloud processing have separate consent steps. No file or password is sent during local unlock.
                            </p>
                        ) : cloudConsent ? (
                            <p className="text-xs text-[var(--muted)]">
                                Local password preparation and any Cloud submission have separate consent steps. No file or password is sent during local unlock.
                            </p>
                        ) : selectedMode === "cloud" ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Clicking “Authorize Cloud unlock” sends this encrypted PDF and its password to Platen Cloud now. Auto fallback alone does not authorize this request.
                            </p>
                        ) : (
                            <p className="text-xs text-[var(--muted)]">
                                The password is used for local unlock now. Auto applies only to later processing; a local unlock failure will not fall back to Cloud.
                            </p>
                        )}

                        {error && <span role="alert" className="text-[11px] text-rose-600 text-center">{error}</span>}
                        {isPreparing && activePreparationMode === "cloud" && hasCloudSubmissionInitiated(queue?.remaining[0]) && (
                            <span className="text-[11px] text-amber-700 dark:text-amber-300 text-center">
                                A Cloud request was started. Cancelling stops follow-on work, but file delivery may have occurred and cannot be recalled.
                            </span>
                        )}
                    </div>
                )}

                <div className="flex justify-center gap-3 mt-4">
                    <button
                        type="button"
                        onClick={() => {
                            const cloudRequestStarted = isPreparing && activePreparationMode === "cloud" &&
                                hasCloudSubmissionInitiated(queue?.remaining[0]);
                            cancelPreparation(isPreparing
                                ? cloudRequestStarted
                                    ? "Cancelled after a Cloud request started. File delivery may have occurred, and any transfer cannot be recalled."
                                    : "Preparation was cancelled before a Cloud request started. No file or password was sent."
                                : undefined);
                        }}
                        className="px-3 py-1.5 text-xs text-[var(--muted)]"
                    >
                        {isPreparing ? "Cancel preparation" : "Cancel all"}
                    </button>
                    {!failClosed && !explicitUnlock && (
                        <>
                            <button
                                type="button"
                                onClick={() => void handleProtectedFile()}
                                disabled={isPreparing || !password || (!cloudOnly && selectedMode === "device" && deviceLockedOut)}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPreparing
                                    ? <><Loader2 className="animate-spin" size={13} />{activePreparationMode === "cloud" ? "Authorizing Cloud unlock…" : "Preparing…"}</>
                                    : cloudOnly
                                        ? "Unlock locally"
                                        : selectedMode === "cloud" ? "Authorize Cloud unlock" : "Unlock on this device"}
                            </button>
                            {(cloudOnly || cloudConsent) && error && (
                                <button
                                    type="button"
                                onClick={() => void handleProtectedFile("cloud")}
                                    disabled={isPreparing || !password}
                                    className="px-4 py-1.5 text-xs font-medium text-amber-900 border border-amber-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed dark:text-amber-200"
                                >
                                    Authorize Cloud unlock
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    const fileInput = (
        <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleChange}
            aria-label={title}
            className={showDropZone ? "absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0" : "sr-only"}
        />
    );

    if (!showDropZone) {
        return <>{fileInput}{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}</>;
    }

    return (
        <div onDrop={handleDrop} onDragOver={handleDragOver} className="relative border border-dashed rounded-xl transition-all outline-none border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] overflow-hidden group shadow-sm">
            {fileInput}
            <div className="flex flex-col items-center justify-center py-14 px-6 w-full h-full select-none pointer-events-none text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--accent)] mb-4 group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--accent-subtle)] transition-colors">
                    {isInspecting ? <Loader2 className="animate-spin" size={22} /> : <UploadCloud size={22} />}
                </div>
                <p className="text-sm font-semibold text-[var(--foreground)] mb-1 group-hover:text-[var(--accent)] transition-colors">{title}</p>
                <p className="text-xs text-[var(--muted)] max-w-sm">{isInspecting ? "Checking PDF protection locally…" : description}</p>
            </div>
            {error && <p role="alert" className="absolute bottom-2 left-3 right-3 z-30 rounded bg-[var(--surface-card)] px-2 py-1 text-center text-[11px] text-rose-600">{error}</p>}
            {isInspecting && <ShieldAlert className="sr-only" aria-label="No file has been submitted while protection is checked" />}
        </div>
    );
}
