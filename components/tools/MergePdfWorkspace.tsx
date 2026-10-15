"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errorHandler";
import { notify } from "@/lib/notify";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileList from "@/components/pdf/PdfFileList";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfToolHero from "@/components/pdf/PdfToolHero";

import LazyPdfThumbnail from "@/components/pdf/LazyPdfThumbnail";

import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";
import { inspectPdfEncryption } from "@/lib/security/inspectPdfProtection";
import { verifyProtectedPdfBlob } from "@/lib/security/verifyProtectedPdf";
import {
    authorizeCloudProcessingInputs,
    capturePdfResultProvenance,
    getInitialProcessingMode,
    getPdfInputPreparation,
    hasProtectedPdfInputLineage,
    markCloudSubmissionInitiated,
    markPdfInputPreparation,
    requiresCloudProcessingAuthorizationForInput,
    revokeCloudProcessingAuthorization,
} from "@/lib/security/pdfInputPreparation";

type MergeOutputPolicy = "protected" | "unprotected" | null;

const MERGE_CLOUD_SCOPE = "merge-pdf";
const MERGE_LOCK_CLOUD_SCOPE = "merge-output-lock";

export default function MergePdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();

    const [files, setFiles] = useState<File[]>([]);
    const [isMerging, setIsMerging] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>(() => getInitialProcessingMode(file));
    const [outputPolicy, setOutputPolicy] = useState<MergeOutputPolicy>(null);
    const [newOutputPassword, setNewOutputPassword] = useState("");
    const [confirmOutputPassword, setConfirmOutputPassword] = useState("");
    const [confirmUnprotectedOutput, setConfirmUnprotectedOutput] = useState(false);
    const [authorizeCloudMerge, setAuthorizeCloudMerge] = useState(false);
    const [authorizeCloudOutputLock, setAuthorizeCloudOutputLock] = useState(false);
    const filesRef = useRef<File[]>([]);
    const operationIdRef = useRef(0);
    const activeAbortRef = useRef<AbortController | null>(null);
    const isMergingRef = useRef(false);
    const mountedRef = useRef(true);

    const resetOutputDecision = useCallback(() => {
        setOutputPolicy(null);
        setNewOutputPassword("");
        setConfirmOutputPassword("");
        setConfirmUnprotectedOutput(false);
        setAuthorizeCloudMerge(false);
        setAuthorizeCloudOutputLock(false);
    }, []);

    const invalidateOperation = useCallback((resetDecision = false, preservePublishedDownload = false) => {
        operationIdRef.current += 1;
        activeAbortRef.current?.abort();
        activeAbortRef.current = null;
        isMergingRef.current = false;
        setIsMerging(false);
        if (!preservePublishedDownload) setDownloadData(null);
        if (resetDecision) resetOutputDecision();
    }, [resetOutputDecision, setDownloadData]);

    const revokeCurrentMergeConsent = useCallback(() => {
        for (const currentFile of filesRef.current) {
            revokeCloudProcessingAuthorization(currentFile, MERGE_CLOUD_SCOPE);
        }
    }, []);

    const updateQueue = useCallback((nextFiles: File[], preservePublishedDownload = false) => {
        revokeCurrentMergeConsent();
        invalidateOperation(true, preservePublishedDownload);
        filesRef.current = nextFiles;
        setFiles(nextFiles);
    }, [invalidateOperation, revokeCurrentMergeConsent]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            activeAbortRef.current?.abort();
            activeAbortRef.current = null;
            isMergingRef.current = false;
        };
    }, []);

    const protectedOutputDecisionRequired = useMemo(
        () => files.some((item) =>
            hasProtectedPdfInputLineage(item) || requiresCloudProcessingAuthorizationForInput(item)
        ),
        [files],
    );
    const cloudInputConsentRequired = processingMode !== "device" &&
        files.some(requiresCloudProcessingAuthorizationForInput);
    const cloudOutputLockConsentRequired = protectedOutputDecisionRequired &&
        outputPolicy === "protected" && processingMode !== "device";
    const outputPolicyValid = !protectedOutputDecisionRequired ||
        outputPolicy === "protected" && Boolean(newOutputPassword) && newOutputPassword === confirmOutputPassword ||
        outputPolicy === "unprotected" && confirmUnprotectedOutput;
    const canSubmit = files.length >= 2 && !isMerging && outputPolicyValid &&
        (!cloudInputConsentRequired || authorizeCloudMerge) &&
        (!cloudOutputLockConsentRequired || authorizeCloudOutputLock);

    const changeMode = useCallback((nextMode: ProcessingMode) => {
        if (nextMode === processingMode) return;
        revokeCurrentMergeConsent();
        invalidateOperation(false);
        setAuthorizeCloudMerge(false);
        setAuthorizeCloudOutputLock(false);
        setProcessingMode(nextMode);
    }, [invalidateOperation, processingMode, revokeCurrentMergeConsent]);

    const addFiles = useCallback(async (
        newFiles: File[],
        acceptance?: { processingMode: ProcessingMode },
        preservePublishedDownload = false,
    ) => {
        if (acceptance && acceptance.processingMode !== processingMode) {
            changeMode(acceptance.processingMode);
        }
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        const validFiles = newFiles.filter(item => {
            if (item.size > MAX_FILE_SIZE) {
                notify(`${item.name} exceeds 50MB limit`, "error");
                return false;
            }
            return true;
        });

        const currentFiles = filesRef.current;
        const incomingUniqueFiles = validFiles.filter(item =>
            !currentFiles.some(p => p.name === item.name && p.size === item.size && p.lastModified === item.lastModified)
        );

        if (incomingUniqueFiles.length === 0) return;

        const combined = [...currentFiles, ...incomingUniqueFiles];
        updateQueue(combined.filter((item, index, self) =>
            index === self.findIndex((candidate) =>
                candidate.name === item.name &&
                candidate.size === item.size &&
                candidate.lastModified === item.lastModified
            )
        ), preservePublishedDownload);
    }, [changeMode, processingMode, updateQueue]);

    // Automatically ingest the initial full files collection matrix.
    useEffect(() => {
        if (file && files.length === 0) {
            const batch = (file as File & { initialBatch?: File[] }).initialBatch;
            let active = true;
            queueMicrotask(() => {
                // Hydrating a remounted workspace is passive Back navigation,
                // not a new user request. Keep its completed download available.
                if (active) void addFiles(batch?.length ? batch : [file], undefined, true);
            });
            return () => {
                active = false;
            };
        }
        return;
    }, [addFiles, file, files.length]);

    const removeFile = (indexToRemove: number) => {
        const updated = filesRef.current.filter((_, index) => index !== indexToRemove);
        updateQueue(updated);
        if (updated.length === 0) {
            setFile(null);
            router.push(`/${toolId}`);
        }
    };

    const clearFiles = () => {
        updateQueue([]);
        setFile(null);
        router.push(`/${toolId}`);
    };

    const moveUp = (index: number) => {
        const currentFiles = filesRef.current;
        if (index === 0 || index >= currentFiles.length) return;
        const updated = [...currentFiles];
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        updateQueue(updated);
    };

    const moveDown = (index: number) => {
        const currentFiles = filesRef.current;
        if (index === currentFiles.length - 1 || index < 0 || index >= currentFiles.length) return;
        const updated = [...currentFiles];
        [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
        updateQueue(updated);
    };

    const mergePdfs = () => {
        if (isMergingRef.current) return;
        // A new attempt supersedes the previous result even if auth is deferred.
        setDownloadData(null);

        // requireAuth may defer its callback while session state is refreshed.
        // Capture the exact operation before that delay and invalidate it when
        // the queue, venue, output choice, password, or consent changes.
        const submittedFiles = [...filesRef.current];
        const submittedMode = processingMode;
        const capturedPolicy = outputPolicy;
        const capturedPassword = newOutputPassword;
        const capturedConfirmPassword = confirmOutputPassword;
        const capturedUnprotectedConfirmation = confirmUnprotectedOutput;
        const capturedCloudMergeAuthorization = authorizeCloudMerge;
        const capturedCloudLockAuthorization = authorizeCloudOutputLock;
        const beforeAuthGeneration = operationIdRef.current;

        requireAuth(async () => {
            if (!mountedRef.current || operationIdRef.current !== beforeAuthGeneration ||
                filesRef.current.length !== submittedFiles.length ||
                filesRef.current.some((current, index) => current !== submittedFiles[index]) ||
                isMergingRef.current) return;

            const requiresOutputChoice = submittedFiles.some((item) =>
                hasProtectedPdfInputLineage(item) || requiresCloudProcessingAuthorizationForInput(item)
            );
            const needsCloudInputConsent = submittedMode !== "device" &&
                submittedFiles.some(requiresCloudProcessingAuthorizationForInput);
            const needsCloudLockConsent = requiresOutputChoice &&
                capturedPolicy === "protected" && submittedMode !== "device";

            if (submittedFiles.length < 2) {
                notify("Please select at least 2 PDF files.","error");
                return;
            }

            if (requiresOutputChoice && !capturedPolicy) {
                notify("Choose whether the merged output will be password-protected.", "error");
                return;
            }
            if (capturedPolicy === "protected" && (!capturedPassword || capturedPassword !== capturedConfirmPassword)) {
                notify("Enter and confirm a new password for the merged PDF.", "error");
                return;
            }
            if (capturedPolicy === "unprotected" && !capturedUnprotectedConfirmation) {
                notify("Confirm that the merged PDF will not be password-protected.", "error");
                return;
            }
            if (needsCloudInputConsent && !capturedCloudMergeAuthorization) {
                notify("Authorize Cloud processing for these Merge inputs or choose Device mode.", "error");
                return;
            }
            if (needsCloudLockConsent && !capturedCloudLockAuthorization) {
                notify("Authorize the separate Cloud output-protection request or choose Device mode.", "error");
                return;
            }

            if (needsCloudInputConsent) {
                authorizeCloudProcessingInputs(
                    submittedFiles.filter(requiresCloudProcessingAuthorizationForInput),
                    MERGE_CLOUD_SCOPE,
                );
            }

            const operationId = ++operationIdRef.current;
            const controller = new AbortController();
            activeAbortRef.current = controller;
            isMergingRef.current = true;
            setIsMerging(true);
            const isCurrent = () => mountedRef.current &&
                operationIdRef.current === operationId && !controller.signal.aborted;

            try {
                const result = await ExecutionManager.run({
                    tool: "merge",
                    files: submittedFiles,
                    mode: submittedMode,
                    signal: controller.signal,
                    cloudAuthorizationTool: MERGE_CLOUD_SCOPE,
                });
                if (!isCurrent()) return;

                let publishBlob = result.blob;
                if (requiresOutputChoice) {
                    const mergedOutputIsEncrypted = await inspectPdfEncryption(result.blob);
                    if (!isCurrent()) return;
                    if (mergedOutputIsEncrypted) {
                        throw new Error("The Merge service returned a protected intermediate. The output could not be safely verified.");
                    }

                    if (capturedPolicy === "protected") {
                        const mergedFileName = result.fileName || "merged-document.pdf";
                        const mergedFile = new File([result.blob], mergedFileName, { type: "application/pdf" });
                        markPdfInputPreparation(mergedFile, {
                            sourceProtected: submittedFiles.some(hasProtectedPdfInputLineage),
                            bytesState: "plain",
                            preparedOn: result.executionMode === "client" ? "device" : "cloud",
                            processingMode: submittedMode,
                            cloudSubmissionInitiated: false,
                            derivedFromProtectedInput: submittedFiles.some(hasProtectedPdfInputLineage),
                        });
                        if (submittedMode !== "device") {
                            authorizeCloudProcessingInputs([mergedFile], MERGE_LOCK_CLOUD_SCOPE);
                        }

                        const protectedResult = await ExecutionManager.run({
                            tool: "lock",
                            files: [mergedFile],
                            mode: submittedMode,
                            password: capturedPassword,
                            params: { password: capturedPassword },
                            signal: controller.signal,
                            cloudAuthorizationTool: submittedMode === "device" ? undefined : MERGE_LOCK_CLOUD_SCOPE,
                            onCloudSubmissionInitiated: () => markCloudSubmissionInitiated(submittedFiles),
                        });
                        if (!isCurrent()) return;
                        await verifyProtectedPdfBlob(protectedResult.blob, capturedPassword, controller.signal);
                        if (!isCurrent()) return;
                        publishBlob = protectedResult.blob;
                    }
                }

                if (!isCurrent()) return;
                setDownloadData({
                    blob: publishBlob,
                    fileName: result.fileName || "merged-document.pdf",
                    provenance: capturePdfResultProvenance(submittedFiles, toolId),
                });

                router.push(`/${toolId}/download`);
            } catch (error) {
                if (!isCurrent()) return;
                const message = requiresOutputChoice
                    ? "Merge or output-password verification failed. No download was published."
                    : getFriendlyErrorMessage(error);
                notify(message, "error");
            } finally {
                if (isCurrent()) {
                    isMergingRef.current = false;
                    activeAbortRef.current = null;
                    setIsMerging(false);
                    setNewOutputPassword("");
                    setConfirmOutputPassword("");
                }
            }
        });
    };

    const handleFilesSelected = useCallback(() => {
        revokeCurrentMergeConsent();
        invalidateOperation(true);
    }, [invalidateOperation, revokeCurrentMergeConsent]);

    const handleOutputPolicyChange = (policy: MergeOutputPolicy) => {
        invalidateOperation(false);
        setOutputPolicy(policy);
        setNewOutputPassword("");
        setConfirmOutputPassword("");
        setConfirmUnprotectedOutput(false);
        setAuthorizeCloudOutputLock(false);
    };

    const totalSizeMB = (files.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024).toFixed(2);

    if (files.length === 0) return null;

    return (
        <>
            <PdfToolHero
                title="Merge PDF"
                description="Combine multiple PDF files into a single document."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <PdfUploader
                    onFilesAccepted={addFiles}
                    onFilesSelected={handleFilesSelected}
                    title="Upload Additional PDFs"
                    description="Select multiple PDFs to merge"
                    multiple={true}
                    accept=".pdf"
                    processingMode={processingMode}
                    protectedFileHandling="current-mode"
                />

                <div className="mt-6 mb-6">
                    <ProcessingModeSelector
                        mode={processingMode}
                        onChange={changeMode}
                        toolPolicy="CLIENT_PREFERRED"
                        disabled={isMerging}
                        cloudSubmissionInitiated={files.some((item) =>
                            getPdfInputPreparation(item)?.cloudSubmissionInitiated === true
                        )}
                    />
                </div>

                {protectedOutputDecisionRequired && (
                    <fieldset
                        role="group"
                        aria-label="Merged output protection"
                        disabled={isMerging}
                        className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"
                    >
                        <legend className="px-2 text-sm font-semibold">Choose protection for the merged PDF</legend>
                        <p className="mb-4 text-sm text-[color:var(--muted)]">
                            Source passwords are used only to prepare their individual PDFs. They will not be sent with the Merge request or reused for the output.
                        </p>
                        <label className="flex items-start gap-3 py-2 text-sm">
                            <input
                                type="radio"
                                name="merge-output-policy"
                                value="protected"
                                checked={outputPolicy === "protected"}
                                onChange={() => handleOutputPolicyChange("protected")}
                            />
                            <span>
                                <span className="block font-medium">Protect merged output with a new password</span>
                                <span className="block text-[color:var(--muted)]">The final file is published only after password protection is independently verified.</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 py-2 text-sm">
                            <input
                                type="radio"
                                name="merge-output-policy"
                                value="unprotected"
                                checked={outputPolicy === "unprotected"}
                                onChange={() => handleOutputPolicyChange("unprotected")}
                            />
                            <span>
                                <span className="block font-medium">Create an unprotected merged PDF</span>
                                <span className="block text-[color:var(--muted)]">Choose this only if the merged document should not require a password.</span>
                            </span>
                        </label>

                        {outputPolicy === "protected" && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="text-sm font-medium">
                                    New output password
                                    <input
                                        aria-label="New output password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={newOutputPassword}
                                        disabled={isMerging}
                                        onChange={(event) => {
                                            invalidateOperation(false);
                                            setNewOutputPassword(event.target.value);
                                        }}
                                        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2"
                                    />
                                </label>
                                <label className="text-sm font-medium">
                                    Confirm output password
                                    <input
                                        aria-label="Confirm output password"
                                        type="password"
                                        autoComplete="new-password"
                                        value={confirmOutputPassword}
                                        disabled={isMerging}
                                        onChange={(event) => {
                                            invalidateOperation(false);
                                            setConfirmOutputPassword(event.target.value);
                                        }}
                                        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2"
                                    />
                                </label>
                            </div>
                        )}

                        {outputPolicy === "unprotected" && (
                            <label className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={confirmUnprotectedOutput}
                                    disabled={isMerging}
                                    onChange={(event) => {
                                        invalidateOperation(false);
                                        setConfirmUnprotectedOutput(event.target.checked);
                                    }}
                                />
                                <span>I understand and confirm that the merged PDF will not be password-protected.</span>
                            </label>
                        )}
                    </fieldset>
                )}

                {cloudInputConsentRequired && (
                    <div role="group" aria-label="Cloud Merge authorization" className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            Auto may send these prepared protected or unverified inputs to Platen Cloud if local Merge cannot complete. Cloud mode sends them directly. Choosing Device keeps the Merge attempt local.
                        </p>
                        <label className="mt-3 flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                aria-label="Authorize Cloud Merge"
                                checked={authorizeCloudMerge}
                                disabled={isMerging}
                                onChange={(event) => {
                                    invalidateOperation(false);
                                    setAuthorizeCloudMerge(event.target.checked);
                                }}
                            />
                            <span>I authorize Cloud processing for the PDFs currently in this Merge queue.</span>
                        </label>
                    </div>
                )}

                {cloudOutputLockConsentRequired && (
                    <div role="group" aria-label="Cloud output protection authorization" className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
                        <p className="text-sm text-[color:var(--muted-foreground)]">
                            Protecting this output may send the merged PDF and the new output password to Platen Cloud if Cloud is selected or Auto cannot lock it locally.
                        </p>
                        <label className="mt-3 flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                aria-label="Authorize Cloud output protection request"
                                checked={authorizeCloudOutputLock}
                                disabled={isMerging}
                                onChange={(event) => {
                                    invalidateOperation(false);
                                    setAuthorizeCloudOutputLock(event.target.checked);
                                }}
                            />
                            <span>I separately authorize this Cloud output-protection request if it is needed.</span>
                        </label>
                    </div>
                )}

                <div className="mt-8">
                    <h3 className="text-md font-semibold text-[color:var(--muted)] mb-4">Document Queue Layout Sequence</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                        {files.map((item, idx) => {
                            const fileKey = `${item.name}-${item.size}-${item.lastModified}`;

                            return (
                                <div key={fileKey} className="relative group border border-[color:var(--border)] bg-[color:var(--background)] p-2 rounded-2xl flex flex-col items-center justify-between aspect-[1/1.3] overflow-hidden shadow-sm">
                                    <div className="w-full flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-[color:var(--card)] relative">
                                        <LazyPdfThumbnail file={item} page={1} scale={0.2} className="w-full h-full">
                                            {({ src, isLoading }) =>
                                                src ? (
                                                    <img src={src} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-[color:var(--muted)] opacity-50">
                                                        <FileText size={28} className="mb-1" />
                                                        {isLoading && <Loader2 size={14} className="animate-spin" />}
                                                    </div>
                                                )
                                            }
                                        </LazyPdfThumbnail>
                                        <div className="absolute top-2 left-2 bg-indigo-500 text-white rounded-lg text-[10px] font-bold px-2 py-0.5 shadow">
                                            #{idx + 1}
                                        </div>
                                    </div>
                                    <div className="w-full mt-2 text-center">
                                        <p data-testid="merge-queue-file" className="text-xs font-semibold truncate max-w-full px-1 text-[color:var(--foreground)]">{item.name}</p>
                                        <p className="text-[10px] text-[color:var(--muted)]">{(item.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <PdfFileList
                    files={files}
                    totalSizeMB={totalSizeMB}
                    onMoveUp={moveUp}
                    onMoveDown={moveDown}
                    onRemove={removeFile}
                    onClear={clearFiles}
                />

                <PdfActionButton
                    text={`Merge ${files.length} PDFs`}
                    loadingText="Merging and verifying output..."
                    loading={isMerging}
                    disabled={!canSubmit}
                    onClick={mergePdfs}
                />
            </div>
        </>
    );
}
