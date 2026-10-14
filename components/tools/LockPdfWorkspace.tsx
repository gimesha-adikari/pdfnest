"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import PdfFileInfo from "@/components/pdf/PdfFileInfo";
import PdfActionButton from "@/components/pdf/PdfActionButton";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import { ExecutionManager } from "@/lib/execution/ExecutionManager";
import { ProcessingModeSelector } from "@/components/shared/ProcessingModeSelector";
import { ProcessingMode } from "@/lib/execution/types";
import { getInitialProcessingMode, hasCloudSubmissionInitiated } from "@/lib/security/pdfInputPreparation";
import { verifyProtectedPdfBlob } from "@/lib/security/verifyProtectedPdf";
import PasswordField from "@/components/ui/PasswordField";

function formatMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
}

export default function LockPdfWorkspace() {
    const { requireAuth } = useAuth();
    const router = useRouter();
    const { toolId, file, setFile, setDownloadData } = useSharedTool();
    const cloudSubmissionInitiated = hasCloudSubmissionInitiated(file);

    const [password, setPassword] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [processingMode, setProcessingMode] = useState<ProcessingMode>(() => getInitialProcessingMode(file));
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const isProcessingRef = useRef(false);
    const operationIdRef = useRef(0);
    const activeControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(false);
    const previousFileRef = useRef(file);
    const latestInputsRef = useRef({ file, password, processingMode });

    useEffect(() => {
        latestInputsRef.current = { file, password, processingMode };
    }, [file, password, processingMode]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            activeControllerRef.current?.abort();
            activeControllerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (previousFileRef.current !== file) {
            previousFileRef.current = file;
            operationIdRef.current += 1;
            activeControllerRef.current?.abort();
            activeControllerRef.current = null;
            isProcessingRef.current = false;
            setIsProcessing(false);
            setPassword("");
            setSuccess(false);
            setErrorMessage(null);
        }

        if (!file) {
            setPassword("");
            setSuccess(false);
            setErrorMessage(null);
        }
    }, [file]);

    const fileExtractedSize = useMemo(() => {
        if (!file) return "0.00";
        return formatMB(file.size);
    }, [file]);

    const handleLockProcessing = async () => {
        if (!file || !password) return;

        const operation = { file, password, mode: processingMode };
        requireAuth(async () => {
            const currentInputs = latestInputsRef.current;
            if (
                isProcessingRef.current ||
                !mountedRef.current ||
                currentInputs.file !== operation.file ||
                currentInputs.password !== operation.password ||
                currentInputs.processingMode !== operation.mode
            ) return;

            isProcessingRef.current = true;
            const operationId = ++operationIdRef.current;
            const controller = new AbortController();
            activeControllerRef.current = controller;
            const isCurrentOperation = () => {
                const latestInputs = latestInputsRef.current;
                return mountedRef.current &&
                    operationIdRef.current === operationId &&
                    activeControllerRef.current === controller &&
                    !controller.signal.aborted &&
                    latestInputs.file === operation.file &&
                    latestInputs.password === operation.password &&
                    latestInputs.processingMode === operation.mode;
            };

            try {
                setIsProcessing(true);
                setSuccess(false);
                setErrorMessage(null);

                const result = await ExecutionManager.run({
                    tool: "lock",
                    files: [operation.file],
                    params: { password: operation.password },
                    mode: operation.mode,
                    password: operation.password,
                    signal: controller.signal,
                });

                // ExecutionManager success does not prove that Lock produced a
                // password-protected PDF. Validate its actual result before any
                // download state, success message, or navigation is published.
                await verifyProtectedPdfBlob(result.blob, operation.password, controller.signal);
                if (!isCurrentOperation()) return;

                setDownloadData({
                    blob: result.blob,
                    fileName: `${operation.file.name.replace(/\.pdf$/i, "")}-locked.pdf`,
                });

                setSuccess(true);
                setPassword("");
                router.push(`/${toolId}/download`);
            } catch {
                if (isCurrentOperation()) {
                    setErrorMessage("PDF protection could not be confirmed; no download was created. Please try again.");
                }
            } finally {
                if (operationIdRef.current === operationId) {
                    isProcessingRef.current = false;
                    if (activeControllerRef.current === controller) {
                        activeControllerRef.current = null;
                    }
                    if (mountedRef.current) setIsProcessing(false);
                }
            }
        });
    };

    if (!file) return null;

    return (
        <>
            <PdfToolHero
                title="Protect PDF"
                description="Secure your documents by applying robust high-grade permissions encryption configurations via standard native server configurations."
            />
            <div className="mt-12 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg w-full">
                <div className="mt-8 space-y-6">
                    <PdfFileInfo
                        file={file}
                        onClear={() => {
                            setFile(null);
                            router.push(`/${toolId}`);
                        }}
                    />

                    <div className="rounded-2xl border border-[color:var(--border)] p-5">
                        <h3 className="text-lg font-semibold flex items-center gap-2 text-[color:var(--foreground)]">
                            <Lock size={18} className="text-indigo-500" /> Apply Structural Cipher Restriction
                        </h3>
                        <div className="mt-4">
                            <label className="text-sm font-medium text-[color:var(--muted)]">
                                Secure Access Password Configuration
                            </label>
                            <PasswordField
                                value={password}
                                disabled={isProcessing}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (errorMessage) setErrorMessage(null);
                                }}
                                autoComplete="off"
                                placeholder="Configure strong access code strings"
                                className="mt-2 w-full rounded-xl border border-[color:var(--border)] bg-transparent p-3 text-sm outline-none transition focus:border-indigo-500 text-[color:var(--foreground)]"
                            />
                        </div>
                    </div>

                    {/* Processing Mode Selector */}
                    <div className="space-y-3">
                        <ProcessingModeSelector
                            mode={processingMode}
                            onChange={setProcessingMode}
                            disabled={isProcessing}
                        />

                        <div className="flex items-center gap-2 text-xs text-[color:var(--muted)] px-1">
                            <Lock size={12} className="text-emerald-500 shrink-0" />
                            <span>
                                {processingMode === "cloud"
                                    ? "Cloud Mode: File and password are encrypted on high-performance cloud infrastructure."
                                    : cloudSubmissionInitiated
                                        ? "A Cloud request was started for this input. File delivery may have occurred, and changing modes cannot recall the request."
                                        : processingMode === "device"
                                            ? "Device mode runs this operation in your browser when the local engine supports it."
                                            : "Auto uses the local engine when eligible and may use Cloud processing when needed."}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] p-4">
                        <p className="text-sm text-[color:var(--muted)]">Target document footprint</p>
                        <p className="mt-1 text-2xl font-bold text-[color:var(--foreground)]">{fileExtractedSize} MB</p>
                    </div>

                    {errorMessage && (
                        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-900 dark:text-red-200 flex items-start gap-3">
                            <ShieldAlert className="text-red-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Encryption Failed</p>
                                <p className="text-xs mt-0.5 text-red-800/80 dark:text-red-200/70">
                                    {errorMessage}
                                </p>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
                            <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-sm font-semibold">Security configuration execution success!</p>
                                <p className="text-xs mt-1 text-emerald-800/80 dark:text-emerald-200/70">
                                    The PDF was verified to require the password you entered before it was made available for download.
                                </p>
                            </div>
                        </div>
                    )}

                    <PdfActionButton
                        text="Encrypt and Protect PDF"
                        loadingText="Executing Cipher Restriction Routine..."
                        loading={isProcessing}
                        disabled={!password || isProcessing}
                        onClick={handleLockProcessing}
                    />
                </div>
            </div>
        </>
    );
}
